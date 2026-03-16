// functions/src/contact/submitContactForm.ts
// Public callable function — no auth required.
// Accepts contact/feedback form submissions and emails them to the admin.

import * as functions from "firebase-functions/v2/https";
import * as nodemailer from "nodemailer";
import { db, FieldValue } from "../lib/admin";

type FormType = "contact" | "feedback";

interface ContactPayload {
  type:       FormType;
  name:       string;
  email:      string;
  subject?:   string;       // contact only
  category?:  string;       // feedback only
  rating?:    number;       // feedback only (1-5)
  message:    string;
}

const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? "admin@schoolpeertutor.com";

// ── Shared transport ──────────────────────────────────────────────

function makeTransport() {
  const port = Number(process.env.SMTP_PORT ?? "465");
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   ?? "smtp.resend.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
    tls: { rejectUnauthorized: false },
  });
}

const FROM = `"${process.env.SMTP_FROM_NAME ?? "PeerTutor"}" <${process.env.SMTP_FROM_EMAIL ?? ADMIN_EMAIL}>`;

// ── Email HTML builders ───────────────────────────────────────────

function contactHtml(p: ContactPayload): string {
  const stars = p.rating ? "★".repeat(p.rating) + "☆".repeat(5 - p.rating) : "";
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:20px;">
          <div style="background:#1e3a5f;border-radius:10px;padding:10px 24px;display:inline-block;">
            <span style="font-size:20px;font-weight:700;color:#fff;">Peer<span style="color:#93c5fd;">Tutor</span></span>
          </div>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.07);overflow:hidden;">

          <!-- Card header -->
          <div style="background:linear-gradient(135deg,#1e3a5f,#2d5a8e);padding:28px 36px;">
            <div style="font-size:28px;margin-bottom:8px;">${p.type === "feedback" ? "💬" : "✉️"}</div>
            <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#fff;">
              ${p.type === "feedback" ? "New Feedback Received" : "New Contact Form Message"}
            </h1>
            <p style="margin:0;font-size:13px;color:#bfdbfe;">
              ${p.type === "feedback" ? `Category: ${p.category ?? "General"}` : `Subject: ${p.subject ?? "No subject"}`}
              ${stars ? `&nbsp;·&nbsp;<span style="color:#fde68a;">${stars}</span>` : ""}
            </p>
          </div>

          <!-- Card body -->
          <div style="padding:28px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
              <tr>
                <td style="font-size:13px;color:#6b7280;font-weight:600;width:30%;padding:6px 0;vertical-align:top;">From</td>
                <td style="font-size:13px;color:#111827;padding:6px 0;">${p.name}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#6b7280;font-weight:600;padding:6px 0;vertical-align:top;">Email</td>
                <td style="font-size:13px;padding:6px 0;">
                  <a href="mailto:${p.email}" style="color:#2563eb;text-decoration:none;">${p.email}</a>
                </td>
              </tr>
              ${p.type === "contact" ? `
              <tr>
                <td style="font-size:13px;color:#6b7280;font-weight:600;padding:6px 0;vertical-align:top;">Subject</td>
                <td style="font-size:13px;color:#111827;padding:6px 0;">${p.subject ?? "—"}</td>
              </tr>` : `
              <tr>
                <td style="font-size:13px;color:#6b7280;font-weight:600;padding:6px 0;vertical-align:top;">Category</td>
                <td style="font-size:13px;color:#111827;padding:6px 0;">${p.category ?? "General"}</td>
              </tr>
              ${p.rating ? `<tr>
                <td style="font-size:13px;color:#6b7280;font-weight:600;padding:6px 0;vertical-align:top;">Rating</td>
                <td style="font-size:22px;padding:6px 0;color:#f59e0b;">${"★".repeat(p.rating)}${"☆".repeat(5 - p.rating)}</td>
              </tr>` : ""}`}
            </table>

            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Message</p>
            <div style="background:#f8fafc;border-left:3px solid #2563eb;padding:16px 20px;border-radius:0 8px 8px 0;">
              <p style="margin:0;font-size:14px;color:#111827;line-height:1.7;white-space:pre-wrap;">${p.message}</p>
            </div>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Reply directly to this email to respond to ${p.name}.<br/>
              Submitted via <strong>schoolpeertutor.com</strong> on ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}.
            </p>
          </div>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Cloud Function ────────────────────────────────────────────────

export const submitContactForm = functions.onCall(
  { region: "us-central1" },
  async (request) => {
    const p = request.data as ContactPayload;

    // Validate
    if (!p.name?.trim() || !p.email?.trim() || !p.message?.trim()) {
      throw new functions.HttpsError("invalid-argument", "Name, email, and message are required.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
      throw new functions.HttpsError("invalid-argument", "Invalid email address.");
    }
    if (p.message.trim().length < 10) {
      throw new functions.HttpsError("invalid-argument", "Message must be at least 10 characters.");
    }
    if (p.type !== "contact" && p.type !== "feedback") {
      throw new functions.HttpsError("invalid-argument", "Type must be contact or feedback.");
    }

    const subject = p.type === "feedback"
      ? `[Feedback] ${p.category ?? "General"} from ${p.name}`
      : `[Contact] ${p.subject ?? "Inquiry"} from ${p.name}`;

    // Send email to admin
    const transport = makeTransport();
    await transport.sendMail({
      from: FROM,
      to:   ADMIN_EMAIL,
      replyTo: `"${p.name}" <${p.email}>`,
      subject,
      html: contactHtml(p),
    });

    // Send confirmation to sender
    const confirmHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding-bottom:20px;">
          <div style="background:#1e3a5f;border-radius:10px;padding:10px 24px;display:inline-block;">
            <span style="font-size:20px;font-weight:700;color:#fff;">Peer<span style="color:#93c5fd;">Tutor</span></span>
          </div>
        </td></tr>
        <tr><td style="background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.07);overflow:hidden;">
          <div style="background:linear-gradient(135deg,#1e3a5f,#2d5a8e);padding:28px 36px;">
            <div style="font-size:28px;margin-bottom:8px;">✅</div>
            <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#fff;">We got your message!</h1>
            <p style="margin:0;font-size:13px;color:#bfdbfe;">We'll get back to you within 1–2 business days.</p>
          </div>
          <div style="padding:28px 36px;">
            <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6;">
              Hi <strong>${p.name}</strong>,<br/>
              Thanks for reaching out. We've received your ${p.type === "feedback" ? "feedback" : "message"} and will respond to <strong>${p.email}</strong> shortly.
            </p>
            <div style="background:#f8fafc;border-left:3px solid #2563eb;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:20px;">
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;white-space:pre-wrap;">${p.message.slice(0, 200)}${p.message.length > 200 ? "…" : ""}</p>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
            <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} PeerTutor · schoolpeertutor.com</p>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await transport.sendMail({
      from: FROM,
      to:   p.email,
      subject: `We received your ${p.type === "feedback" ? "feedback" : "message"} — PeerTutor`,
      html: confirmHtml,
    });

    // Archive in Firestore
    await db.collection("contactSubmissions").add({
      type:      p.type,
      name:      p.name,
      email:     p.email,
      subject:   p.subject ?? null,
      category:  p.category ?? null,
      rating:    p.rating   ?? null,
      message:   p.message,
      createdAt: FieldValue.serverTimestamp(),
      read:      false,
    });

    return { success: true };
  }
);
