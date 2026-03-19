/**
 * Integration tests for frontend against Firebase emulators.
 * Run after emulators are started and seeded: bash scripts/seed-emulator.sh
 *
 * Run: npm run test:integration (from frontend)
 * Requires: VITE_USE_EMULATORS=true and emulators on localhost (or set in env).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from "firebase/firestore";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";

const PROJECT_ID = "peertutor-dev";
const EMULATOR_HOST = "localhost";

async function emulatorsReachable(): Promise<boolean> {
  try {
    const [auth, fs] = await Promise.all([
      fetch("http://localhost:9099/").then((r) => r.ok),
      fetch("http://localhost:8090/").then((r) => r.ok),
    ]);
    return auth && fs;
  } catch {
    return false;
  }
}

describe("Firebase emulator integration (frontend)", () => {
  let db: ReturnType<typeof getFirestore>;
  let auth: ReturnType<typeof getAuth>;

  beforeAll(async () => {
    const ok = await emulatorsReachable();
    if (!ok) {
      throw new Error(
        "Emulators not reachable. Start with: firebase emulators:start --only auth,firestore then run scripts/seed-emulator.sh"
      );
    }
    const app = initializeApp({
      apiKey: "fake-api-key",
      authDomain: "localhost",
      projectId: PROJECT_ID,
      storageBucket: `${PROJECT_ID}.appspot.com`,
      messagingSenderId: "123",
      appId: "fake-app-id",
    });
    db = getFirestore(app);
    auth = getAuth(app);
    connectFirestoreEmulator(db, EMULATOR_HOST, 8090);
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });

    // Sign in so Firestore rules allow reading /users/* documents.
    await signInWithEmailAndPassword(auth, "tutor1@lincoln.edu", "Test1234!");
  });

  it("reads user document from Firestore", async () => {
    const userSnap = await getDoc(doc(db, "users", "user-tutor-001"));
    expect(userSnap.exists()).toBe(true);
    const data = userSnap.data();
    expect(data?.name).toBe("Marcus Johnson");
    expect(data?.role).toBe("tutor");
    expect(data?.email).toBe("tutor1@lincoln.edu");
    expect(data?.schoolDomain).toBe("lincoln.edu");
  });

  it("signs in with email and password via Auth emulator", async () => {
    const { user } = await signInWithEmailAndPassword(
      auth,
      "tutee1@lincoln.edu",
      "Test1234!"
    );
    expect(user.uid).toBe("user-tutee-001");
    expect(user.email).toBe("tutee1@lincoln.edu");
  });

  it("reads school document from Firestore", async () => {
    const schoolSnap = await getDoc(doc(db, "schools", "lincoln.edu"));
    expect(schoolSnap.exists()).toBe(true);
    const data = schoolSnap.data();
    expect(data?.name).toBe("Lincoln High School");
    expect(data?.domain).toBe("lincoln.edu");
  });
});
