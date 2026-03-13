// functions/src/lib/email.ts
// SendGrid email helper — all external email goes through here

import * as sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

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

// ── Parental consent ─────────────────────────────────────────────

export async function sendParentalConsentEmail(params: {
  parentEmail:  string;
  studentName:  string;
  studentEmail: string;
  consentUrl:   string;
}) {
  await send(
    params.parentEmail,
    process.env.SENDGRID_TEMPLATE_PARENTAL_CONSENT!,
    params
  );
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
