// DynamoDB Document Client singleton + table name constants.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient(
  process.env.DYNAMODB_ENDPOINT
    ? { endpoint: process.env.DYNAMODB_ENDPOINT, region: "us-east-1" }
    : {},
);

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const Tables = {
  Users:              process.env.DYNAMODB_TABLE_USERS!,
  AvailabilitySlots:  process.env.DYNAMODB_TABLE_AVAILABILITY_SLOTS!,
  Sessions:           process.env.DYNAMODB_TABLE_SESSIONS!,
  BookingRequests:    process.env.DYNAMODB_TABLE_BOOKING_REQUESTS!,
  Reviews:            process.env.DYNAMODB_TABLE_REVIEWS!,
  Schools:            process.env.DYNAMODB_TABLE_SCHOOLS!,
  Stats:              process.env.DYNAMODB_TABLE_STATS!,
  EmailVerifications: process.env.DYNAMODB_TABLE_EMAIL_VERIFICATIONS!,
  RateLimits:         process.env.DYNAMODB_TABLE_RATE_LIMITS!,
  AdminAuditLog:      process.env.DYNAMODB_TABLE_ADMIN_AUDIT_LOG!,
  ContactSubmissions: process.env.DYNAMODB_TABLE_CONTACT_SUBMISSIONS!,
} as const;
