// Quick SMTP test — run with: node test-smtp.mjs
// Reads credentials from .env in this directory

import { readFileSync } from "fs";
import { createTransport } from "nodemailer";

// ── Load .env manually (no dotenv dependency needed) ──────────────
const envText = readFileSync(new URL(".env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter(l => l.trim() && !l.startsWith("#"))
    .map(l => l.split("=").map((p, i) => (i === 0 ? p.trim() : l.slice(l.indexOf("=") + 1).trim())))
);

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_NAME, SMTP_FROM_EMAIL } = env;

console.log("\n── SMTP config ───────────────────────────────");
console.log(`  Host : ${SMTP_HOST}`);
console.log(`  Port : ${SMTP_PORT}`);
console.log(`  User : ${SMTP_USER}`);
console.log(`  Pass : ${"*".repeat((SMTP_PASS || "").length)}`);
console.log(`  From : "${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`);
console.log("──────────────────────────────────────────────\n");

if (!SMTP_USER || !SMTP_PASS || SMTP_PASS === "YOUR_PASSWORD_OR_APP_PASSWORD_HERE") {
  console.error("❌  SMTP_USER or SMTP_PASS is not set in .env. Aborting.");
  process.exit(1);
}

// ── Create transport ──────────────────────────────────────────────
const smtpPort = Number(SMTP_PORT ?? 587);
const transport = createTransport({
  host:   SMTP_HOST ?? "smtp.resend.com",
  port:   smtpPort,
  secure: smtpPort === 465,
  auth:   { user: SMTP_USER, pass: SMTP_PASS },
  tls:    { rejectUnauthorized: false },
});

// ── Verify connection ─────────────────────────────────────────────
console.log("⏳  Verifying SMTP connection...");
try {
  await transport.verify();
  console.log("✅  SMTP connection verified — credentials are good!\n");
} catch (err) {
  console.error("❌  SMTP verify failed:", err.message);
  process.exit(1);
}

// ── Send test email ───────────────────────────────────────────────
const to = "schoolpeertutor@outlook.com"; // delivery test inbox
console.log(`⏳  Sending test email to ${to}...`);

try {
  const info = await transport.sendMail({
    from:    `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`,
    to,
    subject: "✅ PeerTutor SMTP test — it's working!",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#1e3a5f;margin-top:0;">PeerTutor SMTP Test</h2>
        <p style="color:#374151;">If you're reading this, your Outlook SMTP is correctly configured and real emails are going out! 🎉</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
        <p style="font-size:12px;color:#9ca3af;">
          Sent from: <strong>${SMTP_FROM_EMAIL}</strong><br/>
          Host: ${SMTP_HOST}:${SMTP_PORT}
        </p>
      </div>
    `,
  });

  console.log("✅  Email sent successfully!");
  console.log(`   Message ID : ${info.messageId}`);
  console.log(`   To         : ${to}`);
  console.log("\n👉  Check your inbox at ${to} for the test email.");
} catch (err) {
  console.error("❌  Send failed:", err.message);
  process.exit(1);
}
