// GET /users/me — Returns the current user's profile.

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";

export async function getMe(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);

  const result = await ddb.send(new GetCommand({
    TableName: Tables.Users,
    Key: { uid: caller.uid },
  }));

  if (!result.Item) return error(404, "User not found.");

  return json(result.Item);
}
