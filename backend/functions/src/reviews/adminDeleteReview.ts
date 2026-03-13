// functions/src/reviews/adminDeleteReview.ts
import * as functions from "firebase-functions/v2/https";
import { db, FieldValue } from "../lib/admin";

export const adminDeleteReview = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");
    if (request.auth.token.role !== "admin") throw new functions.HttpsError("permission-denied", "Admins only.");

    const { reviewId, reason } = request.data as { reviewId: string; reason: string };
    if (!reviewId || !reason) throw new functions.HttpsError("invalid-argument", "reviewId and reason required.");

    const reviewSnap = await db.collection("reviews").doc(reviewId).get();
    if (!reviewSnap.exists) throw new functions.HttpsError("not-found", "Review not found.");

    const review = reviewSnap.data()!;
    // Enforce school isolation
    if (review.schoolDomain !== request.auth.token.schoolDomain) {
      throw new functions.HttpsError("permission-denied", "Cross-school action denied.");
    }

    await db.runTransaction(async (txn) => {
      // Delete the review
      txn.delete(db.collection("reviews").doc(reviewId));

      // Write audit log entry
      txn.set(db.collection("adminAuditLog").doc(), {
        adminUid:    request.auth!.uid,
        action:      "delete_review",
        targetId:    reviewId,
        reason,
        metadata:    { stars: review.stars, authorId: review.authorId, targetId: review.targetId },
        schoolDomain: review.schoolDomain,
        timestamp:   FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);
