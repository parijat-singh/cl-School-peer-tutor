// POST /schools/add — Super admin adds a pre-approved school.

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";

const DEFAULT_SUBJECTS = [
  "Algebra", "Geometry", "Pre-Calculus", "Calculus", "Statistics",
  "Biology", "Chemistry", "Physics", "Earth Science",
  "English", "History", "Spanish", "French", "Computer Science", "Economics",
];

export async function addSchool(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (caller.role !== "superadmin") return error(403, "Only super admins can add schools.");

  const body = parseBody<{
    domain: string; name: string; type: string;
    adminEmail: string; campus: string; address: string; location: string;
  }>(event);
  if (!body?.domain || !body.name || !body.type || !body.adminEmail || !body.campus || !body.address || !body.location) {
    return error(400, "All fields are required.");
  }

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(body.domain)) {
    return error(400, "Invalid domain format.");
  }

  const existing = await ddb.send(new GetCommand({ TableName: Tables.Schools, Key: { domain: body.domain } }));
  if (existing.Item) return error(409, "This school domain is already registered.");

  const now = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: Tables.Schools,
    Item: {
      domain: body.domain, name: body.name, type: body.type,
      adminEmail: body.adminEmail, campus: body.campus, address: body.address, location: body.location,
      approved: true, status: "approved", brandColor: "#0055FF", logoUrl: null,
      subjects: DEFAULT_SUBJECTS, createdAt: now,
    },
  }));

  await ddb.send(new PutCommand({
    TableName: Tables.AdminAuditLog,
    Item: {
      schoolDomain: body.domain,
      timestampLogId: `${now}#${ulid()}`,
      adminUid: caller.uid,
      action: "add_school",
      targetId: body.domain,
      metadata: { name: body.name, type: body.type, adminEmail: body.adminEmail },
      timestamp: now,
    },
  }));

  return json({ success: true, message: `School ${body.name} (${body.domain}) added and approved.` });
}
