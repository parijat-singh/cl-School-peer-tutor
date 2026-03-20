// functions/src/schools/registerSchool.ts
// Called from a school self-service registration form
// Creates school doc in "pending" state; ops team approves it

import * as functions from "firebase-functions/v2/https";
import * as nodemailer from "nodemailer";
import { z } from "zod";
import { db, FieldValue } from "../lib/admin";
import { captureError } from "../lib/sentry";

export const registerSchoolSchema = z.object({
  name:       z.string().min(1).max(200),
  domain:     z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Invalid domain format."),
  adminEmail: z.string().email(),
  type:       z.enum(["middle", "high", "k12"]),
});

export const registerSchool = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    const parsed = registerSchoolSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new functions.HttpsError("invalid-argument", parsed.error.issues[0]?.message ?? "Invalid input.");
    }
    const { name, domain, adminEmail, type } = parsed.data;

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
    let emailSent = false;
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    if (!superAdminEmail) {
      console.warn("SUPER_ADMIN_EMAIL not set — skipping admin notification.");
    } else {
      try {
        const smtpPort = Number(process.env.SMTP_PORT ?? "465");
        const t = nodemailer.createTransport({
          host:   process.env.SMTP_HOST ?? "smtp.resend.com",
          port:   smtpPort,
          secure: smtpPort === 465,
          auth:   { user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASS ?? "" },
        });
        await t.sendMail({
          from:    `"${process.env.SMTP_FROM_NAME ?? "PeerTutor"}" <${process.env.SMTP_FROM_EMAIL ?? ""}>`,
          to:      superAdminEmail,
          subject: `New school registration: ${name} (${domain})`,
          text:    `School: ${name}\nDomain: ${domain}\nType: ${type}\nAdmin: ${adminEmail}\n\nApprove at: https://schoolpeertutor.com/admin/schools/${domain}`,
        });
        emailSent = true;
      } catch (err) {
        captureError(err, { function: "registerSchool", action: "superAdminNotificationEmail" });
        console.error("Super admin notification email failed:", err);
      }
    }

    return {
      success: true,
      emailSent,
      message: "Registration submitted. Your school will be approved within 24 hours.",
    };
  }
);
