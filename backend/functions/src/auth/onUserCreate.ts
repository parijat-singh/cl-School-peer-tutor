// functions/src/auth/onUserCreate.ts
// Fires on every new Firebase Auth user — sets custom claims from Firestore
import * as functions from "firebase-functions/v2/identity";
import { auth, db }   from "../lib/admin";

export const onUserCreate = functions.beforeUserCreated(async (event: functions.AuthBlockingEvent) => {
  const user = event.data;
  if (!user.email) return;

  const domain = user.email.split("@")[1];

  // Wait briefly for the user doc to be written by the client
  await new Promise((r) => setTimeout(r, 1000));

  const userSnap = await db.collection("users").doc(user.uid).get();
  if (!userSnap.exists) return;

  const userData = userSnap.data()!;

  // Super admins bypass school domain validation
  if (userData.role === "superadmin") {
    await auth.setCustomUserClaims(user.uid, {
      role: "superadmin",
      schoolDomain: null,
      status: userData.status,
    });
    return;
  }

  // Check if school is approved (non-superadmin users)
  const schoolSnap = await db.collection("schools").doc(domain).get();
  if (!schoolSnap.exists || !schoolSnap.data()!.approved) {
    throw new Error(`School domain ${domain} is not registered with PeerTutor.`);
  }

  // Set custom JWT claims — these are checked in Firestore rules
  await auth.setCustomUserClaims(user.uid, {
    role:         userData.role,
    schoolDomain: domain,
    status:       userData.status,
  });
});
