// functions/src/auth/adminSetClaims.ts
// Generic Cloud Function to set Firebase Auth custom claims on a user.
// Replaces the emulator-only updateCustomClaims() calls in AdminDashboard / SuperAdminDashboard.

import * as functions from "firebase-functions/v2/https";
import { z } from "zod";
import { db, auth } from "../lib/admin";

const schema = z.object({
  targetUid: z.string().min(1).max(128),
  claims: z.object({
    role: z.enum(["tutee", "tutor", "teacher", "schooladmin", "superadmin"]),
    schoolDomain: z.string().nullable(),
    status: z.enum(["active", "suspended", "pending"]),
  }),
});

export const adminSetClaims = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");

    const callerRole = request.auth.token.role;
    if (!["schooladmin", "superadmin"].includes(callerRole)) {
      throw new functions.HttpsError("permission-denied", "Admins only.");
    }

    const parsed = schema.safeParse(request.data);
    if (!parsed.success) {
      throw new functions.HttpsError("invalid-argument", parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const { targetUid, claims } = parsed.data;

    // School admins cannot escalate to superadmin
    if (callerRole === "schooladmin" && claims.role === "superadmin") {
      throw new functions.HttpsError("permission-denied", "Cannot promote to super admin.");
    }

    // School admins can only act within their own school
    if (callerRole === "schooladmin") {
      const targetSnap = await db.collection("users").doc(targetUid).get();
      if (!targetSnap.exists) throw new functions.HttpsError("not-found", "User not found.");

      if (targetSnap.data()!.schoolDomain !== request.auth.token.schoolDomain) {
        throw new functions.HttpsError("permission-denied", "Cross-school action denied.");
      }
    }

    await auth.setCustomUserClaims(targetUid, claims);

    return { success: true };
  }
);
