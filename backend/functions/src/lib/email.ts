// functions/src/lib/email.ts
// SendGrid email helper — all external email goes through here

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sgMailModule = require("@sendgrid/mail");
const sgMail = sgMailModule.default ?? sgMailModule;

sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? "");

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL ?? "noreply@peertutor.app",
  name:  process.env.SENDGRID_FROM_NAME  ?? "PeerTutor",
};

// ── Generic send ─────────────────────────────────────────────────

async function send(to: string, templateId: string, data: Record<string, unknown>) {
  await sgMail.send({
    to,
    from: FROM,
    templateId,
    dynamicTemplateData: data,
  });
}

// ── Booking confirmation ─────────────────────────────────────────

export async function sendBookingConfirmation(params: {
  tutorEmail:  string;
  tutorName:   string;
  tuteeEmail:  string;
  tuteeName:   string;
  subject:     string;
  day:         string;
  startTime:   string;
  endTime:     string;
  duration:    number;
  scheduledDate: string;
  meetLink:    string | null;
  sessionId:   string;
}) {
  const tplId = process.env.SENDGRID_TEMPLATE_BOOKING_CONFIRMATION!;
  const icsAttachment = generateIcs(params);

  // Email tutee
  await sgMail.send({
    to: params.tuteeEmail,
    from: FROM,
    templateId: tplId,
    dynamicTemplateData: {
      recipientName: params.tuteeName,
      otherParty:    params.tutorName,
      role: "tutee",
      ...params,
    },
    attachments: icsAttachment ? [icsAttachment] : [],
  });

  // Email tutor
  await sgMail.send({
    to: params.tutorEmail,
    from: FROM,
    templateId: tplId,
    dynamicTemplateData: {
      recipientName: params.tutorName,
      otherParty:    params.tuteeName,
      role: "tutor",
      ...params,
    },
    attachments: icsAttachment ? [icsAttachment] : [],
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
  await send(
    params.recipientEmail,
    process.env.SENDGRID_TEMPLATE_CANCELLATION!,
    params
  );
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
  await send(
    params.recipientEmail,
    process.env.SENDGRID_TEMPLATE_REMINDER!,
    params
  );
}

// ── Rating prompt ────────────────────────────────────────────────

export async function sendRatingPrompt(params: {
  recipientEmail: string;
  recipientName:  string;
  otherPartyName: string;
  sessionId:      string;
  subject:        string;
}) {
  await send(
    params.recipientEmail,
    process.env.SENDGRID_TEMPLATE_RATING_PROMPT!,
    {
      ...params,
      rateUrl: `https://peertutor.app/rate/${params.sessionId}`,
    }
  );
}

// ── Email OTP verification ───────────────────────────────────────

export async function sendOtpEmail(params: {
  to: string;
  otp: string;
  expiresMinutes: number;
}) {
  await sgMail.send({
    to:      params.to,
    from:    FROM,
    subject: "Your PeerTutor verification code",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:8px">
        <div style="text-align:center;margin-bottom:24px">
          <span style="font-size:22px;font-weight:700;color:#1e3a5f">PeerTutor</span>
        </div>
        <h2 style="font-size:20px;color:#111827;margin:0 0 8px">Verify your email address</h2>
        <p style="color:#6b7280;font-size:14px;margin:0 0 24px">
          Enter the 6-digit code below in the app to activate your account.
          This code expires in <strong>${params.expiresMinutes} minutes</strong>.
        </p>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
          <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#2563eb;font-family:monospace">
            ${params.otp}
          </span>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">
          If you didn't create a PeerTutor account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

// ── ICS calendar invite ──────────────────────────────────────────

function generateIcs(params: {
  scheduledDate: string;
  startTime:     string;
  endTime:       string;
  subject:       string;
  tutorName:     string;
  tuteeName:     string;
  meetLink:      string | null;
  sessionId:     string;
}): { content: string; filename: string; type: string; disposition: string } | null {
  try {
    const date = params.scheduledDate.split("T")[0].replace(/-/g, "");
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
      content:     Buffer.from(ics).toString("base64"),
      filename:    "session.ics",
      type:        "text/calendar",
      disposition: "attachment",
    };
  } catch {
    return null;
  }
}
