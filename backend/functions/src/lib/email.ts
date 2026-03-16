// functions/src/lib/email.ts
// Nodemailer SMTP email helper — all outbound email goes through here.
// Port 465 → SSL (secure:true). Port 587 → STARTTLS (secure:false).

import * as nodemailer from "nodemailer";

// ── Transport ─────────────────────────────────────────────────────

const SMTP_PORT = Number(process.env.SMTP_PORT ?? "587");

const transport = nodemailer.createTransport({
  host:   process.env.SMTP_HOST ?? "smtp.resend.com",
  port:   SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
  },
  tls: { rejectUnauthorized: false },
});

const FROM_NAME  = process.env.SMTP_FROM_NAME  ?? "PeerTutor";
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? "";
const FROM       = `"${FROM_NAME}" <${FROM_EMAIL}>`;

// ── Shared brand styles ───────────────────────────────────────────

const BRAND_COLOR  = "#1e3a5f";
const ACCENT_COLOR = "#2563eb";
const BG_COLOR     = "#f1f5f9";
const CARD_COLOR   = "#ffffff";
const TEXT_PRIMARY = "#111827";
const TEXT_MUTED   = "#6b7280";
const TEXT_TINY    = "#9ca3af";

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

          <!-- Header / Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${BRAND_COLOR};border-radius:12px;padding:12px 28px;">
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                      Peer<span style="color:#93c5fd;">Tutor</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:${CARD_COLOR};border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 8px;">
              <p style="margin:0;font-size:12px;color:${TEXT_TINY};line-height:1.6;">
                You're receiving this because you have an account at <strong>PeerTutor</strong>.<br/>
                If this wasn't you, you can safely ignore this email.
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:${TEXT_TINY};">
                &copy; ${new Date().getFullYear()} PeerTutor. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function cardHeader(icon: string, title: string, subtitle: string): string {
  return `
    <div style="background:linear-gradient(135deg,${BRAND_COLOR} 0%,#2d5a8e 100%);padding:36px 40px 28px;">
      <div style="font-size:36px;margin-bottom:12px;">${icon}</div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.2;">${title}</h1>
      <p style="margin:0;font-size:14px;color:#bfdbfe;line-height:1.5;">${subtitle}</p>
    </div>`;
}

function cardBody(content: string): string {
  return `<div style="padding:32px 40px;">${content}</div>`;
}

