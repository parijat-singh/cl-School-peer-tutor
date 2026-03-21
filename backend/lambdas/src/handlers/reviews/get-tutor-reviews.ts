// GET /tutors/{uid}/reviews

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { json } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";

export async function getTutorReviews(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const uid = pathParam(event, "uid");

  const result = await ddb.send(new QueryCommand({
    TableName: Tables.Reviews,
    IndexName: "targetId-createdAt-index",
    KeyConditionExpression: "targetId = :uid",
    ExpressionAttributeValues: { ":uid": uid },
    ScanIndexForward: false,
  }));

  return json({ reviews: result.Items ?? [] });
}
