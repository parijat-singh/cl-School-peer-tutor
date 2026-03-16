// functions/src/auth/promoteSuperAdmin.ts
import * as functions from "firebase-functions/v2/https";
import { db, auth, FieldValue } from "../lib/admin";

export const promoteSuperAdmin = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");
    if (request.auth.token.role !== "superadmin") {
      throw new functions.HttpsError("permission-denied", "Super admins only.");
    }

    const { targetUid } = request.data as { targetUid: string };
    if (!targetUid) throw new functions.HttpsError("invalid-argument", "targetUid required.");

    const targetSnap = await db.collection("users").doc(targetUid).get();
    if (!targetSnap.exists) throw new functions.HttpsError("not-found", "User not found.");

    const target = targetSnap.data()!;
    if (target.role === "superadmin") {
      throw new functions.HttpsError("already-exists", "User is already a super admin.");
    }

    // Update Firestore doc
    await db.collection("users").doc(targetUid).update({
      role:         "superadmin",
      schoolDomain: null,
      grade:        null,
      updatedAt:    FieldValue.serverTimestamp(),
    });

    // Update custom claims
    await auth.setCustomUserClaims(targetUid, {
      role:         "superadmin",
      schoolDomain: null,
      status:       target.status,
    });

    // Audit log
    await db.collection("adminAuditLog").add({
      adminUid:    request.auth.uid,
      action:      "promote_superadmin",
      targetId:    targetUid,
      schoolDomain: target.schoolDomain ?? "global",
      timestamp:   FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);
