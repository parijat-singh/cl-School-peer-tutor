import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const promoteSuperAdminSchema = z.object({
  uid: z.string().min(1).max(128),
});

export const promoteSuperAdmin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");

  // Only existing super admins can promote others
  if (request.auth.token.role !== "superadmin") {
    throw new HttpsError("permission-denied", "Only super admins can promote users.");
  }

  const parsed = promoteSuperAdminSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "uid required");
  const { uid } = parsed.data;

  const auth = getAuth();
  const targetUser = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...targetUser.customClaims, role: "superadmin" });

  const db = getFirestore();
  await db.doc(`users/${uid}`).update({ role: "superadmin" });

  // Audit log
  await db.collection("adminAuditLog").add({
    adminUid: request.auth.uid,
    action: "promote_superadmin",
    targetId: uid,
    metadata: { targetEmail: targetUser.email },
    timestamp: FieldValue.serverTimestamp(),
  });

  return { success: true };
});
