// functions/src/notifications/triggerRatingPrompts.ts
// Runs every 15 minutes — prompts users to rate sessions that ended 15 min ago

import * as functions from "firebase-functions/v2/scheduler";
import { db, Timestamp, FieldValue } from "../lib/admin";
import { sendRatingPrompt }          from "../lib/email";
import { subMinutes }                from "date-fns";
import { captureError }              from "../lib/sentry";

export const triggerRatingPrompts = functions.onSchedule(
  { schedule: "every 15 minutes", region: "us-central1" },
  async () => {
    const now      = new Date();
    const from     = subMinutes(now, 20);
    const to       = subMinutes(now, 10);

    const snap = await db.collection("sessions")
      .where("status", "==", "upcoming")
      .where("scheduledDate", ">=", Timestamp.fromDate(from))
      .where("scheduledDate", "<=", Timestamp.fromDate(to))
      .get();

    const batch = db.batch();

    for (const s of snap.docs) {
      const session = s.data();
      // Mark as completed
      batch.update(s.ref, { status: "completed", completedAt: FieldValue.serverTimestamp() });

      const [tutorDoc, tuteeDoc] = await Promise.all([
        db.collection("users").doc(session.tutorId).get(),
        db.collection("users").doc(session.tuteeId).get(),
      ]);
      const tutor = tutorDoc.data()!;
      const tutee = tuteeDoc.data()!;

      const base = { sessionId: s.id, subject: session.subject };

      try {
        await Promise.all([
          !session.tutorRated && sendRatingPrompt({ ...base, recipientEmail: tutor.email, recipientName: tutor.name, otherPartyName: tutee.name }),
          !session.tuteeRated && sendRatingPrompt({ ...base, recipientEmail: tutee.email, recipientName: tutee.name, otherPartyName: tutor.name }),
        ]);
      } catch (err) {
        captureError(err, { function: "triggerRatingPrompts", action: "ratingPromptEmail" });
        console.error(`Rating prompt failed for session ${s.id}:`, err);
      }
    }

    await batch.commit();
  }
);
