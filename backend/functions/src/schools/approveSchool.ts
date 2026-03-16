import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const approveSchool = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const { domain } = request.data;
  if (!domain) throw new HttpsError("invalid-argument", "domain required");
  const db = getFirestore();
  await db.doc(`schools/${domain}`).update({ approved: true, status: "approved" });
  return { success: true };
});
