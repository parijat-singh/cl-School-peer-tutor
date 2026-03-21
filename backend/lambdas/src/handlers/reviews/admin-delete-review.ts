// POST /reviews/admin-delete

import { z } from "zod";
import { GetCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";

const schema = z.object({
  reviewId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export async function adminDeleteReview(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (!["schooladmin", "superadmin"].includes(caller.role)) {
    return error(403, "Admins only.");
  }

  const body = parseBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error(400, "reviewId and reason required.");
  const { reviewId, reason } = parsed.data;

  const reviewResult = await ddb.send(new GetCommand({
    TableName: Tables.Reviews,
    Key: { reviewId },
  }));
  if (!reviewResult.Item) return error(404, "Review not found.");

  const review = reviewResult.Item;
  if (caller.role === "schooladmin" && review.schoolDomain !== caller.schoolDomain) {
    return error(403, "Cross-school action denied.");
  }

  const now = new Date().toISOString();

  await ddb.send(new DeleteCommand({
    TableName: Tables.Reviews,
    Key: { reviewId },
  }));

  await ddb.send(new PutCommand({
    TableName: Tables.AdminAuditLog,
    Item: {
      schoolDomain: review.schoolDomain ?? "_global",
      timestampLogId: `${now}#${ulid()}`,
      adminUid: caller.uid,
      action: "delete_review",
      targetId: reviewId,
      reason,
      metadata: { stars: review.stars, authorId: review.authorId, targetId: review.targetId },
      timestamp: now,
    },
  }));

  return json({ success: true });
}
