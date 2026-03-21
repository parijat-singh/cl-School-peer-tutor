// GET /users/superadmins — Returns all superadmin users.

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";

export async function listSuperAdmins(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (caller.role !== "superadmin") {
    return error(403, "Super admins only.");
  }

  const result = await ddb.send(new QueryCommand({
    TableName: Tables.Users,
    IndexName: "role-index",
    KeyConditionExpression: "#role = :role",
    ExpressionAttributeNames: { "#role": "role" },
    ExpressionAttributeValues: { ":role": "superadmin" },
  }));

  return json({ users: result.Items ?? [] });
}
