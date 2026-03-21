import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireAuth } from "../lib/cognitoAuth";

export const removeSchool = onCall(async (request) => {
  const caller = await requireAuth(request);

  if (caller.token.role !== "superadmin") {
    throw new HttpsError("permission-denied", "Only super admins can remove schools.");
  }

  const { domain } = request.data;
  if (!domain) throw new HttpsError("invalid-argument", "domain required");

  const db = getFirestore();
  const schoolRef = db.doc(`schools/${domain}`);
  const snap = await schoolRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "School not found.");

  await schoolRef.delete();

  await db.collection("adminAuditLog").add({
    adminUid: caller.uid,
    action: "remove_school",
    targetId: domain,
    metadata: { schoolName: snap.data()?.name },
    timestamp: FieldValue.serverTimestamp(),
  });

  return { success: true };
});
