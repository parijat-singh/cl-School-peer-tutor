// POST /bookings/cancel-request
// Tutee cancels their own pending booking request.

import { z } from "zod";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";

const schema = z.object({
  requestId: z.string().min(1),
});

export async function cancelBookingRequest(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const body = parseBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, "Invalid request data.");

  const { requestId } = parsed.data;

  const reqResult = await ddb.send(new GetCommand({
    TableName: Tables.BookingRequests,
    Key: { requestId },
  }));
  if (!reqResult.Item) return error(404, "Booking request not found.");

  const req = reqResult.Item;
  if (req.tuteeId !== caller.uid) return error(403, "You can only cancel your own requests.");
  if (req.status !== "pending") return error(400, `Cannot cancel a request that is already ${req.status}.`);

  await ddb.send(new UpdateCommand({
    TableName: Tables.BookingRequests,
    Key: { requestId },
    UpdateExpression: "SET #status = :cancelled, respondedAt = :now",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":cancelled": "cancelled",
      ":now": new Date().toISOString(),
    },
  }));

  return json({ success: true });
}
