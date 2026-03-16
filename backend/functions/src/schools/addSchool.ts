// functions/src/schools/addSchool.ts
// Super admin adds a new school directly (pre-approved)

import * as functions from "firebase-functions/v2/https";
import { db, FieldValue } from "../lib/admin";

interface AddSchoolData {
  domain: string;
  name: string;
  type: "middle" | "high" | "k12";
  adminEmail: string;
  campus: string;
  address: string;
  location: string;
}

export const addSchool = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    // Must be authenticated
    if (!request.auth) {
      throw new functions.HttpsError("unauthenticated", "Must be signed in.");
    }

    // Must be super admin
    const role = request.auth.token.role;
    if (role !== "superadmin") {
      throw new functions.HttpsError("permission-denied", "Only super admins can add schools.");
    }

    const { domain, name, type, adminEmail, campus, address, location } =
      request.data as AddSchoolData;

    if (!domain || !name || !type || !adminEmail || !campus || !address || !location) {
      throw new functions.HttpsError("invalid-argument", "All fields are required.");
    }

    // Validate domain format
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      throw new functions.HttpsError("invalid-argument", "Invalid domain format.");
    }

    // Check if already registered
    const existing = await db.collection("schools").doc(domain).get();
    if (existing.exists) {
      throw new functions.HttpsError("already-exists", "This school domain is already registered.");
    }

    // Create school — pre-approved since super admin is adding it
    await db.collection("schools").doc(domain).set({
      domain,
      name,
      type,
      adminEmail,
      campus,
      address,
      location,
      approved: true,
      brandColor: "#0055FF",
      logoUrl: null,
      subjects: [
        "Algebra", "Geometry", "Pre-Calculus", "Calculus", "Statistics",
        "Biology", "Chemistry", "Physics", "Earth Science",
        "English", "History", "Spanish", "French", "Computer Science", "Economics",
      ],
      createdAt: FieldValue.serverTimestamp(),
    });

    // Write audit log
    await db.collection("adminAuditLog").add({
      adminUid: request.auth.uid,
      action: "add_school",
      targetId: domain,
      metadata: { name, type, adminEmail, campus, address, location },
      schoolDomain: domain,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { success: true, message: `School ${name} (${domain}) added and approved.` };
  }
);
