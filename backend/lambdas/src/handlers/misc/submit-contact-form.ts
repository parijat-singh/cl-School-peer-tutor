// POST /contact/submit [PUBLIC — no auth required]

import * as nodemailer from "nodemailer";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";

type FormType = "contact" | "feedback";

interface ContactPayload {
  type: FormType; name: string; email: string;
  subject?: string; category?: string; rating?: number; message: string;
}

const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? "admin@schoolpeertutor.com";
const FROM = `"${process.env.SMTP_FROM_NAME ?? "PeerTutor"}" <${process.env.SMTP_FROM_EMAIL ?? ADMIN_EMAIL}>`;

function makeTransport() {
  const port = Number(process.env.SMTP_PORT ?? "465");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.resend.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASS ?? "" },
    tls: { rejectUnauthorized: false },
  });
}

export async function submitContactForm(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const p = parseBody<ContactPayload>(event);
  if (!p) return error(400, "Request body required.");

  if (!p.name?.trim() || !p.email?.trim() || !p.message?.trim()) {
    return error(400, "Name, email, and message are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
    return error(400, "Invalid email address.");
  }
  if (p.message.trim().length < 10) {
    return error(400, "Message must be at least 10 characters.");
  }
  if (p.type !== "contact" && p.type !== "feedback") {
    return error(400, "Type must be contact or feedback.");
  }

  const subject = p.type === "feedback"
    ? `[Feedback] ${p.category ?? "General"} from ${p.name}`
    : `[Contact] ${p.subject ?? "Inquiry"} from ${p.name}`;

  // Send emails (skip if SMTP not configured — e.g. local dev)
  try {
    const transport = makeTransport();

    await transport.sendMail({
      from: FROM,
      to: ADMIN_EMAIL,
      replyTo: `"${p.name}" <${p.email}>`,
      subject,
      text: `From: ${p.name} <${p.email}>\nType: ${p.type}\n${p.subject ? `Subject: ${p.subject}\n` : ""}${p.category ? `Category: ${p.category}\n` : ""}${p.rating ? `Rating: ${p.rating}/5\n` : ""}\nMessage:\n${p.message}`,
    });

    await transport.sendMail({
      from: FROM,
      to: p.email,
      subject: `We received your ${p.type === "feedback" ? "feedback" : "message"} — PeerTutor`,
      text: `Hi ${p.name},\n\nThanks for reaching out. We've received your ${p.type} and will respond within 1-2 business days.\n\nYour message:\n${p.message.slice(0, 200)}${p.message.length > 200 ? "…" : ""}\n\n— PeerTutor Team`,
    });
  } catch (emailErr) {
    console.warn("Email send failed (non-fatal):", (emailErr as Error).message);
  }

  // Archive in DynamoDB
  const now = new Date();
  await ddb.send(new PutCommand({
    TableName: Tables.ContactSubmissions,
    Item: {
      submissionId: ulid(),
      type: p.type,
      name: p.name,
      email: p.email,
      subject: p.subject ?? null,
      category: p.category ?? null,
      rating: p.rating ?? null,
      message: p.message,
      createdAt: now.toISOString(),
      expiresAt: Math.floor(now.getTime() / 1000) + 90 * 86400, // TTL: 90 days
      read: false,
    },
  }));

  return json({ success: true });
}
