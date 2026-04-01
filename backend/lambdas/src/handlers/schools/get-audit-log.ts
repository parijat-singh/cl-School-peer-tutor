// GET /audit-log/{domain}

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";

export async function getAuditLog(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (!["schooladmin", "superadmin"].includes(caller.role)) {
    return error(403, "Admins only.");
  }

  const domain = pathParam(event, "domain");
  if (caller.role === "schooladmin" && caller.schoolDomain !== domain) {
    return error(403, "Cross-school action denied.");
  }

  const result = await ddb.send(new QueryCommand({
    TableName: Tables.AdminAuditLog,
    KeyConditionExpression: "schoolDomain = :domain",
    ExpressionAttributeValues: { ":domain": domain },
    ScanIndexForward: false,
    Limit: 100,
  }));

  const entries = (result.Items ?? []).map((item) => ({ ...item, id: item.timestampLogId }));
  return json({ entries });
}
