// functions/src/sessions/cancelSession.ts
import * as functions from "firebase-functions/v2/https";
import { db, FieldValue } from "../lib/admin";
import { sendCancellationEmail }   from "../lib/email";
import { deleteCalendarEvent }     from "../lib/googleMeet";
import { format }                  from "date-fns";
import { captureError }            from "../lib/sentry";

export const cancelSession = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");

    const { sessionId, reason } = request.data as { sessionId: string; reason?: string };
    if (!sessionId) throw new functions.HttpsError("invalid-argument", "sessionId required.");

    const sessionRef  = db.collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) throw new functions.HttpsError("not-found", "Session not found.");

    const session    = sessionSnap.data()!;
    const callerUid  = request.auth.uid;

    // Only tutor or tutee can cancel
    if (session.tutorId !== callerUid && session.tuteeId !== callerUid) {
      throw new functions.HttpsError("permission-denied", "Not your session.");
    }
    if (session.status !== "upcoming") {
      throw new functions.HttpsError("failed-precondition", "Session is not upcoming.");
    }

    const cancelledBy = session.tutorId === callerUid ? "tutor" : "tutee";

    // ── Transaction: cancel session + free slot ──────────────────
    const slotRef = db.collection("users").doc(session.tutorId)
                      .collection("availability").doc(session.slotId);

    await db.runTransaction(async (txn) => {
      txn.update(sessionRef, {
        status:      "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: callerUid,
        cancelReason: reason ?? null,
      });
      txn.update(slotRef, { booked: false, bookedBy: FieldValue.delete() });
    });

    // ── Delete calendar event ───────────────────────────────────
    if (session.calendarEventId) {
      try {
        await deleteCalendarEvent(session.calendarEventId);
      } catch (err) {
        captureError(err, { function: "cancelSession", action: "calendarDelete" });
        console.error("Calendar delete failed:", err);
      }
    }

    // ── Notify the other party ──────────────────────────────────
    const [tutorDoc, tuteeDoc] = await Promise.all([
      db.collection("users").doc(session.tutorId).get(),
      db.collection("users").doc(session.tuteeId).get(),
    ]);
    const tutor = tutorDoc.data()!;
    const tutee = tuteeDoc.data()!;

    const recipientEmail = cancelledBy === "tutor" ? tutee.email  : tutor.email;
    const recipientName  = cancelledBy === "tutor" ? tutee.name   : tutor.name;
    const otherParty     = cancelledBy === "tutor" ? tutor.name   : tutee.name;

    try {
      await sendCancellationEmail({
        recipientEmail,
        recipientName,
        otherPartyName: otherParty,
        subject:        session.subject,
        scheduledDate:  format(session.scheduledDate.toDate(), "EEEE, MMMM d, yyyy"),
        cancelledBy,
      });
    } catch (err) {
      captureError(err, { function: "cancelSession", action: "cancellationEmail" });
      console.error("Cancellation email failed:", err);
    }

    return { success: true };
  }
);
