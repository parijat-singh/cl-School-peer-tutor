// POST /auth/update-tutor-profile

import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";

export async function updateTutorProfile(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const body = parseBody<{ subjects: string[]; bio: string }>(event);
  if (!body) return error(400, "Request body required.");

  const { subjects, bio } = body;

  if (!Array.isArray(subjects) || subjects.length === 0) {
    return error(400, "At least one subject required.");
  }
  if (bio && bio.length > 280) {
    return error(400, "Bio max 280 characters.");
  }

  await ddb.send(new UpdateCommand({
    TableName: Tables.Users,
    Key: { uid: caller.uid },
    UpdateExpression: "SET subjects = :subjects, bio = :bio, updatedAt = :now",
    ExpressionAttributeValues: {
      ":subjects": subjects,
      ":bio": bio?.trim() ?? "",
      ":now": new Date().toISOString(),
    },
  }));

  return json({ success: true });
}
