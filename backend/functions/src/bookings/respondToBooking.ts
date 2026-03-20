// functions/src/bookings/respondToBooking.ts
// Callable: tutor accepts or rejects a pending booking request.
//
// On ACCEPT — inside a single Firestore transaction:
//   1. Re-verify the request is still pending (race-condition safe)
//   2. Mark the slot as confirmed-booked
//   3. Create the SessionDoc
//   4. Update the accepted request (status → "accepted", sessionId, respondedAt)
//   5. Auto-reject all other pending requests for the same slotId + scheduledDate
// Then outside the transaction: provision Google Meet + send emails.
//
// On REJECT — simple update + rejection email.

import * as functions from "firebase-functions/v2/https";
import { z }          from "zod";
import { db, FieldValue, Timestamp } from "../lib/admin";
import { provisionMeetLink }         from "../lib/googleMeet";
import { sendBookingConfirmation, sendRequestRejectedEmail } from "../lib/email";
import { format } from "date-fns";
import { shouldEnforceAppCheck } from "../lib/runtime";
import { dateOnlyToNoonUtcDate, dateOnlyToTimestamp } from "../lib/dates";
import { captureError } from "../lib/sentry";

export const respondToBookingSchema = z.object({
  requestId:       z.string().min(1),
  action:          z.enum(["accept", "reject"]),
  rejectionReason: z.string().optional(),
});
const schema = respondToBookingSchema;

