// POST /auth/initialize-user
// Called by frontend after Cognito ConfirmSignUp to create the DynamoDB user doc
// and set Cognito custom attributes.

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { cognitoUpdateAttributes } from "../../shared/cognito-admin.js";

const schema = z.object({
  name: z.string().min(1).max(200),
  role: z.enum(["tutee", "tutor"]),
  schoolDomain: z.string().min(1).max(256),
  grade: z.string().optional(),
  subjects: z.array(z.string()).optional(),
});

export async function initializeUser(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const body = parseBody(event);
  if (!body) return error(400, "Request body required.");

  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, parsed.error.issues[0]?.message ?? "Invalid input.");

  const { name, role, schoolDomain, grade, subjects } = parsed.data;

  // Verify school domain is approved
  const schoolResult = await ddb.send(new GetCommand({
    TableName: Tables.Schools,
    Key: { domain: schoolDomain },
  }));
  if (!schoolResult.Item?.approved) {
    return error(400, "School is not approved.");
  }

  // Prevent re-initialization
  const existingUser = await ddb.send(new GetCommand({
    TableName: Tables.Users,
    Key: { uid: caller.uid },
  }));
  if (existingUser.Item) {
    return error(409, "User already initialized.");
  }

  const now = new Date().toISOString();

  // Create user doc
  await ddb.send(new PutCommand({
    TableName: Tables.Users,
    Item: {
      uid: caller.uid,
      name,
      email: caller.email,
      role,
      schoolDomain,
      grade: grade ?? null,
      subjects: subjects ?? [],
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  }));

  // Set Cognito custom attributes
  try {
    await cognitoUpdateAttributes(caller.uid, {
      "custom:role": role,
      "custom:schoolDomain": schoolDomain,
      "custom:status": "active",
    });
  } catch (err) {
    console.error("Failed to set Cognito attributes:", err);
  }

  return json({ success: true });
}
