// functions/src/aggregations/updateSchoolStats.ts
// Firestore trigger: recalculate school stats whenever a session changes

import * as functions from "firebase-functions/v2/firestore";
import { db, FieldValue } from "../lib/admin";
import { startOfMonth }   from "date-fns";

export const updateSchoolStats = functions.onDocumentWritten(
  { document: "sessions/{sessionId}", region: "us-central1" },
  async (event) => {
    const session = (event.data?.after?.data() ?? event.data?.before?.data()) as
      { schoolDomain: string; status: string; scheduledDate: { toDate(): Date } } | undefined;

    if (!session?.schoolDomain) return;

    const domain = session.schoolDomain;

    // Recalculate stats for this school
    const [usersSnap, sessionsSnap, reviewsSnap] = await Promise.all([
      db.collection("users").where("schoolDomain", "==", domain).get(),
      db.collection("sessions").where("schoolDomain", "==", domain).where("status", "==", "completed").get(),
      db.collection("reviews").where("schoolDomain", "==", domain).get(),
    ]);

    const monthStart = startOfMonth(new Date());
    const sessionsThisMonth = sessionsSnap.docs.filter((s) => {
      const d = s.data().scheduledDate?.toDate?.();
      return d && d >= monthStart;
    }).length;

    const totalRatings = reviewsSnap.docs.reduce((sum, r) => sum + (r.data().stars ?? 0), 0);
    const avgRating    = reviewsSnap.size > 0
      ? Math.round((totalRatings / reviewsSnap.size) * 10) / 10
      : 0;

    const activeTutors = usersSnap.docs.filter((u) => {
      const d = u.data();
      return (d.role === "tutor" || d.role === "both") && d.status === "active" && d.isActive;
    }).length;

    await db.collection("stats").doc(domain).set({
      schoolDomain:       domain,
      totalUsers:         usersSnap.size,
      activeTutors,
      sessionsThisMonth,
      totalSessions:      sessionsSnap.size,
      avgRating,
      updatedAt:          FieldValue.serverTimestamp(),
    }, { merge: true });
  }
);
