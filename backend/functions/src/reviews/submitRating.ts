// functions/src/reviews/submitRating.ts
import * as functions from "firebase-functions/v2/https";
import { db, FieldValue } from "../lib/admin";

export const submitRating = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");

    const { sessionId, stars, text } = request.data as {
      sessionId: string;
      stars: 1|2|3|4|5;
      text?: string;
    };

    if (!sessionId || !stars || stars < 1 || stars > 5) {
      throw new functions.HttpsError("invalid-argument", "Invalid rating data.");
    }

    const callerUid  = request.auth.uid;
    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) throw new functions.HttpsError("not-found", "Session not found.");

    const session = sessionSnap.data()!;

    // Ensure caller is a participant
    const isTutor = session.tutorId === callerUid;
    const isTutee = session.tuteeId === callerUid;
    if (!isTutor && !isTutee) throw new functions.HttpsError("permission-denied", "Not a participant.");

    // Check if already rated
    if (isTutor && session.tutorRated) throw new functions.HttpsError("already-exists", "Already rated.");
    if (isTutee && session.tuteeRated) throw new functions.HttpsError("already-exists", "Already rated.");

    // Determine who is being rated
    const targetId   = isTutor ? session.tuteeId  : session.tutorId;
    const targetName = isTutor ? session.tuteeName : session.tutorName;
    const authorName = isTutor ? session.tutorName : session.tuteeName;

    // ── Create review + update session flag ──────────────────────
    const reviewRef = db.collection("reviews").doc();
    await db.runTransaction(async (txn) => {
      txn.set(reviewRef, {
        sessionId,
        authorId:     callerUid,
        authorName,
        targetId,
        targetName,
        stars,
        text:         text?.trim() ?? null,
        flagged:      false,
        flaggedBy:    null,
        schoolDomain: session.schoolDomain,
        createdAt:    FieldValue.serverTimestamp(),
      });

      txn.update(sessionRef, {
        ...(isTutor ? { tutorRated: true } : { tuteeRated: true }),
      });
    });

    // ── Update tutor's aggregate rating ─────────────────────────
    if (isTutee) {
      // The tutee just rated the tutor — update tutor's avgRating
      const tutorRef  = db.collection("users").doc(session.tutorId);
      const tutorSnap = await tutorRef.get();
      const tutor     = tutorSnap.data()!;
      const prevCount = tutor.reviewCount ?? 0;
      const prevAvg   = tutor.avgRating   ?? 0;
      const newCount  = prevCount + 1;
      const newAvg    = ((prevAvg * prevCount) + stars) / newCount;

      await tutorRef.update({
        avgRating:   Math.round(newAvg * 10) / 10,
        reviewCount: newCount,
      });
    }

    return { success: true };
  }
);
