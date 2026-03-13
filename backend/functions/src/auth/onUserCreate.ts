// functions/src/auth/onUserCreate.ts
// Fires on every new Firebase Auth user — sets custom claims from Firestore
import * as functions from "firebase-functions/v2/auth";
import { auth, db }   from "../lib/admin";
import { sendParentalConsentEmail } from "../lib/email";

export const onUserCreate = functions.beforeUserCreated(async (event) => {
  const user = event.data;
  if (!user.email) return;

  const domain = user.email.split("@")[1];

  // Check if school is approved
  const schoolSnap = await db.collection("schools").doc(domain).get();
  if (!schoolSnap.exists || !schoolSnap.data()!.approved) {
    // Block sign-up if school is not registered
    throw new Error(`School domain ${domain} is not registered with PeerTutor.`);
  }

  // Wait briefly for the user doc to be written by the client
  await new Promise((r) => setTimeout(r, 1000));

  const userSnap = await db.collection("users").doc(user.uid).get();
  if (!userSnap.exists) return;

  const userData = userSnap.data()!;

  // Set custom JWT claims — these are checked in Firestore rules
  await auth.setCustomUserClaims(user.uid, {
    role:         userData.role,
    schoolDomain: domain,
    status:       userData.status,
  });

  // Send parental consent email if needed
  if (userData.status === "pending_consent" && userData.parentEmail) {
    const consentUrl = `https://peertutor.app/consent?uid=${user.uid}&token=TODO`;
    try {
      await sendParentalConsentEmail({
        parentEmail:  userData.parentEmail,
        studentName:  userData.name,
        studentEmail: user.email,
        consentUrl,
      });
    } catch (err) {
      console.error("Parental consent email failed:", err);
    }
  }
});
