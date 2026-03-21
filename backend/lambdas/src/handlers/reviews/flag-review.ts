// POST /reviews/{reviewId}/flag

import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";

export async function flagReview(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const reviewId = pathParam(event, "reviewId");

  await ddb.send(new UpdateCommand({
    TableName: Tables.Reviews,
    Key: { reviewId },
    UpdateExpression: "SET flagged = :true, flaggedBy = :uid",
    ExpressionAttributeValues: { ":true": true, ":uid": caller.uid },
  }));

  return json({ success: true });
}
