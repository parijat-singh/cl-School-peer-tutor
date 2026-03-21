// POST /auth/admin-suspend-user
// POST /auth/admin-unsuspend-user

import { addDays } from "date-fns";
import { GetCommand, UpdateCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { cognitoDisableUser, cognitoEnableUser, cognitoUpdateAttributes } from "../../shared/cognito-admin.js";

export async function adminSuspendUser(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (!["schooladmin", "superadmin"].includes(caller.role)) {
    return error(403, "Admins only.");
  }

  const body = parseBody<{
    targetUid: string;
    durationDays: number | null;
    reason: string;
  }>(event);
  if (!body?.targetUid || !body.reason) return error(400, "targetUid and reason required.");
  if (body.durationDays !== null && (body.durationDays < 1 || body.durationDays > 90)) {
    return error(400, "Duration must be 1-90 days or null (indefinite).");
  }

  const targetResult = await ddb.send(new GetCommand({
    TableName: Tables.Users,
    Key: { uid: body.targetUid },
  }));
  if (!targetResult.Item) return error(404, "User not found.");

  const target = targetResult.Item;
  if (caller.role === "schooladmin" && target.schoolDomain !== caller.schoolDomain) {
    return error(403, "Cross-school action denied.");
  }

  const now = new Date().toISOString();
  const suspendedUntil = body.durationDays
    ? addDays(new Date(), body.durationDays).toISOString()
    : null;

  // Update user status
  await ddb.send(new UpdateCommand({
    TableName: Tables.Users,
    Key: { uid: body.targetUid },
    UpdateExpression: "SET #status = :suspended, suspendedUntil = :until, updatedAt = :now",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":suspended": "suspended",
      ":until": suspendedUntil,
      ":now": now,
    },
  }));

  // Audit log
  await ddb.send(new PutCommand({
    TableName: Tables.AdminAuditLog,
    Item: {
      schoolDomain: target.schoolDomain ?? "_global",
      timestampLogId: `${now}#${ulid()}`,
      adminUid: caller.uid,
      action: "suspend_user",
      targetId: body.targetUid,
      reason: body.reason,
      metadata: { durationDays: body.durationDays },
      timestamp: now,
    },
  }));

  // Disable in Cognito
  try { await cognitoDisableUser(body.targetUid); } catch { /* may not exist */ }
  try { await cognitoUpdateAttributes(body.targetUid, { "custom:status": "suspended" }); } catch { /* ignore */ }

  // Cancel all upcoming sessions for this user
  const schoolDomain = target.schoolDomain as string;
  const sessionsResult = await ddb.send(new QueryCommand({
    TableName: Tables.Sessions,
    IndexName: "schoolDomain-status-index",
    KeyConditionExpression: "schoolDomain = :domain AND #status = :upcoming",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":domain": schoolDomain, ":upcoming": "upcoming" },
  }));

  const sessionsToCancel = (sessionsResult.Items ?? []).filter(
    (s) => s.tutorId === body.targetUid || s.tuteeId === body.targetUid
  );

  for (const session of sessionsToCancel) {
    await ddb.send(new UpdateCommand({
      TableName: Tables.Sessions,
      Key: { sessionId: session.sessionId },
      UpdateExpression: "SET #status = :cancelled, cancelledBy = :admin, cancelledAt = :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":cancelled": "cancelled", ":admin": "admin", ":now": now },
    }));

    // Free the slot
    await ddb.send(new UpdateCommand({
      TableName: Tables.AvailabilitySlots,
      Key: { tutorId: session.tutorId, slotId: session.slotId },
      UpdateExpression: "SET booked = :false REMOVE bookedBy",
      ExpressionAttributeValues: { ":false": false },
    }));
  }

  return json({ success: true });
}

export async function adminUnsuspendUser(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (!["schooladmin", "superadmin"].includes(caller.role)) {
    return error(403, "Admins only.");
  }

  const body = parseBody<{ targetUid: string }>(event);
  if (!body?.targetUid) return error(400, "targetUid required.");

  const targetResult = await ddb.send(new GetCommand({
    TableName: Tables.Users,
    Key: { uid: body.targetUid },
  }));
  if (!targetResult.Item) return error(404, "User not found.");

  const target = targetResult.Item;
  if (caller.role === "schooladmin" && target.schoolDomain !== caller.schoolDomain) {
    return error(403, "Cross-school action denied.");
  }

  const now = new Date().toISOString();

  await ddb.send(new UpdateCommand({
    TableName: Tables.Users,
    Key: { uid: body.targetUid },
    UpdateExpression: "SET #status = :active, suspendedUntil = :null, updatedAt = :now",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":active": "active", ":null": null, ":now": now },
  }));

  // Audit log
  await ddb.send(new PutCommand({
    TableName: Tables.AdminAuditLog,
    Item: {
      schoolDomain: target.schoolDomain ?? "_global",
      timestampLogId: `${now}#${ulid()}`,
      adminUid: caller.uid,
      action: "unsuspend_user",
      targetId: body.targetUid,
      timestamp: now,
    },
  }));

  // Enable in Cognito
  try { await cognitoEnableUser(body.targetUid); } catch { /* may not exist */ }
  try { await cognitoUpdateAttributes(body.targetUid, { "custom:status": "active" }); } catch { /* ignore */ }

  return json({ success: true });
}