export const respondToBooking = functions.onCall(
  { enforceAppCheck: shouldEnforceAppCheck, region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new functions.HttpsError("unauthenticated", "Sign in to respond to a booking request.");
    }

    const uid    = request.auth.uid;
    const parsed = schema.safeParse(request.data);

    if (!parsed.success) {
      throw new functions.HttpsError("invalid-argument", "Invalid request data.");
    }

    const { requestId, action, rejectionReason } = parsed.data;
    const reqRef  = db.collection("bookingRequests").doc(requestId);
    const reqSnap = await reqRef.get();

    if (!reqSnap.exists) {
      throw new functions.HttpsError("not-found", "Booking request not found.");
    }

    const req = reqSnap.data()!;
    const scheduledNoon = dateOnlyToNoonUtcDate(req.scheduledDate);

    // Only the tutor on this request can respond
    if (req.tutorId !== uid) {
      throw new functions.HttpsError("permission-denied", "You can only respond to your own booking requests.");
    }

    if (req.status !== "pending") {
      throw new functions.HttpsError(
        "failed-precondition",
        `Request is already ${req.status}.`
      );
    }

    // ── REJECT ───────────────────────────────────────────────────────
    if (action === "reject") {
      await reqRef.update({
        status:          "rejected",
        rejectionReason: rejectionReason ?? "tutor_declined",
        respondedAt:     FieldValue.serverTimestamp(),
      });

      let emailSent = false;
      try {
        await sendRequestRejectedEmail({
          tuteeEmail:    req.tuteeEmail,
          tuteeName:     req.tuteeName,
          tutorName:     req.tutorName,
          subject:       req.subject,
          scheduledDate: req.scheduledDate,
          day:           req.day,
          startTime:     req.startTime,
          endTime:       req.endTime,
          reason:        "tutor_declined",
        });
        emailSent = true;
      } catch (err) {
        captureError(err, { function: "respondToBooking", action: "rejectionEmail" });
        console.error("Rejection email failed:", err);
      }

      return { success: true, emailSent };
    }

    // ── ACCEPT ───────────────────────────────────────────────────────
    const slotRef    = db.collection("users").doc(req.tutorId).collection("availability").doc(req.slotId);
    const sessionRef = db.collection("sessions").doc();

    // Collect sibling pending requests for auto-rejection (before transaction)
    const siblingsSnap = await db.collection("bookingRequests")
      .where("slotId",        "==", req.slotId)
      .where("scheduledDate", "==", req.scheduledDate)
      .where("status",        "==", "pending")
      .get();

    const siblingRefs = siblingsSnap.docs
      .filter(d => d.id !== requestId)
      .map(d => d.ref);

    // Atomic transaction: verify + book slot + create session + update requests
    await db.runTransaction(async (txn) => {
      // Re-read inside transaction to guard against races
      const freshReq  = await txn.get(reqRef);
      const slotSnap  = await txn.get(slotRef);

      if (!freshReq.exists || freshReq.data()!.status !== "pending") {
        throw new functions.HttpsError("failed-precondition", "Request is no longer pending.");
      }
      if (!slotSnap.exists) {
        throw new functions.HttpsError("not-found", "Availability slot not found.");
      }

      const slot = slotSnap.data()!;

      // Mark slot booked
      if (slot.recurring) {
        txn.update(slotRef, {
          [`bookedDates.${req.scheduledDate}`]: req.tuteeId,
        });
      } else {
        txn.update(slotRef, { booked: true, bookedBy: req.tuteeId });
      }

      // Create SessionDoc
      txn.set(sessionRef, {
        tutorId:       req.tutorId,
        tuteeId:       req.tuteeId,
        tutorName:     req.tutorName,
        tuteeName:     req.tuteeName,
        subject:       req.subject,
        slotId:        req.slotId,
        day:           req.day,
        startTime:     req.startTime,
        endTime:       req.endTime,
        duration:      req.duration,
        scheduledDate: dateOnlyToTimestamp(req.scheduledDate),
        status:        "upcoming",
        meetLink:      null,
        calendarEventId: null,
        meetLinkStatus: "pending",
        schoolDomain:  req.schoolDomain,
        tutorRated:    false,
        tuteeRated:    false,
        createdAt:     FieldValue.serverTimestamp(),
      });

      // Update accepted request
      txn.update(reqRef, {
        status:      "accepted",
        sessionId:   sessionRef.id,
        respondedAt: FieldValue.serverTimestamp(),
      });

      // Auto-reject all sibling pending requests
      const now = Timestamp.now();
      for (const sibRef of siblingRefs) {
        txn.update(sibRef, {
          status:          "rejected",
          rejectionReason: "slot_taken",
          respondedAt:     now,
        });
      }
    });

    // ── Provision Google Meet (outside transaction) ───────────────
    let meetLink: string | null = null;
    let meetLinkStatus = "pending";

    try {
      const meet = await provisionMeetLink({
        sessionId:     sessionRef.id,
        tutorEmail:    req.tutorEmail,
        tuteeEmail:    req.tuteeEmail,
        subject:       req.subject,
        scheduledDate: req.scheduledDate,
        startTime:     req.startTime,
        endTime:       req.endTime,
        tutorName:     req.tutorName,
        tuteeName:     req.tuteeName,
      });
      meetLink       = meet.meetLink;
      meetLinkStatus = "ready";

      await sessionRef.update({
        meetLink,
        calendarEventId: meet.calendarEventId,
        meetLinkStatus:  "ready",
      });
    } catch (err) {
      captureError(err, { function: "respondToBooking", action: "meetProvisioning" });
      console.error("Meet provisioning failed:", err);
      meetLinkStatus = "failed";
      await sessionRef.update({ meetLinkStatus: "failed" });
    }

    // ── Send confirmation email to tutor + tutee ─────────────────
    let emailSent = false;
    try {
      await sendBookingConfirmation({
        tutorEmail:    req.tutorEmail,
        tutorName:     req.tutorName,
        tuteeEmail:    req.tuteeEmail,
        tuteeName:     req.tuteeName,
        subject:       req.subject,
        day:           req.day,
        startTime:     req.startTime,
        endTime:       req.endTime,
        duration:      req.duration,
        scheduledDate: format(scheduledNoon, "EEEE, MMMM d, yyyy"),
        meetLink,
        sessionId:     sessionRef.id,
      });
      emailSent = true;
    } catch (err) {
      captureError(err, { function: "respondToBooking", action: "confirmationEmail" });
      console.error("Confirmation email failed:", err);
    }

    // ── Send rejection emails to auto-rejected tutees ────────────
    if (siblingRefs.length > 0) {
      const siblingDocs = siblingsSnap.docs.filter(d => d.id !== requestId);
      for (const sibDoc of siblingDocs) {
        const sib = sibDoc.data();
        sendRequestRejectedEmail({
          tuteeEmail:    sib.tuteeEmail,
          tuteeName:     sib.tuteeName,
          tutorName:     sib.tutorName,
          subject:       sib.subject,
          scheduledDate: sib.scheduledDate,
          day:           sib.day,
          startTime:     sib.startTime,
          endTime:       sib.endTime,
          reason:        "slot_taken",
        }).catch(err => { captureError(err, { function: "respondToBooking", action: "autoRejectionEmail" }); console.error("Auto-rejection email failed:", err); });
      }
    }

    return {
      sessionId:     sessionRef.id,
      meetLink,
      meetLinkStatus,
      emailSent,
    };
  }
);
