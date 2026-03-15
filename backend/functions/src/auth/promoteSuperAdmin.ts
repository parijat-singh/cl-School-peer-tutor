import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const promoteSuperAdmin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const { uid } = request.data;
  if (!uid) throw new HttpsError("invalid-argument", "uid required");
  const auth = getAuth();
  await auth.setCustomUserClaims(uid, { ...(await auth.getUser(uid)).customClaims, role: "superadmin" });
  const db = getFirestore();
  await db.doc(`users/${uid}`).update({ role: "superadmin" });
  return { success: true };
});
