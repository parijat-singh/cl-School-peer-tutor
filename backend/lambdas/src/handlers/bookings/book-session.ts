// POST /bookings/book-session
// Atomic slot booking with double-booking prevention via DynamoDB TransactWriteItems.

import { z } from "zod";
import { GetCommand, UpdateCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import { format } from "date-fns";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { checkAndConsumeRateLimit } from "../../shared/rate-limit.js";
import { dateOnlyToNoonUtcDate } from "../../shared/dates.js";
import { provisionMeetLink } from "../../shared/google-meet.js";
import { sendBookingConfirmation } from "../../shared/email.js";
import { captureError } from "../../shared/sentry.js";

const schema = z.object({
  tutorId:       z.string().min(1),
  slotId:        z.string().min(1),
  subject:       z.string().min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduledDate must be YYYY-MM-DD"),
});

export async function bookSession(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const uid = caller.uid;

  // Rate limiting
  const ok = await checkAndConsumeRateLimit(`bookSession:${uid}`, 10, 60_000);
  if (!ok) return error(429, "Too many booking attempts. Wait 1 minute.");

  const body = parseBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, "Invalid booking request.");

  const { tutorId, slotId, subject, scheduledDate } = parsed.data;
  const scheduledNoon = dateOnlyToNoonUtcDate(scheduledDate);

  // Load tutee and tutor profiles
  const [tuteeResult, tutorResult, slotResult] = await Promise.all([
    ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid } })),
    ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid: tutorId } })),
    ddb.send(new GetCommand({ TableName: Tables.AvailabilitySlots, Key: { tutorId, slotId } })),
  ]);

  if (!tuteeResult.Item || tuteeResult.Item.status !== "active") {
    return error(403, "Account is not active.");
  }
  if (!tutorResult.Item) return error(404, "Tutor not found.");
  if (!slotResult.Item) return error(404, "Availability slot not found.");

  const tutee = tuteeResult.Item;
  const tutor = tutorResult.Item;
  const slot = slotResult.Item;

  if (tutor.schoolDomain !== tutee.schoolDomain) {
    return error(403, "Tutor is from a different school.");
  }
  if (slot.booked) {
    return error(409, "This slot was just booked by someone else. Please choose another.");
  }

  const sessionId = ulid();
  const now = new Date().toISOString();

  // Atomic transaction: mark slot booked + create session
  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: Tables.AvailabilitySlots,
            Key: { tutorId, slotId },
            UpdateExpression: "SET booked = :true, bookedBy = :uid",
            ConditionExpression: "booked = :false",
            ExpressionAttributeValues: { ":true": true, ":false": false, ":uid": uid },
          },
        },
        {
          Put: {
            TableName: Tables.Sessions,
            Item: {
              sessionId,
              tutorId,
              tuteeId: uid,
              tutorName: tutor.name,
              tuteeName: tutee.name,
              subject,
              slotId,
              day: slot.day,
              startTime: slot.startTime,
              endTime: slot.endTime,
              duration: slot.duration,
              scheduledDate: `${scheduledDate}T12:00:00.000Z`,
              status: "upcoming",
              meetLink: null,
              calendarEventId: null,
              meetLinkStatus: "pending",
              schoolDomain: tutee.schoolDomain,
              tutorRated: false,
              tuteeRated: false,
              createdAt: now,
            },
          },
        },
      ],
    }));
  } catch (err: unknown) {
    const e = err as Error & { name?: string };
    if (e.name === "TransactionCanceledException") {
      return error(409, "This slot was just booked by someone else. Please choose another.");
    }
    throw err;
  }

  // Provision Google Meet link (outside transaction)
  let meetLink: string | null = null;
  let meetLinkStatus = "pending";

  try {
    const meet = await provisionMeetLink({
      sessionId,
      tutorEmail: tutor.email as string,
      tuteeEmail: tutee.email as string,
      subject,
      scheduledDate,
      startTime: slot.startTime as string,
      endTime: slot.endTime as string,
      tutorName: tutor.name as string,
      tuteeName: tutee.name as string,
    });
    meetLink = meet.meetLink;
    meetLinkStatus = "ready";

    await ddb.send(new UpdateCommand({
      TableName: Tables.Sessions,
      Key: { sessionId },
      UpdateExpression: "SET meetLink = :link, calendarEventId = :eventId, meetLinkStatus = :status",
      ExpressionAttributeValues: {
        ":link": meet.meetLink,
        ":eventId": meet.calendarEventId,
        ":status": "ready",
      },
    }));
  } catch (err) {
    captureError(err, { function: "bookSession", action: "meetProvisioning" });
    console.error("Meet provisioning failed:", err);
    meetLinkStatus = "failed";
    await ddb.send(new UpdateCommand({
      TableName: Tables.Sessions,
      Key: { sessionId },
      UpdateExpression: "SET meetLinkStatus = :status",
      ExpressionAttributeValues: { ":status": "failed" },
    }));
  }

  // Send confirmation emails
  let emailSent = false;
  try {
    await sendBookingConfirmation({
      tutorEmail: tutor.email as string,
      tutorName: tutor.name as string,
      tuteeEmail: tutee.email as string,
      tuteeName: tutee.name as string,
      subject,
      day: slot.day as string,
      startTime: slot.startTime as string,
      endTime: slot.endTime as string,
      duration: slot.duration as number,
      scheduledDate: format(scheduledNoon, "EEEE, MMMM d, yyyy"),
      meetLink,
      sessionId,
    });
    emailSent = true;
  } catch (err) {
    captureError(err, { function: "bookSession", action: "bookingEmail" });
    console.error("Booking email failed:", err);
  }

  return json({
    sessionId,
    meetLink,
    meetLinkStatus,
    emailSent,
    message: meetLinkStatus === "ready"
      ? "Session booked! Google Meet link sent to your email."
      : "Session booked! Meet link will be emailed shortly.",
  });
}
