import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
initializeApp({ projectId: "peertutor-dev" });
const auth = getAuth();

const users = [
  { uid: "user-tutor-001", email: "tutor1@lincoln.edu",  displayName: "Marcus Johnson",  password: "Test1234!", emailVerified: true,
    customClaims: { role: "tutor",       schoolDomain: "lincoln.edu", status: "active" } },
  { uid: "user-tutor-002", email: "tutor2@lincoln.edu",  displayName: "Emily Rodriguez", password: "Test1234!", emailVerified: true,
    customClaims: { role: "tutor",       schoolDomain: "lincoln.edu", status: "active" } },
  { uid: "user-tutee-001", email: "tutee1@lincoln.edu",  displayName: "Alex Kim",        password: "Test1234!", emailVerified: true,
    customClaims: { role: "tutee",       schoolDomain: "lincoln.edu", status: "active" } },
  { uid: "user-tutee-002", email: "tutee2@lincoln.edu",  displayName: "Jordan Patel",    password: "Test1234!", emailVerified: true,
    customClaims: { role: "tutee",       schoolDomain: "lincoln.edu", status: "active" } },
  { uid: "user-admin-001", email: "admin@lincoln.edu",   displayName: "Sarah Chen",      password: "Test1234!", emailVerified: true,
    customClaims: { role: "schooladmin", schoolDomain: "lincoln.edu", status: "active" } },
];

for (const u of users) {
  const { customClaims, ...rest } = u;
  try {
    await auth.createUser(rest);
    await auth.setCustomUserClaims(u.uid, customClaims);
    console.log("✔ created:", u.email);
  } catch(e) {
    if (e.code === "auth/uid-already-exists" || e.code === "auth/email-already-exists") {
      await auth.setCustomUserClaims(u.uid, customClaims);
      console.log("✔ updated claims:", u.email);
    } else {
      console.error("✗ error:", u.email, e.message);
    }
  }
}
console.log("\n✅ Auth users ready.");
