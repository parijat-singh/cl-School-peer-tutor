// POST /auth/promote-superadmin

import { z } from "zod";
import { GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { cognitoUpdateAttributes } from "../../shared/cognito-admin.js";

const schema = z.object({
  uid: z.string().min(1).max(128),
});

export async function promoteSuperAdmin(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (caller.role !== "superadmin") {
    return error(403, "Only super admins can promote users.");
  }

  const body = parseBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, "uid required");
  const { uid } = parsed.data;

  // Get target user
  const targetResult = await ddb.send(new GetCommand({
    TableName: Tables.Users,
    Key: { uid },
  }));
  if (!targetResult.Item) return error(404, "User not found.");

  const now = new Date().toISOString();

  // Update user role
  await ddb.send(new UpdateCommand({
    TableName: Tables.Users,
    Key: { uid },
    UpdateExpression: "SET #role = :role, updatedAt = :now",
    ExpressionAttributeNames: { "#role": "role" },
    ExpressionAttributeValues: { ":role": "superadmin", ":now": now },
  }));

  // Update Cognito
  try {
    await cognitoUpdateAttributes(uid, { "custom:role": "superadmin" });
  } catch { /* Cognito user may not exist */ }

  // Audit log
  await ddb.send(new PutCommand({
    TableName: Tables.AdminAuditLog,
    Item: {
      schoolDomain: targetResult.Item.schoolDomain ?? "_global",
      timestampLogId: `${now}#${ulid()}`,
      adminUid: caller.uid,
      action: "promote_superadmin",
      targetId: uid,
      metadata: { targetEmail: targetResult.Item.email },
      timestamp: now,
    },
  }));

  return json({ success: true });
}
