// functions/src/bookings/bookSession.ts
// Callable function: atomic slot booking with double-booking prevention

import * as functions from "firebase-functions/v2/https";
import { z }          from "zod";
import { db, FieldValue, Timestamp } from "../lib/admin";
import { provisionMeetLink }         from "../lib/googleMeet";
import { sendBookingConfirmation }   from "../lib/email";
import { format }                    from "date-fns";

const schema = z.object({
  tutorId:       z.string().min(1),
  slotId:        z.string().min(1),
  subject:       z.string().min(1),
  scheduledDate: z.string().min(1),
});

// Rate limit: 10 bookings per minute per user
const bookingRateLimiter = new Map<string, { count: number; reset: number }>();

function checkRateLimit(uid: string): boolean {
  const now  = Date.now();
  const entry = bookingRateLimiter.get(uid);
  if (!entry || now > entry.reset) {
    bookingRateLimiter.set(uid, { count: 1, reset: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export const bookSession = functions.onCall(
  { enforceAppCheck: false, region: "us-central1" },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new functions.HttpsError("unauthenticated", "Sign in to book a session.");
    }

    const uid    = request.auth.uid;
    const claims = request.auth.token;

    // Rate limiting
    if (!checkRateLimit(uid)) {
      throw new functions.HttpsError("resource-exhausted", "Too many booking attempts. Wait 1 minute.");
    }

    // Validate input
    const parsed = schema.safeParse(request.data);
    if (!parsed.success) {
      throw new functions.HttpsError("invalid-argument", "Invalid booking request.");
    }
    const { tutorId, slotId, subject, scheduledDate } = parsed.data;

    // Verify tutee is active and from the same school
    const tuteeDoc = await db.collection("users").doc(uid).get();
    if (!tuteeDoc.exists || tuteeDoc.data()!.status !== "active") {
      throw new functions.HttpsError("permission-denied", "Account is not active.");
    }

    const tutorDoc = await db.collection("users").doc(tutorId).get();
    if (!tutorDoc.exists) {
      throw new functions.HttpsError("not-found", "Tutor not found.");
    }

    const tutor = tutorDoc.data()!;
    const tutee = tuteeDoc.data()!;

    // Enforce same-school constraint
    if (tutor.schoolDomain !== tutee.schoolDomain) {
      throw new functions.HttpsError("permission-denied", "Tutor is from a different school.");
    }

    // ── Atomic transaction: check + book slot + create session ──
    const slotRef    = db.collection("users").doc(tutorId).collection("availability").doc(slotId);
    const sessionRef = db.collection("sessions").doc();

    const { slotData } = await db.runTransaction(async (txn) => {
      const slotSnap = await txn.get(slotRef);

      if (!slotSnap.exists) {
        throw new functions.HttpsError("not-found", "Availability slot not found.");
      }

      const slot = slotSnap.data()!;

      if (slot.booked) {
        throw new functions.HttpsError("already-exists", "This slot was just booked by someone else. Please choose another.");
      }

      // Mark slot as booked
      txn.update(slotRef, { booked: true, bookedBy: uid });

      // Create session document
      txn.set(sessionRef, {
        tutorId,
        tuteeId:     uid,
        tutorName:   tutor.name,
        tuteeName:   tutee.name,
        subject,
        slotId,
        day:         slot.day,
        startTime:   slot.startTime,
        endTime:     slot.endTime,
        duration:    slot.duration,
        scheduledDate: Timestamp.fromDate(new Date(scheduledDate)),
        status:        "upcoming",
        meetLink:      null,
        calendarEventId: null,
        meetLinkStatus: "pending",
        schoolDomain:  tutee.schoolDomain,
        tutorRated:    false,
        tuteeRated:    false,
        createdAt:     FieldValue.serverTimestamp(),
      });

      return { slotData: slot };
    });

    // ── Provision Google Meet link (outside transaction) ─────────
    let meetLink: string | null = null;
    let meetLinkStatus = "pending";

    try {
      const meet = await provisionMeetLink({
        sessionId:     sessionRef.id,
        tutorEmail:    tutor.email,
        tuteeEmail:    tutee.email,
        subject,
        scheduledDate,
        startTime:     slotData.startTime,
        endTime:       slotData.endTime,
        tutorName:     tutor.name,
        tuteeName:     tutee.name,
      });
      meetLink       = meet.meetLink;
      meetLinkStatus = "ready";

      await sessionRef.update({
        meetLink,
        calendarEventId: meet.calendarEventId,
        meetLinkStatus:  "ready",
      });
    } catch (err) {
      // Graceful degradation — log but don't fail the booking
      console.error("Meet provisioning failed:", err);
      meetLinkStatus = "failed";
      await sessionRef.update({ meetLinkStatus: "failed" });
    }

    // ── Send confirmation emails ────────────────────────────────
    try {
      await sendBookingConfirmation({
        tutorEmail:    tutor.email,
        tutorName:     tutor.name,
        tuteeEmail:    tutee.email,
        tuteeName:     tutee.name,
        subject,
        day:           slotData.day,
        startTime:     slotData.startTime,
        endTime:       slotData.endTime,
        duration:      slotData.duration,
        scheduledDate: format(new Date(scheduledDate), "EEEE, MMMM d, yyyy"),
        meetLink,
        sessionId:     sessionRef.id,
      });
    } catch (emailErr) {
      console.error("Booking email failed:", emailErr);
      // Don't fail the booking if email fails
    }

    return {
      sessionId:     sessionRef.id,
      meetLink,
      meetLinkStatus,
      message:       meetLinkStatus === "ready"
        ? "Session booked! Google Meet link sent to your email."
        : "Session booked! Meet link will be emailed shortly.",
    };
  }
);
