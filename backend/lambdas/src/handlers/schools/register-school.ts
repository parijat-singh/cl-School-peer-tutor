// POST /schools/register [PUBLIC — no auth required]

import { z } from "zod";
import * as nodemailer from "nodemailer";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { captureError } from "../../shared/sentry.js";

const schema = z.object({
  name:       z.string().min(1).max(200),
  domain:     z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Invalid domain format."),
  adminEmail: z.string().email(),
  type:       z.enum(["middle", "high", "k12"]),
});

const DEFAULT_SUBJECTS = [
  "Algebra", "Geometry", "Pre-Calculus", "Calculus", "Statistics",
  "Biology", "Chemistry", "Physics", "Earth Science",
  "English", "History", "Spanish", "French", "Computer Science", "Economics",
];

export async function registerSchool(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, parsed.error.issues[0]?.message ?? "Invalid input.");

  const { name, domain, adminEmail, type } = parsed.data;

  const existing = await ddb.send(new GetCommand({
    TableName: Tables.Schools,
    Key: { domain },
  }));
  if (existing.Item) return error(409, "This school domain is already registered.");

  const now = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: Tables.Schools,
    Item: {
      domain,
      name,
      type,
      adminEmail,
      approved: false,
      status: "pending",
      brandColor: "#0055FF",
      logoUrl: null,
      subjects: DEFAULT_SUBJECTS,
      createdAt: now,
    },
  }));

  // Notify super admin
  let emailSent = false;
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (superAdminEmail) {
    try {
      const smtpPort = Number(process.env.SMTP_PORT ?? "465");
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? "smtp.resend.com",
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASS ?? "" },
      });
      await t.sendMail({
        from: `"${process.env.SMTP_FROM_NAME ?? "PeerTutor"}" <${process.env.SMTP_FROM_EMAIL ?? ""}>`,
        to: superAdminEmail,
        subject: `New school registration: ${name} (${domain})`,
        text: `School: ${name}\nDomain: ${domain}\nType: ${type}\nAdmin: ${adminEmail}\n\nApprove at: https://schoolpeertutor.com/admin/schools/${domain}`,
      });
      emailSent = true;
    } catch (err) {
      captureError(err, { function: "registerSchool", action: "superAdminNotificationEmail" });
    }
  }

  return json({
    success: true,
    emailSent,
    message: "Registration submitted. Your school will be approved within 24 hours.",
  });
}
