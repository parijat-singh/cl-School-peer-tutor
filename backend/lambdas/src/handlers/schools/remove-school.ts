// POST /schools/remove

import { GetCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";

export async function removeSchool(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (caller.role !== "superadmin") return error(403, "Only super admins can remove schools.");

  const body = parseBody<{ domain: string }>(event);
  if (!body?.domain) return error(400, "domain required.");

  const schoolResult = await ddb.send(new GetCommand({ TableName: Tables.Schools, Key: { domain: body.domain } }));
  if (!schoolResult.Item) return error(404, "School not found.");

  const now = new Date().toISOString();

  await ddb.send(new DeleteCommand({ TableName: Tables.Schools, Key: { domain: body.domain } }));

  await ddb.send(new PutCommand({
    TableName: Tables.AdminAuditLog,
    Item: {
      schoolDomain: body.domain,
      timestampLogId: `${now}#${ulid()}`,
      adminUid: caller.uid,
      action: "remove_school",
      targetId: body.domain,
      metadata: { schoolName: schoolResult.Item.name },
      timestamp: now,
    },
  }));

  return json({ success: true });
}
