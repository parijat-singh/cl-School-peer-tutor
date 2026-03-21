// POST /sessions/cancel

import { GetCommand, UpdateCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { sendCancellationEmail } from "../../shared/email.js";
import { deleteCalendarEvent } from "../../shared/google-meet.js";
import { captureError } from "../../shared/sentry.js";

export async function cancelSession(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const body = parseBody<{ sessionId: string; reason?: string }>(event);
  if (!body?.sessionId) return error(400, "sessionId required.");

  const { sessionId, reason } = body;

  const sessionResult = await ddb.send(new GetCommand({
    TableName: Tables.Sessions,
    Key: { sessionId },
  }));
  if (!sessionResult.Item) return error(404, "Session not found.");

  const session = sessionResult.Item;
  if (session.tutorId !== caller.uid && session.tuteeId !== caller.uid) {
    return error(403, "Not your session.");
  }
  if (session.status !== "upcoming") {
    return error(400, "Session is not upcoming.");
  }

  const cancelledBy = session.tutorId === caller.uid ? "tutor" : "tutee";
  const now = new Date().toISOString();

  // Transaction: cancel session + free slot
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Update: {
          TableName: Tables.Sessions,
          Key: { sessionId },
          UpdateExpression: "SET #status = :cancelled, cancelledAt = :now, cancelledBy = :by, cancelReason = :reason",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":cancelled": "cancelled",
            ":now": now,
            ":by": caller.uid,
            ":reason": reason ?? null,
          },
        },
      },
      {
        Update: {
          TableName: Tables.AvailabilitySlots,
          Key: { tutorId: session.tutorId, slotId: session.slotId },
          UpdateExpression: "SET booked = :false REMOVE bookedBy",
          ExpressionAttributeValues: { ":false": false },
        },
      },
    ],
  }));

  // Delete calendar event
  if (session.calendarEventId) {
    try {
      await deleteCalendarEvent(session.calendarEventId as string);
    } catch (err) {
      captureError(err, { function: "cancelSession", action: "calendarDelete" });
    }
  }

  // Notify the other party
  const [tutorResult, tuteeResult] = await Promise.all([
    ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid: session.tutorId } })),
    ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid: session.tuteeId } })),
  ]);

  const tutor = tutorResult.Item;
  const tutee = tuteeResult.Item;

  if (tutor && tutee) {
    const recipientEmail = cancelledBy === "tutor" ? tutee.email as string : tutor.email as string;
    const recipientName = cancelledBy === "tutor" ? tutee.name as string : tutor.name as string;
    const otherParty = cancelledBy === "tutor" ? tutor.name as string : tutee.name as string;

    try {
      await sendCancellationEmail({
        recipientEmail,
        recipientName,
        otherPartyName: otherParty,
        subject: session.subject as string,
        scheduledDate: session.scheduledDate as string,
        cancelledBy,
      });
    } catch (err) {
      captureError(err, { function: "cancelSession", action: "cancellationEmail" });
    }
  }

  return json({ success: true });
}
