// EventBridge: purgeOldSessions — runs every 24 hours.
// Deletes sessions older than 24 months.

import { QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { subMonths } from "date-fns";
import { ddb, Tables } from "../../shared/dynamo.js";

export async function purgeOldSessions(): Promise<void> {
  const cutoff = subMonths(new Date(), 24).toISOString();

  // Query old completed sessions
  const result = await ddb.send(new QueryCommand({
    TableName: Tables.Sessions,
    IndexName: "status-scheduledDate-index",
    KeyConditionExpression: "#status = :completed AND scheduledDate <= :cutoff",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":completed": "completed", ":cutoff": cutoff },
    Limit: 500,
  }));

  const items = result.Items ?? [];
  if (items.length === 0) return;

  // Batch delete (25 items per batch)
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [Tables.Sessions]: batch.map(item => ({
          DeleteRequest: { Key: { sessionId: item.sessionId } },
        })),
      },
    }));
  }

  console.log(`Purged ${items.length} sessions older than 24 months.`);
}
