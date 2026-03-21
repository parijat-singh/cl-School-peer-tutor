// POST /auth/send-verification-otp
// Generates a 6-digit OTP, stores the hash in DynamoDB, and emails it.

import * as crypto from "crypto";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { sendOtpEmail } from "../../shared/email.js";

function hashOtp(uid: string, otp: string): string {
  return crypto.createHash("sha256").update(`${uid}:${otp}`).digest("hex");
}

export async function sendVerificationOtp(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (!caller.email) return error(400, "No email on account.");

  // Rate-limit: deny if a code was sent in the last 60 seconds
  const existing = await ddb.send(new GetCommand({
    TableName: Tables.EmailVerifications,
    Key: { uid: caller.uid },
  }));

  if (existing.Item) {
    const sentAt = new Date(existing.Item.sentAt as string).getTime();
    const secondsSince = (Date.now() - sentAt) / 1000;
    if (secondsSince < 60) {
      return error(429, `Please wait ${Math.ceil(60 - secondsSince)} seconds before requesting a new code.`);
    }
  }

  // Generate and store OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = hashOtp(caller.uid, otp);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  await ddb.send(new PutCommand({
    TableName: Tables.EmailVerifications,
    Item: {
      uid: caller.uid,
      otpHash,
      expiresAt: Math.floor(expiresAt.getTime() / 1000), // TTL epoch seconds
      expiresAtIso: expiresAt.toISOString(),
      sentAt: now.toISOString(),
      attempts: 0,
      email: caller.email,
    },
  }));

  await sendOtpEmail({ to: caller.email, otp, expiresMinutes: 10 });

  return json({ sent: true });
}
