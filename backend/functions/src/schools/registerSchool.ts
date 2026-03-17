// functions/src/schools/registerSchool.ts
// Called from a school self-service registration form
// Creates school doc in "pending" state; ops team approves it

import * as functions from "firebase-functions/v2/https";
import * as nodemailer from "nodemailer";
import { db, FieldValue } from "../lib/admin";

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

    // Notify all super admins
    try {
      const smtpPort = Number(process.env.SMTP_PORT ?? "465");
      const t = nodemailer.createTransport({
        host:   process.env.SMTP_HOST ?? "smtp.resend.com",
        port:   smtpPort,
        secure: smtpPort === 465,
        auth:   { user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASS ?? "" },
        tls:    { rejectUnauthorized: false },
      });
      await t.sendMail({
        from:    `"${process.env.SMTP_FROM_NAME ?? "PeerTutor"}" <${process.env.SMTP_FROM_EMAIL ?? ""}>`,
        to:      process.env.SUPER_ADMIN_EMAIL ?? "",
        subject: `New school registration: ${name} (${domain})`,
        text:    `School: ${name}\nDomain: ${domain}\nType: ${type}\nAdmin: ${adminEmail}\n\nApprove at: https://schoolpeertutor.com/admin/schools/${domain}`,
      });
    } catch (err) {
      console.error("Super admin notification email failed:", err);
    }

    return {
      success: true,
      message: "Registration submitted. Your school will be approved within 24 hours.",
    };
  }
);
