// functions/src/auth/initializeUser.ts
// Called by frontend after Cognito ConfirmSignUp to create the Firestore user doc
// and set Cognito custom attributes. Replaces the Firebase onUserCreate trigger
// for Cognito-based signups.

import * as functions from "firebase-functions/v2/https";
import { db, FieldValue } from "../lib/admin";
import { requireAuth } from "../lib/cognitoAuth";
import { cognitoUpdateAttributes } from "../lib/cognitoAdmin";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(200),
  role: z.enum(["tutee", "tutor"]),
  schoolDomain: z.string().min(1).max(256),
  grade: z.string().optional(),
  subjects: z.array(z.string()).optional(),
});

export const initializeUser = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    const caller = await requireAuth(request);

    const parsed = schema.safeParse(request.data);
    if (!parsed.success) {
      throw new functions.HttpsError("invalid-argument", parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const { name, role, schoolDomain, grade, subjects } = parsed.data;

    // Verify school domain is approved
    const schoolSnap = await db.collection("schools").doc(schoolDomain).get();
    if (!schoolSnap.exists || !schoolSnap.data()?.approved) {
      throw new functions.HttpsError("failed-precondition", "School is not approved.");
    }

    // Prevent re-initialization
    const existingUser = await db.collection("users").doc(caller.uid).get();
    if (existingUser.exists) {
      throw new functions.HttpsError("already-exists", "User already initialized.");
    }

    // Create Firestore user doc
    await db.collection("users").doc(caller.uid).set({
      name,
      email: caller.email,
      role,
      schoolDomain,
      grade: grade ?? null,
      subjects: subjects ?? [],
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Set Cognito custom attributes
    try {
      await cognitoUpdateAttributes(caller.uid, {
        "custom:role": role,
        "custom:schoolDomain": schoolDomain,
        "custom:status": "active",
      });
    } catch (err) {
      console.error("Failed to set Cognito attributes:", err);
      // Non-fatal: user doc is created, attributes will sync on next token refresh
    }

    return { success: true };
  },
);
