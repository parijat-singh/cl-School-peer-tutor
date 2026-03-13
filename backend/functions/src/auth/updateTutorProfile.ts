// functions/src/auth/updateTutorProfile.ts
import * as functions from "firebase-functions/v2/https";
import { db, FieldValue } from "../lib/admin";

export const updateTutorProfile = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");

    const { subjects, bio } = request.data as { subjects: string[]; bio: string };

    if (!Array.isArray(subjects) || subjects.length === 0) {
      throw new functions.HttpsError("invalid-argument", "At least one subject required.");
    }
    if (bio && bio.length > 280) {
      throw new functions.HttpsError("invalid-argument", "Bio max 280 characters.");
    }

    await db.collection("users").doc(request.auth.uid).update({
      subjects,
      bio:       bio?.trim() ?? "",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);
