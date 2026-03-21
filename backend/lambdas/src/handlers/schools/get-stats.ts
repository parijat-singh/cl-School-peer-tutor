// GET /stats/{domain}

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { json, error } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";

export async function getStats(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const domain = pathParam(event, "domain");

  const result = await ddb.send(new GetCommand({ TableName: Tables.Stats, Key: { schoolDomain: domain } }));
  if (!result.Item) return json({ schoolDomain: domain, totalUsers: 0, activeTutors: 0, sessionsThisMonth: 0, totalSessions: 0, avgRating: 0 });

  return json(result.Item);
}
