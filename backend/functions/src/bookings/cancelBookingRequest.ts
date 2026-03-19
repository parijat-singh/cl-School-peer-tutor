// functions/src/bookings/cancelBookingRequest.ts
// Callable: tutee cancels their own pending booking request.
// Only the tutee who created the request can cancel it, and only while it is still pending.

import * as functions from "firebase-functions/v2/https";
import { z }          from "zod";
import { db, FieldValue } from "../lib/admin";

export const cancelBookingRequestSchema = z.object({
  requestId: z.string().min(1),
});
const schema = cancelBookingRequestSchema;

export const cancelBookingRequest = functions.onCall(
  { enforceAppCheck: false, region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new functions.HttpsError("unauthenticated", "Sign in to cancel a request.");
    }

    const uid    = request.auth.uid;
    const parsed = schema.safeParse(request.data);

    if (!parsed.success) {
      throw new functions.HttpsError("invalid-argument", "Invalid request data.");
    }

    const { requestId } = parsed.data;
    const reqRef  = db.collection("bookingRequests").doc(requestId);
    const reqSnap = await reqRef.get();

    if (!reqSnap.exists) {
      throw new functions.HttpsError("not-found", "Booking request not found.");
    }

    const req = reqSnap.data()!;

    // Only the tutee who owns this request can cancel it
    if (req.tuteeId !== uid) {
      throw new functions.HttpsError("permission-denied", "You can only cancel your own requests.");
    }

    // Can only cancel while pending — accepted/rejected requests cannot be retracted here
    if (req.status !== "pending") {
      throw new functions.HttpsError(
        "failed-precondition",
        `Cannot cancel a request that is already ${req.status}.`
      );
    }

    await reqRef.update({
      status:      "cancelled",
      respondedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);
