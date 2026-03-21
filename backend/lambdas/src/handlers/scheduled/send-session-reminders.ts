// EventBridge: sendSessionReminders — runs every 60 minutes.
// Sends 24h and 1h reminders for upcoming sessions.

import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { addHours } from "date-fns";
import { ddb, Tables } from "../../shared/dynamo.js";
import { sendReminderEmail } from "../../shared/email.js";
import { captureError } from "../../shared/sentry.js";

export async function sendSessionReminders(): Promise<void> {
  const now = new Date();

  const windows = [
    { hoursUntil: 24, from: addHours(now, 23.9), to: addHours(now, 24.1) },
    { hoursUntil: 1, from: addHours(now, 0.9), to: addHours(now, 1.1) },
  ];

  for (const window of windows) {
    // Query sessions GSI: status=upcoming, scheduledDate in window
    const result = await ddb.send(new QueryCommand({
      TableName: Tables.Sessions,
      IndexName: "status-scheduledDate-index",
      KeyConditionExpression: "#status = :upcoming AND scheduledDate BETWEEN :from AND :to",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":upcoming": "upcoming",
        ":from": window.from.toISOString(),
        ":to": window.to.toISOString(),
      },
    }));

    for (const session of result.Items ?? []) {
      const [tutorResult, tuteeResult] = await Promise.all([
        ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid: session.tutorId } })),
        ddb.send(new GetCommand({ TableName: Tables.Users, Key: { uid: session.tuteeId } })),
      ]);

      const tutor = tutorResult.Item;
      const tutee = tuteeResult.Item;
      if (!tutor || !tutee) continue;

      const params = {
        subject: session.subject as string,
        startTime: session.startTime as string,
        scheduledDate: session.scheduledDate as string,
        meetLink: (session.meetLink as string) ?? null,
        hoursUntil: window.hoursUntil,
      };

      try {
        await Promise.all([
          sendReminderEmail({ ...params, recipientEmail: tutor.email as string, recipientName: tutor.name as string, otherPartyName: tutee.name as string }),
          sendReminderEmail({ ...params, recipientEmail: tutee.email as string, recipientName: tutee.name as string, otherPartyName: tutor.name as string }),
        ]);
      } catch (err) {
        captureError(err, { function: "sendSessionReminders" });
        console.error(`Reminder email failed for session ${session.sessionId}:`, err);
      }
    }
  }
}
