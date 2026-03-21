// GET /reviews/school/{domain}

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { json } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";

export async function getSchoolReviews(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const domain = pathParam(event, "domain");

  const result = await ddb.send(new QueryCommand({
    TableName: Tables.Reviews,
    IndexName: "schoolDomain-createdAt-index",
    KeyConditionExpression: "schoolDomain = :domain",
    ExpressionAttributeValues: { ":domain": domain },
    ScanIndexForward: false,
  }));

  return json({ reviews: result.Items ?? [] });
}
