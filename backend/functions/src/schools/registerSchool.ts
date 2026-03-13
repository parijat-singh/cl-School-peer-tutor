// functions/src/schools/registerSchool.ts
// Called from a school self-service registration form
// Creates school doc in "pending" state; ops team approves it

import * as functions from "firebase-functions/v2/https";
import { db, FieldValue } from "../lib/admin";
import * as sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export const registerSchool = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    const { name, domain, adminEmail, type } = request.data as {
      name:       string;
      domain:     string;
      adminEmail: string;
      type:       "middle" | "high" | "k12";
    };

    if (!name || !domain || !adminEmail || !type) {
      throw new functions.HttpsError("invalid-argument", "All fields required.");
    }

    // Validate domain format
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      throw new functions.HttpsError("invalid-argument", "Invalid domain format.");
    }

    // Check if already registered
    const existing = await db.collection("schools").doc(domain).get();
    if (existing.exists) {
      throw new functions.HttpsError("already-exists", "This school domain is already registered.");
    }

    // Create school in pending state
    await db.collection("schools").doc(domain).set({
      domain,
      name,
      type,
      adminEmail,
      approved: false,
      brandColor: "#0055FF",
      logoUrl:    null,
      subjects: [
        "Algebra","Geometry","Pre-Calculus","Calculus","Statistics",
        "Biology","Chemistry","Physics","Earth Science",
        "English","History","Spanish","French","Computer Science","Economics",
      ],
      createdAt: FieldValue.serverTimestamp(),
    });

    // Notify ops team
    const superAdmin = process.env.SUPER_ADMIN_EMAIL ?? "admin@peertutor.app";
    try {
      await sgMail.send({
        to:      superAdmin,
        from:    { email: "noreply@peertutor.app", name: "PeerTutor" },
        subject: `New school registration: ${name} (${domain})`,
        text:    `School: ${name}\nDomain: ${domain}\nType: ${type}\nAdmin: ${adminEmail}\n\nApprove at: https://admin.peertutor.app/schools/${domain}`,
      });
    } catch (err) {
      console.error("Ops notification email failed:", err);
    }

    return {
      success: true,
      message: "Registration submitted. Your school will be approved within 24 hours.",
    };
  }
);
