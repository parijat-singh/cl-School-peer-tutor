// functions/src/notifications/sendSessionReminders.ts
// Runs every hour — sends 24h and 1h reminders for upcoming sessions

import * as functions from "firebase-functions/v2/scheduler";
import { db, Timestamp } from "../lib/admin";
import { sendReminderEmail } from "../lib/email";
import { addHours }          from "date-fns";

export const sendSessionReminders = functions.onSchedule(
  { schedule: "every 60 minutes", region: "us-central1" },
  async () => {
    const now = new Date();

    // Windows for 24hr and 1hr reminders (±5 min tolerance)
    const windows = [
      { hoursUntil: 24, from: addHours(now, 23.9), to: addHours(now, 24.1) },
      { hoursUntil:  1, from: addHours(now,  0.9), to: addHours(now,  1.1) },
    ];

    for (const window of windows) {
      const snap = await db.collection("sessions")
        .where("status", "==", "upcoming")
        .where("scheduledDate", ">=", Timestamp.fromDate(window.from))
        .where("scheduledDate", "<=", Timestamp.fromDate(window.to))
        .get();

      for (const s of snap.docs) {
        const session = s.data();

        const [tutorDoc, tuteeDoc] = await Promise.all([
          db.collection("users").doc(session.tutorId).get(),
          db.collection("users").doc(session.tuteeId).get(),
        ]);
        const tutor = tutorDoc.data()!;
        const tutee = tuteeDoc.data()!;

        const params = {
          subject:       session.subject,
          startTime:     session.startTime,
          scheduledDate: session.scheduledDate.toDate().toISOString(),
          meetLink:      session.meetLink ?? null,
          hoursUntil:    window.hoursUntil,
        };

        try {
          await Promise.all([
            sendReminderEmail({ ...params, recipientEmail: tutor.email, recipientName: tutor.name, otherPartyName: tutee.name }),
            sendReminderEmail({ ...params, recipientEmail: tutee.email, recipientName: tutee.name, otherPartyName: tutor.name }),
          ]);
        } catch (err) {
          console.error(`Reminder email failed for session ${s.id}:`, err);
        }
      }
    }
  }
);