function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:${TEXT_MUTED};font-weight:600;width:36%;vertical-align:top;">${label}</td>
      <td style="padding:8px 0;font-size:13px;color:${TEXT_PRIMARY};font-weight:500;vertical-align:top;">${value}</td>
    </tr>`;
}

function ctaButton(text: string, href: string): string {
  return `
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${href}" style="display:inline-block;background:${ACCENT_COLOR};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">${text}</a>
    </div>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>`;
}

// ── Booking confirmation ─────────────────────────────────────────

export async function sendBookingConfirmation(params: {
  tutorEmail:    string;
  tutorName:     string;
  tuteeEmail:    string;
  tuteeName:     string;
  subject:       string;
  day:           string;
  startTime:     string;
  endTime:       string;
  duration:      number;
  scheduledDate: string;
  meetLink:      string | null;
  sessionId:     string;
}) {
  const dateLabel = new Date(params.scheduledDate).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const makeHtml = (recipientName: string, otherParty: string, role: "tutor" | "tutee") => {
    const roleLabel = role === "tutor" ? "You're teaching" : "Session with";
    return layout("Session Confirmed — PeerTutor",
      cardHeader("📚", "Session Confirmed!", `${roleLabel} ${otherParty}`) +
      cardBody(`
        <p style="margin:0 0 24px;font-size:15px;color:${TEXT_PRIMARY};line-height:1.6;">
          Hi <strong>${recipientName}</strong>,<br/>
          Your tutoring session has been booked successfully. Here are the details:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <tbody>
            ${detailRow("Subject",  params.subject)}
            ${detailRow("Date",     dateLabel)}
            ${detailRow("Time",     `${params.startTime} – ${params.endTime}`)}
            ${detailRow("Duration", `${params.duration} min`)}
            ${role === "tutor"
              ? detailRow("Student", params.tuteeName)
              : detailRow("Tutor",   params.tutorName)}
          </tbody>
        </table>
        ${params.meetLink
          ? ctaButton("Join Meeting", params.meetLink)
          : `<p style="text-align:center;font-size:13px;color:${TEXT_MUTED};margin:16px 0 0;">
               Your tutor will share the meeting link closer to the session.
             </p>`}
        ${divider()}
        <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.6;">
          Need to cancel? Please do so at least <strong>24 hours in advance</strong> through the PeerTutor app.
        </p>
      `)
    );
  };

  const icsAttachment = generateIcs(params);
  const attachments   = icsAttachment ? [icsAttachment] : [];

  await transport.sendMail({
    from: FROM, to: params.tuteeEmail,
    subject: `Session Confirmed: ${params.subject} on ${params.day}`,
    html: makeHtml(params.tuteeName, params.tutorName, "tutee"),
    attachments,
  });

  await transport.sendMail({
    from: FROM, to: params.tutorEmail,
    subject: `New Session: ${params.subject} with ${params.tuteeName}`,
    html: makeHtml(params.tutorName, params.tuteeName, "tutor"),
    attachments,
  });
}

// ── Cancellation ─────────────────────────────────────────────────

export async function sendCancellationEmail(params: {
  recipientEmail: string;
  recipientName:  string;
  otherPartyName: string;
  subject:        string;
  scheduledDate:  string;
  cancelledBy:    "tutor" | "tutee";
}) {
  const dateLabel = new Date(params.scheduledDate).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const html = layout("Session Cancelled — PeerTutor",
    cardHeader("❌", "Session Cancelled", `Your ${params.subject} session has been cancelled`) +
    cardBody(`
      <p style="margin:0 0 24px;font-size:15px;color:${TEXT_PRIMARY};line-height:1.6;">
        Hi <strong>${params.recipientName}</strong>,<br/>
        Unfortunately, your upcoming session has been cancelled by
        <strong>${params.cancelledBy === "tutor" ? "your tutor" : "the student"}</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <tbody>
          ${detailRow("Subject",      params.subject)}
          ${detailRow("Date",         dateLabel)}
          ${detailRow("Cancelled by", params.cancelledBy === "tutor" ? params.otherPartyName : "You")}
        </tbody>
      </table>
      ${ctaButton("Find Another Session", "https://schoolpeertutor.com/find-tutor")}
      ${divider()}
      <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.6;">
        You can book a new session anytime through the PeerTutor app.
      </p>
    `)
  );

  await transport.sendMail({
    from: FROM, to: params.recipientEmail,
    subject: `Session Cancelled: ${params.subject} on ${dateLabel}`,
    html,
  });
}

// ── Reminder ─────────────────────────────────────────────────────

export async function sendReminderEmail(params: {
  recipientEmail: string;
  recipientName:  string;
  otherPartyName: string;
  subject:        string;
  startTime:      string;
  scheduledDate:  string;
  meetLink:       string | null;
  hoursUntil:     number;
}) {
  const dateLabel = new Date(params.scheduledDate).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const timeUntil = params.hoursUntil === 1 ? "1 hour" : `${params.hoursUntil} hours`;

  const html = layout("Session Reminder — PeerTutor",
    cardHeader("⏰", `Reminder: ${timeUntil} to go!`, `Your ${params.subject} session is coming up soon`) +
    cardBody(`
      <p style="margin:0 0 24px;font-size:15px;color:${TEXT_PRIMARY};line-height:1.6;">
        Hi <strong>${params.recipientName}</strong>,<br/>
        Just a heads-up — your tutoring session starts in <strong>${timeUntil}</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <tbody>
          ${detailRow("Subject", params.subject)}
          ${detailRow("Date",    dateLabel)}
          ${detailRow("Time",    params.startTime)}
          ${detailRow("With",    params.otherPartyName)}
        </tbody>
      </table>
      ${params.meetLink
        ? ctaButton("Join Meeting Now", params.meetLink)
        : `<p style="text-align:center;font-size:13px;color:${TEXT_MUTED};">Check the app for the meeting link.</p>`}
    `)
  );

  await transport.sendMail({
    from: FROM, to: params.recipientEmail,
    subject: `Reminder: ${params.subject} session in ${timeUntil}`,
    html,
  });
}

// ── Rating prompt ────────────────────────────────────────────────

export async function sendRatingPrompt(params: {
  recipientEmail: string;
  recipientName:  string;
  otherPartyName: string;
  sessionId:      string;
  subject:        string;
}) {
  const rateUrl = `https://schoolpeertutor.com/rate/${params.sessionId}`;

  const html = layout("How was your session? — PeerTutor",
    cardHeader("⭐", "How was your session?", `Rate your ${params.subject} session`) +
    cardBody(`
      <p style="margin:0 0 24px;font-size:15px;color:${TEXT_PRIMARY};line-height:1.6;">
        Hi <strong>${params.recipientName}</strong>,<br/>
        Your tutoring session with <strong>${params.otherPartyName}</strong> is complete.
        Your feedback helps the PeerTutor community thrive!
      </p>
      ${ctaButton("Leave a Review", rateUrl)}
      ${divider()}
      <p style="margin:0;font-size:13px;color:${TEXT_MUTED};text-align:center;line-height:1.6;">
        It only takes 30 seconds. Your honest review makes a real difference.
      </p>
    `)
  );

  await transport.sendMail({
    from: FROM, to: params.recipientEmail,
    subject: `How was your ${params.subject} session with ${params.otherPartyName}?`,
    html,
  });
}

