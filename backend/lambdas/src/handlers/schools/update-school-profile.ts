// PATCH /schools/{domain}/profile

import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";
import { parseBody } from "../../shared/router.js";

export async function updateSchoolProfile(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (!["schooladmin", "superadmin"].includes(caller.role)) {
    return error(403, "Admins only.");
  }

  const domain = pathParam(event, "domain");
  if (caller.role === "schooladmin" && caller.schoolDomain !== domain) {
    return error(403, "Cross-school action denied.");
  }

  const body = parseBody<{
    brandColor?: string; subjects?: string[]; campus?: string;
    address?: string; location?: string; logoUrl?: string;
  }>(event);
  if (!body) return error(400, "Request body required.");

  const updates: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  if (body.brandColor !== undefined) { updates.push("brandColor = :brandColor"); values[":brandColor"] = body.brandColor; }
  if (body.subjects !== undefined) { updates.push("subjects = :subjects"); values[":subjects"] = body.subjects; }
  if (body.campus !== undefined) { updates.push("campus = :campus"); values[":campus"] = body.campus; }
  if (body.address !== undefined) { updates.push("address = :address"); values[":address"] = body.address; }
  if (body.location !== undefined) { updates.push("#loc = :location"); names["#loc"] = "location"; values[":location"] = body.location; }
  if (body.logoUrl !== undefined) { updates.push("logoUrl = :logoUrl"); values[":logoUrl"] = body.logoUrl; }

  if (updates.length === 0) return error(400, "No fields to update.");

  await ddb.send(new UpdateCommand({
    TableName: Tables.Schools,
    Key: { domain },
    UpdateExpression: `SET ${updates.join(", ")}`,
    ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
    ExpressionAttributeValues: values,
  }));

  return json({ success: true });
}
