// GET /schools

import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { json } from "../../shared/response.js";

export async function listSchools(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const result = await ddb.send(new ScanCommand({ TableName: Tables.Schools }));
  return json({ schools: result.Items ?? [] });
}
