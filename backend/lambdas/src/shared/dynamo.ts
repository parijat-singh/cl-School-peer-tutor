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
  Users:              process.env.USERS_TABLE!,
  AvailabilitySlots:  process.env.AVAILABILITY_TABLE!,
  Sessions:           process.env.SESSIONS_TABLE!,
  BookingRequests:    process.env.BOOKING_REQUESTS_TABLE!,
  Reviews:            process.env.REVIEWS_TABLE!,
  Schools:            process.env.SCHOOLS_TABLE!,
  Stats:              process.env.STATS_TABLE!,
  EmailVerifications: process.env.EMAIL_VERIFICATIONS_TABLE!,
  RateLimits:         process.env.RATE_LIMITS_TABLE!,
  AdminAuditLog:      process.env.ADMIN_AUDIT_LOG_TABLE!,
  ContactSubmissions: process.env.CONTACT_SUBMISSIONS_TABLE!,
} as const;
