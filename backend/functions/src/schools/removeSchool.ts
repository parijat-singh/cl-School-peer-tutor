// functions/src/schools/removeSchool.ts
import * as functions from "firebase-functions/v2/https";
import { db, FieldValue } from "../lib/admin";

export const removeSchool = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");
    if (request.auth.token.role !== "superadmin") {
      throw new functions.HttpsError("permission-denied", "Super admins only.");
    }

    const { domain } = request.data as { domain: string };
    if (!domain) throw new functions.HttpsError("invalid-argument", "domain required.");

    const schoolSnap = await db.collection("schools").doc(domain).get();
    if (!schoolSnap.exists) throw new functions.HttpsError("not-found", "School not found.");

    await db.runTransaction(async (txn) => {
      // Mark school as not approved (soft delete)
      txn.update(db.collection("schools").doc(domain), {
        approved: false,
      });

      txn.set(db.collection("adminAuditLog").doc(), {
        adminUid:    request.auth!.uid,
        action:      "remove_school",
        targetId:    domain,
        schoolDomain: domain,
        timestamp:   FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);
