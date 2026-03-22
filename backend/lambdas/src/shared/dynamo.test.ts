import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("dynamo module", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset module cache so we can re-import with different env vars
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("exports a DynamoDB Document Client as ddb", async () => {
    process.env.DYNAMODB_TABLE_USERS = "users";
    process.env.DYNAMODB_TABLE_AVAILABILITY_SLOTS = "availability";
    process.env.DYNAMODB_TABLE_SESSIONS = "sessions";
    process.env.DYNAMODB_TABLE_BOOKING_REQUESTS = "bookings";
    process.env.DYNAMODB_TABLE_REVIEWS = "reviews";
    process.env.DYNAMODB_TABLE_SCHOOLS = "schools";
    process.env.DYNAMODB_TABLE_STATS = "stats";
    process.env.DYNAMODB_TABLE_EMAIL_VERIFICATIONS = "email-verify";
    process.env.DYNAMODB_TABLE_RATE_LIMITS = "rate-limits";
    process.env.DYNAMODB_TABLE_ADMIN_AUDIT_LOG = "audit-log";
    process.env.DYNAMODB_TABLE_CONTACT_SUBMISSIONS = "contact";

    const { ddb } = await import("./dynamo.js");
    expect(ddb).toBeDefined();
    expect(typeof ddb.send).toBe("function");
  });

  it("exports Tables with values from environment variables", async () => {
    process.env.DYNAMODB_TABLE_USERS = "my-users";
    process.env.DYNAMODB_TABLE_AVAILABILITY_SLOTS = "my-availability";
    process.env.DYNAMODB_TABLE_SESSIONS = "my-sessions";
    process.env.DYNAMODB_TABLE_BOOKING_REQUESTS = "my-bookings";
    process.env.DYNAMODB_TABLE_REVIEWS = "my-reviews";
    process.env.DYNAMODB_TABLE_SCHOOLS = "my-schools";
    process.env.DYNAMODB_TABLE_STATS = "my-stats";
    process.env.DYNAMODB_TABLE_EMAIL_VERIFICATIONS = "my-email-verify";
    process.env.DYNAMODB_TABLE_RATE_LIMITS = "my-rate-limits";
    process.env.DYNAMODB_TABLE_ADMIN_AUDIT_LOG = "my-audit-log";
    process.env.DYNAMODB_TABLE_CONTACT_SUBMISSIONS = "my-contact";

    const { Tables } = await import("./dynamo.js");
    expect(Tables.Users).toBe("my-users");
    expect(Tables.AvailabilitySlots).toBe("my-availability");
    expect(Tables.Sessions).toBe("my-sessions");
    expect(Tables.BookingRequests).toBe("my-bookings");
    expect(Tables.Reviews).toBe("my-reviews");
    expect(Tables.Schools).toBe("my-schools");
    expect(Tables.Stats).toBe("my-stats");
    expect(Tables.EmailVerifications).toBe("my-email-verify");
    expect(Tables.RateLimits).toBe("my-rate-limits");
    expect(Tables.AdminAuditLog).toBe("my-audit-log");
    expect(Tables.ContactSubmissions).toBe("my-contact");
  });

  it("uses custom endpoint when DYNAMODB_ENDPOINT is set", async () => {
    process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";
    process.env.DYNAMODB_TABLE_USERS = "users";
    process.env.DYNAMODB_TABLE_AVAILABILITY_SLOTS = "availability";
    process.env.DYNAMODB_TABLE_SESSIONS = "sessions";
    process.env.DYNAMODB_TABLE_BOOKING_REQUESTS = "bookings";
    process.env.DYNAMODB_TABLE_REVIEWS = "reviews";
    process.env.DYNAMODB_TABLE_SCHOOLS = "schools";
    process.env.DYNAMODB_TABLE_STATS = "stats";
    process.env.DYNAMODB_TABLE_EMAIL_VERIFICATIONS = "email-verify";
    process.env.DYNAMODB_TABLE_RATE_LIMITS = "rate-limits";
    process.env.DYNAMODB_TABLE_ADMIN_AUDIT_LOG = "audit-log";
    process.env.DYNAMODB_TABLE_CONTACT_SUBMISSIONS = "contact";

    const { ddb } = await import("./dynamo.js");
    // The client should still be a valid DynamoDB Document Client
    expect(ddb).toBeDefined();
    expect(typeof ddb.send).toBe("function");
  });
});
