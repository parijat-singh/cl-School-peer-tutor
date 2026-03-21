// GET /schools/{domain}

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { json, error } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";

export async function getSchool(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const domain = pathParam(event, "domain");

  const result = await ddb.send(new GetCommand({ TableName: Tables.Schools, Key: { domain } }));
  if (!result.Item) return error(404, "School not found.");

  return json(result.Item);
}
