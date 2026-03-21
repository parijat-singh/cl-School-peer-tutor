// GET /booking-requests/mine?role=tutor|tutee

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json } from "../../shared/response.js";
import { queryParam } from "../../shared/router.js";

export async function getMyBookingRequests(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const role = queryParam(event, "role") ?? "tutee";

  const indexName = role === "tutor" ? "tutorId-status-index" : "tuteeId-createdAt-index";
  const keyField = role === "tutor" ? "tutorId" : "tuteeId";

  const result = await ddb.send(new QueryCommand({
    TableName: Tables.BookingRequests,
    IndexName: indexName,
    KeyConditionExpression: `${keyField} = :uid`,
    ExpressionAttributeValues: { ":uid": caller.uid },
    ScanIndexForward: false,
  }));

  return json({ requests: result.Items ?? [] });
}
