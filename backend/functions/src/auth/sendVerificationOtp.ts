// functions/src/auth/sendVerificationOtp.ts
// Generates a 6-digit OTP, stores the hash in Firestore, and emails it to the user.
import * as functions from "firebase-functions/v2/https";
import * as crypto    from "crypto";
import { db, Timestamp } from "../lib/admin";
import { sendOtpEmail }  from "../lib/email";

function hashOtp(uid: string, otp: string): string {
  return crypto.createHash("sha256").update(`${uid}:${otp}`).digest("hex");
}

export const sendVerificationOtp = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new functions.HttpsError("unauthenticated", "Sign in required.");

    const uid   = request.auth.uid;
    const email = request.auth.token.email as string;
    if (!email) throw new functions.HttpsError("invalid-argument", "No email on account.");

    // Rate-limit: deny if a code was sent in the last 60 seconds
    const existing = await db.collection("emailVerifications").doc(uid).get();
    if (existing.exists) {
      const sentAt = (existing.data()!.sentAt as typeof Timestamp.prototype).toDate();
      const secondsSince = (Date.now() - sentAt.getTime()) / 1000;
      if (secondsSince < 60) {
        throw new functions.HttpsError(
          "resource-exhausted",
          `Please wait ${Math.ceil(60 - secondsSince)} seconds before requesting a new code.`
        );
      }
    }

    // Generate and store OTP
    const otp      = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash  = hashOtp(uid, otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await db.collection("emailVerifications").doc(uid).set({
      otpHash,
      expiresAt: Timestamp.fromDate(expiresAt),
      sentAt:    Timestamp.fromDate(new Date()),
      attempts:  0,
      email,
    });

    await sendOtpEmail({ to: email, otp, expiresMinutes: 10 });

    return { sent: true };
  }
);
