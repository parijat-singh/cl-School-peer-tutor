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
    process.env.USERS_TABLE = "users";
    process.env.AVAILABILITY_TABLE = "availability";
    process.env.SESSIONS_TABLE = "sessions";
    process.env.BOOKING_REQUESTS_TABLE = "bookings";
    process.env.REVIEWS_TABLE = "reviews";
    process.env.SCHOOLS_TABLE = "schools";
    process.env.STATS_TABLE = "stats";
    process.env.EMAIL_VERIFICATIONS_TABLE = "email-verify";
    process.env.RATE_LIMITS_TABLE = "rate-limits";
    process.env.ADMIN_AUDIT_LOG_TABLE = "audit-log";
    process.env.CONTACT_SUBMISSIONS_TABLE = "contact";

    const { ddb } = await import("./dynamo.js");
    expect(ddb).toBeDefined();
    expect(typeof ddb.send).toBe("function");
  });

  it("exports Tables with values from environment variables", async () => {
    process.env.USERS_TABLE = "my-users";
    process.env.AVAILABILITY_TABLE = "my-availability";
    process.env.SESSIONS_TABLE = "my-sessions";
    process.env.BOOKING_REQUESTS_TABLE = "my-bookings";
    process.env.REVIEWS_TABLE = "my-reviews";
    process.env.SCHOOLS_TABLE = "my-schools";
    process.env.STATS_TABLE = "my-stats";
    process.env.EMAIL_VERIFICATIONS_TABLE = "my-email-verify";
    process.env.RATE_LIMITS_TABLE = "my-rate-limits";
    process.env.ADMIN_AUDIT_LOG_TABLE = "my-audit-log";
    process.env.CONTACT_SUBMISSIONS_TABLE = "my-contact";

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
    process.env.USERS_TABLE = "users";
    process.env.AVAILABILITY_TABLE = "availability";
    process.env.SESSIONS_TABLE = "sessions";
    process.env.BOOKING_REQUESTS_TABLE = "bookings";
    process.env.REVIEWS_TABLE = "reviews";
    process.env.SCHOOLS_TABLE = "schools";
    process.env.STATS_TABLE = "stats";
    process.env.EMAIL_VERIFICATIONS_TABLE = "email-verify";
    process.env.RATE_LIMITS_TABLE = "rate-limits";
    process.env.ADMIN_AUDIT_LOG_TABLE = "audit-log";
    process.env.CONTACT_SUBMISSIONS_TABLE = "contact";

    const { ddb } = await import("./dynamo.js");
    // The client should still be a valid DynamoDB Document Client
    expect(ddb).toBeDefined();
    expect(typeof ddb.send).toBe("function");
  });
});