// ── Email OTP verification ────────────────────────────────────────

export async function sendOtpEmail(params: {
  to:             string;
  otp:            string;
  expiresMinutes: number;
}) {
  const digits = params.otp.split("").map(d =>
    `<span style="display:inline-block;width:44px;height:56px;line-height:56px;text-align:center;font-size:28px;font-weight:700;color:${ACCENT_COLOR};background:#eff6ff;border:2px solid #bfdbfe;border-radius:8px;margin:0 3px;font-family:monospace;">${d}</span>`
  ).join("");

  const html = layout("Verify your email — PeerTutor",
    cardHeader("✉️", "Verify your email", "Enter the code below to activate your account") +
    cardBody(`
      <p style="margin:0 0 28px;font-size:15px;color:${TEXT_PRIMARY};line-height:1.6;">
        Thanks for signing up! Enter this 6-digit code in the app to verify your email address.
        The code expires in <strong>${params.expiresMinutes} minutes</strong>.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        ${digits}
      </div>
      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
          🔒 <strong>Never share this code</strong> with anyone. PeerTutor staff will never ask for it.
        </p>
      </div>
    `)
  );

  await transport.sendMail({
    from: FROM, to: params.to,
    subject: "Your PeerTutor verification code",
    html,
  });
}

// ── ICS calendar invite ───────────────────────────────────────────

function generateIcs(params: {
  scheduledDate: string;
  startTime:     string;
  endTime:       string;
  subject:       string;
  tutorName:     string;
  tuteeName:     string;
  meetLink:      string | null;
  sessionId:     string;
}): { filename: string; content: Buffer; contentType: string } | null {
  try {
    const date  = params.scheduledDate.split("T")[0].replace(/-/g, "");
    const start = params.startTime.replace(":", "");
    const end   = params.endTime.replace(":", "");
    const uid   = `${params.sessionId}@peertutor.app`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PeerTutor//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART:${date}T${start}00`,
      `DTEND:${date}T${end}00`,
      `SUMMARY:Peer Tutoring: ${params.subject} with ${params.tutorName}`,
      `DESCRIPTION:Session with ${params.tutorName} and ${params.tuteeName}${params.meetLink ? `\\nJoin: ${params.meetLink}` : ""}`,
      params.meetLink ? `LOCATION:${params.meetLink}` : "",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");

    return {
      filename:    "session.ics",
      content:     Buffer.from(ics),
      contentType: "text/calendar",
    };
  } catch {
    return null;
  }
}

