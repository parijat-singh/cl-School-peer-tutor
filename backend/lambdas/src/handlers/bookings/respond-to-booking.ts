// POST /bookings/respond
// Tutor accepts or rejects a pending booking request.
// On ACCEPT: TransactWriteItems to book slot + create session + update request + auto-reject siblings.
// On REJECT: simple update + email.

import { z } from "zod";
import { GetCommand, UpdateCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import { format } from "date-fns";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { dateOnlyToNoonUtcDate } from "../../shared/dates.js";
import { provisionMeetLink } from "../../shared/google-meet.js";
import { sendBookingConfirmation, sendRequestRejectedEmail } from "../../shared/email.js";
import { captureError } from "../../shared/sentry.js";

const schema = z.object({
  requestId:       z.string().min(1),
  action:          z.enum(["accept", "reject"]),
  rejectionReason: z.string().optional(),
});

export async function respondToBooking(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const uid = caller.uid;

  const body = parseBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, "Invalid request data.");

  const { requestId, action, rejectionReason } = parsed.data;

  const reqResult = await ddb.send(new GetCommand({
    TableName: Tables.BookingRequests,
    Key: { requestId },
  }));
  if (!reqResult.Item) return error(404, "Booking request not found.");

  const req = reqResult.Item;
  if (req.tutorId !== uid) return error(403, "You can only respond to your own booking requests.");
  if (req.status !== "pending") return error(400, `Request is already ${req.status}.`);

  const now = new Date().toISOString();

  // ── REJECT ─────────────────────────────────────────────────────
  if (action === "reject") {
    await ddb.send(new UpdateCommand({
      TableName: Tables.BookingRequests,
      Key: { requestId },
      UpdateExpression: "SET #status = :rejected, rejectionReason = :reason, respondedAt = :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":rejected": "rejected",
        ":reason": rejectionReason ?? "tutor_declined",
        ":now": now,
      },
    }));

    let emailSent = false;
    try {
      await sendRequestRejectedEmail({
        tuteeEmail: req.tuteeEmail as string,
        tuteeName: req.tuteeName as string,
        tutorName: req.tutorName as string,
        subject: req.subject as string,
        scheduledDate: req.scheduledDate as string,
        day: req.day as string,
        startTime: req.startTime as string,
        endTime: req.endTime as string,
        reason: "tutor_declined",
      });
      emailSent = true;
    } catch (err) {
      captureError(err, { function: "respondToBooking", action: "rejectionEmail" });
    }

    return json({ success: true, emailSent });
  }

  // ── ACCEPT ─────────────────────────────────────────────────────
  const sessionId = ulid();
  const scheduledNoon = dateOnlyToNoonUtcDate(req.scheduledDate as string);

  // Collect sibling pending requests for auto-rejection
  const siblingsResult = await ddb.send(new QueryCommand({
    TableName: Tables.BookingRequests,
    IndexName: "slotId-scheduledDate-index",
    KeyConditionExpression: "slotId = :slotId AND scheduledDate = :date",
    FilterExpression: "#status = :pending AND requestId <> :thisId",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":slotId": req.slotId,
      ":date": req.scheduledDate,
      ":pending": "pending",
      ":thisId": requestId,
    },
  }));

  const siblings = siblingsResult.Items ?? [];

  // Build transaction items
  const transactItems: any[] = [
    // Update slot to booked
    {
      Update: {
        TableName: Tables.AvailabilitySlots,
        Key: { tutorId: req.tutorId, slotId: req.slotId },
        UpdateExpression: req.recurring
          ? `SET bookedDates.#date = :tuteeId`
          : "SET booked = :true, bookedBy = :tuteeId",
        ...(req.recurring
          ? {
              ExpressionAttributeNames: { "#date": req.scheduledDate as string },
              ExpressionAttributeValues: { ":tuteeId": req.tuteeId },
            }
          : {
              ConditionExpression: "booked = :false",
              ExpressionAttributeValues: { ":true": true, ":false": false, ":tuteeId": req.tuteeId },
            }),
      },
    },
    // Create session
    {
      Put: {
        TableName: Tables.Sessions,
        Item: {
          sessionId,
          tutorId: req.tutorId,
          tuteeId: req.tuteeId,
          tutorName: req.tutorName,
          tuteeName: req.tuteeName,
          subject: req.subject,
          slotId: req.slotId,
          day: req.day,
          startTime: req.startTime,
          endTime: req.endTime,
          duration: req.duration,
          scheduledDate: `${req.scheduledDate}T12:00:00.000Z`,
          status: "upcoming",
          meetLink: null,
          calendarEventId: null,
          meetLinkStatus: "pending",
          schoolDomain: req.schoolDomain,
          tutorRated: false,
          tuteeRated: false,
          createdAt: now,
        },
      },
    },
    // Update accepted request
    {
      Update: {
        TableName: Tables.BookingRequests,
        Key: { requestId },
        UpdateExpression: "SET #status = :accepted, sessionId = :sid, respondedAt = :now",
        ConditionExpression: "#status = :pending",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":accepted": "accepted",
          ":pending": "pending",
          ":sid": sessionId,
          ":now": now,
        },
      },
    },
  ];

  // Auto-reject siblings (DynamoDB transactions max 100 items)
  // Add up to ~95 siblings in the transaction, overflow outside
  const inTxnSiblings = siblings.slice(0, 95);
  const overflowSiblings = siblings.slice(95);

  for (const sib of inTxnSiblings) {
    transactItems.push({
      Update: {
        TableName: Tables.BookingRequests,
        Key: { requestId: sib.requestId },
        UpdateExpression: "SET #status = :rejected, rejectionReason = :reason, respondedAt = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":rejected": "rejected",
          ":reason": "slot_taken",
          ":now": now,
        },
      },
    });
  }

  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (err: unknown) {
    const e = err as Error & { name?: string };
    if (e.name === "TransactionCanceledException") {
      return error(409, "Slot is no longer available or request is no longer pending.");
    }
    throw err;
  }

  // Handle overflow siblings outside transaction
  for (const sib of overflowSiblings) {
    try {
      await ddb.send(new UpdateCommand({
        TableName: Tables.BookingRequests,
        Key: { requestId: sib.requestId },
        UpdateExpression: "SET #status = :rejected, rejectionReason = :reason, respondedAt = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":rejected": "rejected", ":reason": "slot_taken", ":now": now },
      }));
    } catch (err) {
      captureError(err, { function: "respondToBooking", action: "overflowReject" });
    }
  }

  // Provision Google Meet
  let meetLink: string | null = null;
  let meetLinkStatus = "pending";

  try {
    const meet = await provisionMeetLink({
      sessionId,
      tutorEmail: req.tutorEmail as string,
      tuteeEmail: req.tuteeEmail as string,
      subject: req.subject as string,
      scheduledDate: req.scheduledDate as string,
      startTime: req.startTime as string,
      endTime: req.endTime as string,
      tutorName: req.tutorName as string,
      tuteeName: req.tuteeName as string,
    });
    meetLink = meet.meetLink;
    meetLinkStatus = "ready";

    await ddb.send(new UpdateCommand({
      TableName: Tables.Sessions,
      Key: { sessionId },
      UpdateExpression: "SET meetLink = :link, calendarEventId = :eid, meetLinkStatus = :status",
      ExpressionAttributeValues: { ":link": meet.meetLink, ":eid": meet.calendarEventId, ":status": "ready" },
    }));
  } catch (err) {
    captureError(err, { function: "respondToBooking", action: "meetProvisioning" });
    meetLinkStatus = "failed";
    await ddb.send(new UpdateCommand({
      TableName: Tables.Sessions,
      Key: { sessionId },
      UpdateExpression: "SET meetLinkStatus = :status",
      ExpressionAttributeValues: { ":status": "failed" },
    }));
  }

  // Send confirmation email
  let emailSent = false;
  try {
    await sendBookingConfirmation({
      tutorEmail: req.tutorEmail as string,
      tutorName: req.tutorName as string,
      tuteeEmail: req.tuteeEmail as string,
      tuteeName: req.tuteeName as string,
      subject: req.subject as string,
      day: req.day as string,
      startTime: req.startTime as string,
      endTime: req.endTime as string,
      duration: req.duration as number,
      scheduledDate: format(scheduledNoon, "EEEE, MMMM d, yyyy"),
      meetLink,
      sessionId,
    });
    emailSent = true;
  } catch (err) {
    captureError(err, { function: "respondToBooking", action: "confirmationEmail" });
  }

  // Send rejection emails to auto-rejected tutees (fire-and-forget)
  for (const sib of [...inTxnSiblings, ...overflowSiblings]) {
    sendRequestRejectedEmail({
      tuteeEmail: sib.tuteeEmail as string,
      tuteeName: sib.tuteeName as string,
      tutorName: sib.tutorName as string,
      subject: sib.subject as string,
      scheduledDate: sib.scheduledDate as string,
      day: sib.day as string,
      startTime: sib.startTime as string,
      endTime: sib.endTime as string,
      reason: "slot_taken",
    }).catch(err => captureError(err, { function: "respondToBooking", action: "autoRejectionEmail" }));
  }

  return json({ sessionId, meetLink, meetLinkStatus, emailSent });
}
