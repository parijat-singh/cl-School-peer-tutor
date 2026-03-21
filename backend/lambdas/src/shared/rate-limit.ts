// DynamoDB-backed per-key rate limiter.
// Uses conditional UpdateItem for atomic increment. TTL auto-cleans expired entries.

import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { ddb, Tables } from "./dynamo.js";

/**
 * Check and consume one unit of rate limit for the given key.
 * Returns true if the request is allowed, false if rate-limited.
 *
 * @param key - Unique key (e.g. "bookSession:{uid}")
 * @param limit - Max requests per window
 * @param windowMs - Window duration in milliseconds
 */
export async function checkAndConsumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  const resetAt = new Date(now + windowMs).toISOString();
  const resetAtEpoch = Math.floor((now + windowMs) / 1000);

  try {
    // Try to increment an existing, non-expired entry
    const result = await ddb.send(
      new UpdateCommand({
        TableName: Tables.RateLimits,
        Key: { key },
        UpdateExpression: "SET #count = #count + :one, updatedAt = :now",
        ConditionExpression: "attribute_exists(#count) AND #count < :limit AND resetAtIso > :now",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":limit": limit,
          ":now": new Date(now).toISOString(),
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return (result.Attributes?.count ?? limit) <= limit;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      // Either the item doesn't exist, is expired, or limit reached.
      // Try to create/reset the entry.
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: Tables.RateLimits,
            Key: { key },
            UpdateExpression:
              "SET #count = :one, resetAtIso = :resetAt, resetAtEpoch = :epoch, updatedAt = :now",
            ConditionExpression:
              "attribute_not_exists(#count) OR resetAtIso <= :now",
            ExpressionAttributeNames: { "#count": "count" },
            ExpressionAttributeValues: {
              ":one": 1,
              ":resetAt": resetAt,
              ":epoch": resetAtEpoch,
              ":now": new Date(now).toISOString(),
            },
          }),
        );
        return true; // Fresh window, first request
      } catch (innerErr) {
        if (innerErr instanceof ConditionalCheckFailedException) {
          return false; // Another request beat us — rate limited
        }
        throw innerErr;
      }
    }
    throw err;
  }
}
