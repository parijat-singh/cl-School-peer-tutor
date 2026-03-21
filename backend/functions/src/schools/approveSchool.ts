import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { auth } from "../lib/admin";

export const approveSchool = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");

  if (request.auth.token.role !== "superadmin") {
    throw new HttpsError("permission-denied", "Only super admins can approve schools.");
  }

  const { domain } = request.data;
  if (!domain) throw new HttpsError("invalid-argument", "domain required");

  const db = getFirestore();
  const schoolRef = db.doc(`schools/${domain}`);
  const snap = await schoolRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "School not found.");

  await schoolRef.update({ approved: true, status: "approved" });

  // Auto-activate the designated school admin if they already have an account
  const adminEmail = snap.data()?.adminEmail;
  if (adminEmail) {
    const usersSnap = await db.collection("users")
      .where("email", "==", adminEmail)
      .limit(1)
      .get();

    if (!usersSnap.empty) {
      const adminDoc = usersSnap.docs[0];
      await adminDoc.ref.update({
        role: "schooladmin",
        status: "active",
        schoolDomain: domain,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await auth.setCustomUserClaims(adminDoc.id, {
        role: "schooladmin",
        schoolDomain: domain,
        status: "active",
      });
    }
  }

  await db.collection("adminAuditLog").add({
    adminUid: request.auth.uid,
    action: "approve_school",
    targetId: domain,
    metadata: { schoolName: snap.data()?.name },
    timestamp: FieldValue.serverTimestamp(),
  });

  return { success: true };
});
