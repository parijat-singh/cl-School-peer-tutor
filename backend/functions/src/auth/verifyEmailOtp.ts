// functions/src/auth/verifyEmailOtp.ts
// Verifies the 6-digit OTP and activates the user account on success.
import * as functions from "firebase-functions/v2/https";
import * as crypto    from "crypto";
import { db, auth, Timestamp, FieldValue } from "../lib/admin";

const MAX_ATTEMPTS = 5;

function hashOtp(uid: string, otp: string): string {
  return crypto.createHash("sha256").update(`${uid}:${otp}`).digest("hex");
}

export const verifyEmailOtp = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");

    const uid = request.auth.uid;
    const { otp } = request.data as { otp: string };
    if (!otp || otp.length !== 6) throw new functions.HttpsError("invalid-argument", "OTP must be 6 digits.");

    const ref  = db.collection("emailVerifications").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) throw new functions.HttpsError("not-found", "No pending verification. Request a new code.");

    const data = snap.data()!;

    // Check expiry
    const expiresAt = (data.expiresAt as typeof Timestamp.prototype).toDate();
    if (new Date() > expiresAt) {
      await ref.delete();
      throw new functions.HttpsError("deadline-exceeded", "Code expired. Please request a new one.");
    }

    // Check attempt limit
    if (data.attempts >= MAX_ATTEMPTS) {
      await ref.delete();
      throw new functions.HttpsError("resource-exhausted", "Too many attempts. Please request a new code.");
    }

    // Verify hash
    const expected = hashOtp(uid, otp);
    if (data.otpHash !== expected) {
      await ref.update({ attempts: FieldValue.increment(1) });
      const remaining = MAX_ATTEMPTS - data.attempts - 1;
      throw new functions.HttpsError(
        "invalid-argument",
        remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many attempts. Request a new code."
      );
    }

    // ── Success ──────────────────────────────────────────────────
    await ref.delete();

    // Activate the user document
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) throw new functions.HttpsError("not-found", "User document not found.");

    const userData  = userDoc.data()!;
    const domain    = (userData.email as string).split("@")[1];
    const newStatus = "active";

    await db.collection("users").doc(uid).update({
      status:    newStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Set custom claims
    await auth.setCustomUserClaims(uid, {
      role:         userData.role,
      schoolDomain: userData.schoolDomain ?? domain,
      status:       newStatus,
    });

    return { verified: true };
  }
);
