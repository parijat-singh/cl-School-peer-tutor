// functions/src/reviews/adminDeleteReview.ts
import * as functions from "firebase-functions/v2/https";
import { z } from "zod";
import { db, FieldValue } from "../lib/admin";

export const adminDeleteReviewSchema = z.object({
  reviewId: z.string().min(1),
  reason:   z.string().min(1).max(500),
});

export const adminDeleteReview = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");
    const callerRole = request.auth.token.role;
    if (!["schooladmin", "superadmin"].includes(callerRole)) {
      throw new functions.HttpsError("permission-denied", "Admins only.");
    }

    const parsed = adminDeleteReviewSchema.safeParse(request.data);
    if (!parsed.success) throw new functions.HttpsError("invalid-argument", "reviewId and reason required.");
    const { reviewId, reason } = parsed.data;

    const reviewSnap = await db.collection("reviews").doc(reviewId).get();
    if (!reviewSnap.exists) throw new functions.HttpsError("not-found", "Review not found.");

    const review = reviewSnap.data()!;
    // School admins can only act within their school; super admins have cross-school access
    if (callerRole === "schooladmin" && review.schoolDomain !== request.auth.token.schoolDomain) {
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
