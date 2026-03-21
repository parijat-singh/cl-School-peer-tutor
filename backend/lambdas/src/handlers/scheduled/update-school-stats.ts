// EventBridge: updateSchoolStats — runs every 60 minutes.
// Recalculates stats for all schools.

import { ScanCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { startOfMonth } from "date-fns";
import { ddb, Tables } from "../../shared/dynamo.js";

export async function updateSchoolStats(): Promise<void> {
  // Get all schools
  const schoolsResult = await ddb.send(new ScanCommand({
    TableName: Tables.Schools,
    ProjectionExpression: "domain",
  }));

  const monthStart = startOfMonth(new Date()).toISOString();
  const now = new Date().toISOString();

  for (const school of schoolsResult.Items ?? []) {
    const domain = school.domain as string;

    // Count users
    const usersResult = await ddb.send(new QueryCommand({
      TableName: Tables.Users,
      IndexName: "schoolDomain-role-index",
      KeyConditionExpression: "schoolDomain = :domain",
      ExpressionAttributeValues: { ":domain": domain },
      Select: "COUNT",
    }));

    // Count active tutors
    const tutorResult = await ddb.send(new QueryCommand({
      TableName: Tables.Users,
      IndexName: "schoolDomain-role-index",
      KeyConditionExpression: "schoolDomain = :domain AND #role = :tutor",
      FilterExpression: "#status = :active",
      ExpressionAttributeNames: { "#role": "role", "#status": "status" },
      ExpressionAttributeValues: { ":domain": domain, ":tutor": "tutor", ":active": "active" },
    }));
    const bothResult = await ddb.send(new QueryCommand({
      TableName: Tables.Users,
      IndexName: "schoolDomain-role-index",
      KeyConditionExpression: "schoolDomain = :domain AND #role = :both",
      FilterExpression: "#status = :active",
      ExpressionAttributeNames: { "#role": "role", "#status": "status" },
      ExpressionAttributeValues: { ":domain": domain, ":both": "both", ":active": "active" },
    }));
    const activeTutors = (tutorResult.Items?.length ?? 0) + (bothResult.Items?.length ?? 0);

    // Count completed sessions
    const sessionsResult = await ddb.send(new QueryCommand({
      TableName: Tables.Sessions,
      IndexName: "schoolDomain-status-index",
      KeyConditionExpression: "schoolDomain = :domain AND #status = :completed",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":domain": domain, ":completed": "completed" },
      Select: "COUNT",
    }));

    // Count sessions this month
    const monthSessionsResult = await ddb.send(new QueryCommand({
      TableName: Tables.Sessions,
      IndexName: "schoolDomain-status-index",
      KeyConditionExpression: "schoolDomain = :domain AND #status = :completed",
      FilterExpression: "scheduledDate >= :monthStart",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":domain": domain, ":completed": "completed", ":monthStart": monthStart },
    }));

    // Calculate avg rating from reviews
    const reviewsResult = await ddb.send(new QueryCommand({
      TableName: Tables.Reviews,
      IndexName: "schoolDomain-createdAt-index",
      KeyConditionExpression: "schoolDomain = :domain",
      ExpressionAttributeValues: { ":domain": domain },
    }));

    const reviews = reviewsResult.Items ?? [];
    const totalStars = reviews.reduce((sum, r) => sum + ((r.stars as number) ?? 0), 0);
    const avgRating = reviews.length > 0 ? Math.round((totalStars / reviews.length) * 10) / 10 : 0;

    await ddb.send(new PutCommand({
      TableName: Tables.Stats,
      Item: {
        schoolDomain: domain,
        totalUsers: usersResult.Count ?? 0,
        activeTutors,
        sessionsThisMonth: monthSessionsResult.Items?.length ?? 0,
        totalSessions: sessionsResult.Count ?? 0,
        avgRating,
        updatedAt: now,
      },
    }));
  }
}
