// POST /reviews/submit

import { GetCommand, UpdateCommand, PutCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";

export async function submitRating(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const body = parseBody<{ sessionId: string; stars: number; text?: string }>(event);
  if (!body?.sessionId || !body.stars || body.stars < 1 || body.stars > 5) {
    return error(400, "Invalid rating data.");
  }

  const { sessionId, stars, text } = body;

  const sessionResult = await ddb.send(new GetCommand({
    TableName: Tables.Sessions,
    Key: { sessionId },
  }));
  if (!sessionResult.Item) return error(404, "Session not found.");

  const session = sessionResult.Item;
  const isTutor = session.tutorId === caller.uid;
  const isTutee = session.tuteeId === caller.uid;
  if (!isTutor && !isTutee) return error(403, "Not a participant.");
  if (isTutor && session.tutorRated) return error(409, "Already rated.");
  if (isTutee && session.tuteeRated) return error(409, "Already rated.");

  const targetId = isTutor ? session.tuteeId : session.tutorId;
  const targetName = isTutor ? session.tuteeName : session.tutorName;
  const authorName = isTutor ? session.tutorName : session.tuteeName;

  const reviewId = ulid();
  const now = new Date().toISOString();

  // Create review + update session flag
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: Tables.Reviews,
          Item: {
            reviewId,
            sessionId,
            authorId: caller.uid,
            authorName,
            targetId,
            targetName,
            stars,
            text: text?.trim() ?? null,
            flagged: false,
            flaggedBy: null,
            schoolDomain: session.schoolDomain,
            createdAt: now,
          },
        },
      },
      {
        Update: {
          TableName: Tables.Sessions,
          Key: { sessionId },
          UpdateExpression: `SET ${isTutor ? "tutorRated" : "tuteeRated"} = :true`,
          ExpressionAttributeValues: { ":true": true },
        },
      },
    ],
  }));

  // Update tutor's aggregate rating (when tutee rates tutor)
  if (isTutee) {
    try {
      // Atomic update: newAvg = (avgRating * reviewCount + stars) / (reviewCount + 1)
      await ddb.send(new UpdateCommand({
        TableName: Tables.Users,
        Key: { uid: session.tutorId as string },
        UpdateExpression: "SET avgRating = if_not_exists(avgRating, :zero), reviewCount = if_not_exists(reviewCount, :zero)",
        ExpressionAttributeValues: { ":zero": 0 },
      }));

      const tutorResult = await ddb.send(new GetCommand({
        TableName: Tables.Users,
        Key: { uid: session.tutorId as string },
      }));
      const tutor = tutorResult.Item!;
      const prevCount = (tutor.reviewCount as number) ?? 0;
      const prevAvg = (tutor.avgRating as number) ?? 0;
      const newCount = prevCount + 1;
      const newAvg = Math.round(((prevAvg * prevCount + stars) / newCount) * 10) / 10;

      await ddb.send(new UpdateCommand({
        TableName: Tables.Users,
        Key: { uid: session.tutorId as string },
        UpdateExpression: "SET avgRating = :avg, reviewCount = :count",
        ExpressionAttributeValues: { ":avg": newAvg, ":count": newCount },
      }));
    } catch (err) {
      console.error("Failed to update tutor aggregate rating:", err);
    }
  }

  return json({ success: true });
}
