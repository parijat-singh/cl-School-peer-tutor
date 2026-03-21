// EventBridge: triggerRatingPrompts — runs every 15 minutes.
// Marks sessions as completed and sends rating prompts.

import { QueryCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { subMinutes } from "date-fns";
import { ddb, Tables } from "../../shared/dynamo.js";
import { sendRatingPrompt } from "../../shared/email.js";
import { captureError } from "../../shared/sentry.js";

export async function triggerRatingPrompts(): Promise<void> {
  const now = new Date();
  const from = subMinutes(now, 20);
  const to = subMinutes(now, 10);

  const result = await ddb.send(new QueryCommand({
    TableName: Tables.Sessions,
    IndexName: "status-scheduledDate-index",
    KeyConditionExpression: "#status = :upcoming AND scheduledDate BETWEEN :from AND :to",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":upcoming": "upcoming",
      ":from": from.toISOString(),
      ":to": to.toISOString(),
    },
  }));

  for (const session of result.Items ?? []) {
    // Mark as completed
    await ddb.send(new UpdateCommand({
      TableName: Tables.Sessions,
      Key: { sessionId: session.sessionId },
      UpdateExpression: "SET #status = :completed, completedAt = :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":completed": "completed", ":now": now.toISOString() },
    }));

    const [tutorResult, tuteeResult] = await Promise.all([
      ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid: session.tutorId } })),
      ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid: session.tuteeId } })),
    ]);

    const tutor = tutorResult.Item;
    const tutee = tuteeResult.Item;
    if (!tutor || !tutee) continue;

    const base = { sessionId: session.sessionId as string, subject: session.subject as string };

    try {
      await Promise.all([
        !session.tutorRated && sendRatingPrompt({ ...base, recipientEmail: tutor.email as string, recipientName: tutor.name as string, otherPartyName: tutee.name as string }),
        !session.tuteeRated && sendRatingPrompt({ ...base, recipientEmail: tutee.email as string, recipientName: tutee.name as string, otherPartyName: tutor.name as string }),
      ]);
    } catch (err) {
      captureError(err, { function: "triggerRatingPrompts" });
      console.error(`Rating prompt failed for session ${session.sessionId}:`, err);
    }
  }
}
