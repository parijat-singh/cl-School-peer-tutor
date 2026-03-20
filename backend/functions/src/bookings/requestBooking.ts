// functions/src/bookings/requestBooking.ts
// Callable: tutee submits a booking request for a tutor's availability slot.
// Multiple tutees can request the same slot simultaneously.
// The slot stays unbooked until the tutor explicitly accepts one request.

import * as functions from "firebase-functions/v2/https";
import { z }          from "zod";
import { db, FieldValue, Timestamp } from "../lib/admin";
import { sendBookingRequestEmail }   from "../lib/email";
import { shouldEnforceAppCheck } from "../lib/runtime";

export const requestBookingSchema = z.object({
  tutorId:       z.string().min(1),
  slotId:        z.string().min(1),
  subject:       z.string().min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduledDate must be YYYY-MM-DD"),
});
const schema = requestBookingSchema;

export const requestBooking = functions.onCall(
  { enforceAppCheck: shouldEnforceAppCheck, region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new functions.HttpsError("unauthenticated", "Sign in to request a session.");
    }

    const uid = request.auth.uid;

    const parsed = schema.safeParse(request.data);
    if (!parsed.success) {
      throw new functions.HttpsError("invalid-argument", "Invalid request data.");
    }
    const { tutorId, slotId, subject, scheduledDate } = parsed.data;

    // Load tutee and tutor profiles
    const [tuteeSnap, tutorSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("users").doc(tutorId).get(),
    ]);

    if (!tuteeSnap.exists || tuteeSnap.data()!.status !== "active") {
      throw new functions.HttpsError("permission-denied", "Your account is not active.");
    }
    if (!tutorSnap.exists) {
      throw new functions.HttpsError("not-found", "Tutor not found.");
    }

    const tutee = tuteeSnap.data()!;
    const tutor = tutorSnap.data()!;

    if (tutor.schoolDomain !== tutee.schoolDomain) {
      throw new functions.HttpsError("permission-denied", "Tutor is from a different school.");
    }

    // Load the availability slot
    const slotRef  = db.collection("users").doc(tutorId).collection("availability").doc(slotId);
    const slotSnap = await slotRef.get();

    if (!slotSnap.exists) {
      throw new functions.HttpsError("not-found", "Availability slot not found.");
    }

    const slot = slotSnap.data()!;

    // Reject immediately if slot is already confirmed-booked
    const isOneOff    = !slot.recurring;
    const isRecurring = slot.recurring;

    if (isOneOff && slot.booked) {
      throw new functions.HttpsError("already-exists", "This slot has already been booked.");
    }
    if (isRecurring && slot.bookedDates?.[scheduledDate]) {
      throw new functions.HttpsError("already-exists", "This slot is already taken for that date.");
    }

    // Prevent duplicate pending requests from the same tutee for this slot+date
    const dupQuery = await db.collection("bookingRequests")
      .where("tuteeId",       "==", uid)
      .where("slotId",        "==", slotId)
      .where("scheduledDate", "==", scheduledDate)
      .where("status",        "==", "pending")
      .limit(1)
      .get();

    if (!dupQuery.empty) {
      throw new functions.HttpsError("already-exists", "You already have a pending request for this slot.");
    }

    // Create the booking request
    const requestRef = db.collection("bookingRequests").doc();
    await requestRef.set({
      tutorId,
      tuteeId:       uid,
      tuteeName:     tutee.name,
      tutorName:     tutor.name,
      tuteeEmail:    tutee.email,
      tutorEmail:    tutor.email,
      slotId,
      subject,
      scheduledDate,
      day:           slot.day,
      startTime:     slot.startTime,
      endTime:       slot.endTime,
      duration:      slot.duration,
      recurring:     slot.recurring ?? false,
      status:        "pending",
      schoolDomain:  tutee.schoolDomain,
      createdAt:     FieldValue.serverTimestamp(),
    });

    // Notify the tutor by email (non-blocking)
    sendBookingRequestEmail({
      tutorEmail:    tutor.email,
      tutorName:     tutor.name,
      tuteeName:     tutee.name,
      tuteeEmail:    tutee.email,
      subject,
      scheduledDate,
      day:           slot.day,
      startTime:     slot.startTime,
      endTime:       slot.endTime,
      duration:      slot.duration,
      requestId:     requestRef.id,
    }).catch(err => console.error("Request notification email failed:", err));

    return { requestId: requestRef.id };
  }
);
