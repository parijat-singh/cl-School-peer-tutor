// POST /auth/verify-email-otp
// Verifies the 6-digit OTP and activates the user account on success.

import * as crypto from "crypto";
import { GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { cognitoUpdateAttributes } from "../../shared/cognito-admin.js";

const MAX_ATTEMPTS = 5;

function hashOtp(uid: string, otp: string): string {
  return crypto.createHash("sha256").update(`${uid}:${otp}`).digest("hex");
}

export async function verifyEmailOtp(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const body = parseBody<{ otp: string }>(event);
  if (!body?.otp || body.otp.length !== 6) return error(400, "OTP must be 6 digits.");

  const ref = { TableName: Tables.EmailVerifications, Key: { uid: caller.uid } };
  const snap = await ddb.send(new GetCommand(ref));
  if (!snap.Item) return error(404, "No pending verification. Request a new code.");

  const data = snap.Item;

  // Check expiry
  if (new Date() > new Date(data.expiresAtIso as string)) {
    await ddb.send(new DeleteCommand(ref));
    return error(410, "Code expired. Please request a new one.");
  }

  // Check attempt limit
  if ((data.attempts as number) >= MAX_ATTEMPTS) {
    await ddb.send(new DeleteCommand(ref));
    return error(429, "Too many attempts. Please request a new code.");
  }

  // Verify hash
  const expected = hashOtp(caller.uid, body.otp);
  if (data.otpHash !== expected) {
    await ddb.send(new UpdateCommand({
      TableName: Tables.EmailVerifications,
      Key: { uid: caller.uid },
      UpdateExpression: "SET attempts = attempts + :one",
      ExpressionAttributeValues: { ":one": 1 },
    }));
    const remaining = MAX_ATTEMPTS - (data.attempts as number) - 1;
    return error(400,
      remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
        : "Too many attempts. Request a new code."
    );
  }

  // ── Success ──────────────────────────────────────────────────
  await ddb.send(new DeleteCommand(ref));

  // Activate the user document
  const userResult = await ddb.send(new GetCommand({
    TableName: Tables.Users,
    Key: { uid: caller.uid },
  }));
  if (!userResult.Item) return error(404, "User document not found.");

  const now = new Date().toISOString();
  await ddb.send(new UpdateCommand({
    TableName: Tables.Users,
    Key: { uid: caller.uid },
    UpdateExpression: "SET #status = :active, updatedAt = :now",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":active": "active", ":now": now },
  }));

  // Update Cognito attributes
  try {
    await cognitoUpdateAttributes(caller.uid, {
      "custom:role": userResult.Item.role as string,
      "custom:schoolDomain": userResult.Item.schoolDomain as string,
      "custom:status": "active",
    });
  } catch (err) {
    console.error("Failed to update Cognito attributes:", err);
  }

  return json({ verified: true });
}
