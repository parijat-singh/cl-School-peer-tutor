// functions/src/aggregations/purgeOldSessions.ts
// Monthly job: delete sessions older than 24 months (data retention policy)

import * as functions from "firebase-functions/v2/scheduler";
import { db, Timestamp } from "../lib/admin";
import { subMonths }     from "date-fns";

export const purgeOldSessions = functions.onSchedule(
  { schedule: "every 24 hours", region: "us-central1" },
  async () => {
    const cutoff = subMonths(new Date(), 24);

    const snap = await db.collection("sessions")
      .where("scheduledDate", "<=", Timestamp.fromDate(cutoff))
      .limit(500)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    console.log(`Purged ${snap.size} sessions older than 24 months.`);
  }
);
