// POST /auth/admin-set-claims
// Sets Cognito custom attributes on a target user (replaces Firebase custom claims).

import { z } from "zod";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { cognitoUpdateAttributes } from "../../shared/cognito-admin.js";

const schema = z.object({
  targetUid: z.string().min(1).max(128),
  claims: z.object({
    role: z.enum(["tutee", "tutor", "teacher", "schooladmin", "superadmin"]),
    schoolDomain: z.string().nullable(),
    status: z.enum(["active", "suspended", "pending"]),
  }),
});

export async function adminSetClaims(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (!["schooladmin", "superadmin"].includes(caller.role)) {
    return error(403, "Admins only.");
  }

  const body = parseBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, parsed.error.issues[0]?.message ?? "Invalid input.");

  const { targetUid, claims } = parsed.data;

  // School admins cannot escalate to superadmin
  if (caller.role === "schooladmin" && claims.role === "superadmin") {
    return error(403, "Cannot promote to super admin.");
  }

  // School admins can only act within their own school
  if (caller.role === "schooladmin") {
    const targetResult = await ddb.send(new GetCommand({
      TableName: Tables.Users,
      Key: { uid: targetUid },
    }));
    if (!targetResult.Item) return error(404, "User not found.");
    if (targetResult.Item.schoolDomain !== caller.schoolDomain) {
      return error(403, "Cross-school action denied.");
    }
  }

  // Set Cognito custom attributes
  const attrs: Record<string, string> = {
    "custom:role": claims.role,
    "custom:status": claims.status,
  };
  if (claims.schoolDomain) {
    attrs["custom:schoolDomain"] = claims.schoolDomain;
  }

  await cognitoUpdateAttributes(targetUid, attrs);

  return json({ success: true });
}
