// POST /bookings/request
// Tutee submits a booking request for a tutor's availability slot.

import { z } from "zod";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { sendBookingRequestEmail } from "../../shared/email.js";
import { captureError } from "../../shared/sentry.js";

const schema = z.object({
  tutorId:       z.string().min(1),
  slotId:        z.string().min(1),
  subject:       z.string().min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduledDate must be YYYY-MM-DD"),
});

export async function requestBooking(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const uid = caller.uid;

  const body = parseBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, "Invalid request data.");

  const { tutorId, slotId, subject, scheduledDate } = parsed.data;

  // Load profiles and slot
  const [tuteeResult, tutorResult, slotResult] = await Promise.all([
    ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid } })),
    ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid: tutorId } })),
    ddb.send(new GetCommand({ TableName: Tables.AvailabilitySlots, Key: { tutorId, slotId } })),
  ]);

  if (!tuteeResult.Item || tuteeResult.Item.status !== "active") {
    return error(403, "Your account is not active.");
  }
  if (!tutorResult.Item) return error(404, "Tutor not found.");
  if (!slotResult.Item) return error(404, "Availability slot not found.");

  const tutee = tuteeResult.Item;
  const tutor = tutorResult.Item;
  const slot = slotResult.Item;

  if (tutor.schoolDomain !== tutee.schoolDomain) {
    return error(403, "Tutor is from a different school.");
  }

  // Check if slot is already booked
  if (!slot.recurring && slot.booked) {
    return error(409, "This slot has already been booked.");
  }
  if (slot.recurring && slot.bookedDates?.[scheduledDate]) {
    return error(409, "This slot is already taken for that date.");
  }

  // Check for duplicate pending request from same tutee
  const dupResult = await ddb.send(new QueryCommand({
    TableName: Tables.BookingRequests,
    IndexName: "slotId-scheduledDate-index",
    KeyConditionExpression: "slotId = :slotId AND scheduledDate = :date",
    FilterExpression: "tuteeId = :uid AND #status = :pending",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":slotId": slotId,
      ":date": scheduledDate,
      ":uid": uid,
      ":pending": "pending",
    },
    Limit: 1,
  }));

  if (dupResult.Items && dupResult.Items.length > 0) {
    return error(409, "You already have a pending request for this slot.");
  }

  const requestId = ulid();
  const now = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: Tables.BookingRequests,
    Item: {
      requestId,
      tutorId,
      tuteeId: uid,
      tuteeName: tutee.name,
      tutorName: tutor.name,
      tuteeEmail: tutee.email,
      tutorEmail: tutor.email,
      slotId,
      subject,
      scheduledDate,
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      duration: slot.duration,
      recurring: slot.recurring ?? false,
      status: "pending",
      schoolDomain: tutee.schoolDomain,
      createdAt: now,
    },
  }));

  // Notify tutor by email
  let emailSent = false;
  try {
    await sendBookingRequestEmail({
      tutorEmail: tutor.email as string,
      tutorName: tutor.name as string,
      tuteeName: tutee.name as string,
      tuteeEmail: tutee.email as string,
      subject,
      scheduledDate,
      day: slot.day as string,
      startTime: slot.startTime as string,
      endTime: slot.endTime as string,
      duration: slot.duration as number,
      requestId,
    });
    emailSent = true;
  } catch (err) {
    captureError(err, { function: "requestBooking", action: "requestNotificationEmail" });
    console.error("Request notification email failed:", err);
  }

  return json({ requestId, emailSent });
}
