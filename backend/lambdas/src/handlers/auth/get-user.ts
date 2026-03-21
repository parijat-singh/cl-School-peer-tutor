// GET /users/{uid} — Returns a user's public profile.

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { json, error } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";

export async function getUser(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const uid = pathParam(event, "uid");

  const result = await ddb.send(new GetCommand({
    TableName: Tables.Users,
    Key: { uid },
  }));

  if (!result.Item) return error(404, "User not found.");

  // Return public-safe fields
  const user = result.Item;
  return json({
    uid: user.uid,
    name: user.name,
    role: user.role,
    grade: user.grade,
    schoolDomain: user.schoolDomain,
    subjects: user.subjects,
    bio: user.bio,
    avgRating: user.avgRating,
    reviewCount: user.reviewCount,
    status: user.status,
  });
}
