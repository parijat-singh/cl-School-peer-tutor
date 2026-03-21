// GET /sessions/{sessionId}
// Returns a single session by ID. Caller must be the tutor or tutee of the session.

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";

export async function getSession(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const uid = getAuth(event).sub;
  if (!uid) return error(401, "Unauthorized");

  const sessionId = event.pathParameters?.sessionId;
  if (!sessionId) return error(400, "Missing sessionId");

  const result = await ddb.send(new GetCommand({
    TableName: Tables.Sessions,
    Key: { sessionId },
  }));

  if (!result.Item) return error(404, "Session not found");

  // Only allow tutor or tutee to view
  if (result.Item.tutorId !== uid && result.Item.tuteeId !== uid) {
    return error(403, "Not authorized to view this session");
  }

  return json(result.Item);
}
