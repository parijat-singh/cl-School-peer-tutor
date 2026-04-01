// Integration tests for the Bookings Lambda.
// Tests the full request path: router → handler → DynamoDB (mocked) → response.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

vi.mock("../../shared/sentry.js", () => ({ captureError: vi.fn() }));
vi.mock("../../shared/rate-limit.js", () => ({
  checkAndConsumeRateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../shared/google-meet.js", () => ({
  provisionMeetLink: vi.fn().mockResolvedValue({
    meetLink: "https://meet.google.com/abc-defg-hij",
    calendarEventId: "cal-event-1",
  }),
  deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../shared/email.js", () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendBookingRequestEmail: vi.fn().mockResolvedValue(undefined),
  sendRequestRejectedEmail: vi.fn().mockResolvedValue(undefined),
  sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../shared/dynamo.js", () => {
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  return {
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    Tables: {
      Users:             "test-users",
      AvailabilitySlots: "test-slots",
      Sessions:          "test-sessions",
      BookingRequests:   "test-booking-requests",
      RateLimits:        "test-rate-limits",
    },
  };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

const TUTEE = { uid: "tutee-1", name: "Alice", email: "alice@test.edu", role: "tutee", schoolDomain: "test.edu", status: "active" };
const TUTOR = { uid: "tutor-1", name: "Bob",   email: "bob@test.edu",   role: "tutor", schoolDomain: "test.edu", status: "active" };
const SLOT  = { tutorId: "tutor-1", slotId: "slot-1", day: "Monday", startTime: "09:00", endTime: "10:00", duration: 60, booked: false, recurring: false };

function makeEvent(overrides: {
  routeKey?: string;
  rawPath?: string;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string | null;
  uid?: string;
  role?: string;
  status?: string;
  schoolDomain?: string;
} = {}): APIGatewayProxyEventV2WithJWTAuthorizer {
  const {
    routeKey = "POST /bookings/book-session",
    pathParameters = {},
    queryStringParameters = {},
    body = null,
    uid = "tutee-1",
    role = "tutee",
    status = "active",
    schoolDomain = "test.edu",
  } = overrides;
  const rawPath = overrides.rawPath ?? routeKey.split(" ")[1];
  const method = routeKey.split(" ")[0];
  return {
    routeKey,
    rawPath,
    pathParameters,
    queryStringParameters,
    body,
    isBase64Encoded: false,
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: uid, email: `${uid}@test.edu`, "custom:role": role, "custom:status": status, "custom:schoolDomain": schoolDomain },
          scopes: [],
        },
      },
      http: { method, path: rawPath },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

// ── POST /bookings/book-session ────────────────────────────────────────────

describe("POST /bookings/book-session (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("books session successfully and returns sessionId + meetLink", async () => {
    const { handler } = await import("./index.js");
    // book-session calls Promise.all([tuteeGet, tutorGet, slotGet]) in that order
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })  // tutee
      .resolvesOnce({ Item: TUTOR })  // tutor
      .resolvesOnce({ Item: SLOT });  // slot
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.sessionId).toBeTruthy();
    expect(body.meetLink).toBe("https://meet.google.com/abc-defg-hij");
    expect(body.meetLinkStatus).toBe("ready");
  });

  it("returns 409 when slot is already booked", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })
      .resolvesOnce({ Item: TUTOR })
      .resolvesOnce({ Item: { ...SLOT, booked: true } });

    const result = await handler(makeEvent({
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(409);
  });

  it("returns 409 when transaction is cancelled (race condition)", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })
      .resolvesOnce({ Item: TUTOR })
      .resolvesOnce({ Item: SLOT });
    ddbMock.on(TransactWriteCommand).rejects(Object.assign(new Error("Transaction cancelled"), { name: "TransactionCanceledException" }));

    const result = await handler(makeEvent({
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(409);
  });

  it("returns 429 when rate-limited", async () => {
    const { checkAndConsumeRateLimit } = await import("../../shared/rate-limit.js");
    (checkAndConsumeRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(429);
  });

  it("returns 403 when tutor is from a different school", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })
      .resolvesOnce({ Item: { ...TUTOR, schoolDomain: "other.edu" } })
      .resolvesOnce({ Item: SLOT });

    const result = await handler(makeEvent({
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when tutee account is not active", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: { ...TUTEE, status: "suspended" } })
      .resolvesOnce({ Item: TUTOR })
      .resolvesOnce({ Item: SLOT });

    const result = await handler(makeEvent({
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it("returns 400 when scheduledDate is not YYYY-MM-DD format", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "May 1st" }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("still returns 200 when meet provisioning fails (meetLinkStatus=failed)", async () => {
    const { provisionMeetLink } = await import("../../shared/google-meet.js");
    (provisionMeetLink as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Meet API down"));

    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })
      .resolvesOnce({ Item: TUTOR })
      .resolvesOnce({ Item: SLOT });
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).meetLinkStatus).toBe("failed");
  });
});

// ── POST /bookings/request ─────────────────────────────────────────────────

describe("POST /bookings/request (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("creates booking request and returns requestId", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })
      .resolvesOnce({ Item: TUTOR })
      .resolvesOnce({ Item: SLOT });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/request",
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).requestId).toBeTruthy();
  });

  it("returns 409 when a duplicate pending request exists", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })
      .resolvesOnce({ Item: TUTOR })
      .resolvesOnce({ Item: SLOT });
    ddbMock.on(QueryCommand).resolves({ Items: [{ requestId: "existing-req" }] });

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/request",
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(409);
  });

  it("returns 409 when non-recurring slot is already booked", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })
      .resolvesOnce({ Item: TUTOR })
      .resolvesOnce({ Item: { ...SLOT, recurring: false, booked: true } });

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/request",
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(409);
  });

  it("returns 403 when tutor is from a different school", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })
      .resolvesOnce({ Item: { ...TUTOR, schoolDomain: "other.edu" } })
      .resolvesOnce({ Item: SLOT });

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/request",
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it("returns 404 when tutor not found", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: TUTEE })
      .resolvesOnce({ Item: undefined })
      .resolvesOnce({ Item: SLOT });

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/request",
      body: JSON.stringify({ tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2026-05-01" }),
    }));

    expect(result.statusCode).toBe(404);
  });
});

// ── POST /bookings/respond ─────────────────────────────────────────────────

const BOOKING_REQUEST = {
  requestId: "req-1",
  tutorId: "tutor-1",
  tuteeId: "tutee-1",
  tutorName: "Bob",
  tuteeName: "Alice",
  tutorEmail: "bob@test.edu",
  tuteeEmail: "alice@test.edu",
  slotId: "slot-1",
  subject: "Math",
  scheduledDate: "2026-05-01",
  day: "Monday",
  startTime: "09:00",
  endTime: "10:00",
  duration: 60,
  recurring: false,
  status: "pending",
  schoolDomain: "test.edu",
};

describe("POST /bookings/respond (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("accepts request and returns sessionId", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-booking-requests" }).resolves({ Item: BOOKING_REQUEST });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/respond",
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({ requestId: "req-1", action: "accept" }),
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.sessionId).toBeTruthy();
    expect(body.meetLinkStatus).toBe("ready");
  });

  it("rejects request and returns success", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-booking-requests" }).resolves({ Item: BOOKING_REQUEST });
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/respond",
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({ requestId: "req-1", action: "reject", rejectionReason: "Not available" }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
  });

  it("returns 403 when caller is not the tutor on the request", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-booking-requests" }).resolves({ Item: BOOKING_REQUEST });

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/respond",
      uid: "someone-else",
      role: "tutor",
      body: JSON.stringify({ requestId: "req-1", action: "accept" }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it("returns 400 when request is not pending", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-booking-requests" })
      .resolves({ Item: { ...BOOKING_REQUEST, status: "accepted" } });

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/respond",
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({ requestId: "req-1", action: "accept" }),
    }));

    expect(result.statusCode).toBe(400);
  });

  it("returns 404 when request not found", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-booking-requests" }).resolves({ Item: undefined });

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/respond",
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({ requestId: "req-1", action: "accept" }),
    }));

    expect(result.statusCode).toBe(404);
  });

  it("auto-rejects sibling requests when accepting", async () => {
    const { handler } = await import("./index.js");
    const sibling = { ...BOOKING_REQUEST, requestId: "req-sibling", tuteeId: "tutee-2" };
    ddbMock.on(GetCommand, { TableName: "test-booking-requests" }).resolves({ Item: BOOKING_REQUEST });
    ddbMock.on(QueryCommand).resolves({ Items: [sibling] });
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/respond",
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({ requestId: "req-1", action: "accept" }),
    }));

    expect(result.statusCode).toBe(200);
    // The transaction should include items for accepting + auto-rejecting sibling
    const txnCall = ddbMock.commandCalls(TransactWriteCommand)[0];
    expect(txnCall.args[0].input.TransactItems!.length).toBeGreaterThan(3);
  });
});

// ── POST /bookings/cancel-request ─────────────────────────────────────────

describe("POST /bookings/cancel-request (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("cancels pending request and returns success", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-booking-requests" })
      .resolves({ Item: { requestId: "req-1", tuteeId: "tutee-1", status: "pending" } });
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/cancel-request",
      uid: "tutee-1",
      body: JSON.stringify({ requestId: "req-1" }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
  });

  it("returns 403 when tutee does not own the request", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-booking-requests" })
      .resolves({ Item: { requestId: "req-1", tuteeId: "someone-else", status: "pending" } });

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/cancel-request",
      uid: "tutee-1",
      body: JSON.stringify({ requestId: "req-1" }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it("returns 400 when request is already accepted", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-booking-requests" })
      .resolves({ Item: { requestId: "req-1", tuteeId: "tutee-1", status: "accepted" } });

    const result = await handler(makeEvent({
      routeKey: "POST /bookings/cancel-request",
      uid: "tutee-1",
      body: JSON.stringify({ requestId: "req-1" }),
    }));

    expect(result.statusCode).toBe(400);
  });
});

// ── POST /sessions/cancel ──────────────────────────────────────────────────

const SESSION = {
  sessionId: "sess-1",
  tutorId: "tutor-1",
  tuteeId: "tutee-1",
  slotId: "slot-1",
  tutorName: "Bob",
  tuteeName: "Alice",
  subject: "Math",
  scheduledDate: "2026-05-01T12:00:00.000Z",
  status: "upcoming",
  calendarEventId: null,
  schoolDomain: "test.edu",
};

describe("POST /sessions/cancel (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("cancels upcoming session as tutor", async () => {
    const { handler } = await import("./index.js");
    // cancel-session: GetCommand(Sessions), TransactWrite, then GetCommand(tutor), GetCommand(tutee)
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: SESSION })  // session lookup
      .resolvesOnce({ Item: TUTOR })    // tutor lookup for cancellation email
      .resolvesOnce({ Item: TUTEE });   // tutee lookup
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /sessions/cancel",
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({ sessionId: "sess-1" }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
  });

  it("cancels upcoming session as tutee", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: SESSION })
      .resolvesOnce({ Item: TUTOR })
      .resolvesOnce({ Item: TUTEE });
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /sessions/cancel",
      uid: "tutee-1",
      role: "tutee",
      body: JSON.stringify({ sessionId: "sess-1" }),
    }));

    expect(result.statusCode).toBe(200);
  });

  it("returns 403 when caller is not a participant", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-sessions" }).resolves({ Item: SESSION });

    const result = await handler(makeEvent({
      routeKey: "POST /sessions/cancel",
      uid: "stranger",
      body: JSON.stringify({ sessionId: "sess-1" }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it("returns 400 when session is not upcoming", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-sessions" }).resolves({ Item: { ...SESSION, status: "cancelled" } });

    const result = await handler(makeEvent({
      routeKey: "POST /sessions/cancel",
      uid: "tutor-1",
      body: JSON.stringify({ sessionId: "sess-1" }),
    }));

    expect(result.statusCode).toBe(400);
  });

  it("returns 404 when session not found", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-sessions" }).resolves({ Item: undefined });

    const result = await handler(makeEvent({
      routeKey: "POST /sessions/cancel",
      uid: "tutor-1",
      body: JSON.stringify({ sessionId: "sess-1" }),
    }));

    expect(result.statusCode).toBe(404);
  });
});

// ── GET /sessions/mine ─────────────────────────────────────────────────────

describe("GET /sessions/mine (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns sessions array with id field mapped from sessionId", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(QueryCommand).resolves({ Items: [{ ...SESSION }] });

    const result = await handler(makeEvent({
      routeKey: "GET /sessions/mine",
      rawPath: "/sessions/mine",
      queryStringParameters: { role: "tutor" },
      uid: "tutor-1",
      role: "tutor",
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.sessions[0].id).toBe("sess-1");
  });
});

// ── GET /booking-requests/mine ────────────────────────────────────────────

describe("GET /booking-requests/mine (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns booking requests with id field", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(QueryCommand).resolves({ Items: [{ ...BOOKING_REQUEST }] });

    const result = await handler(makeEvent({
      routeKey: "GET /booking-requests/mine",
      rawPath: "/booking-requests/mine",
      queryStringParameters: { role: "tutee" },
      uid: "tutee-1",
      role: "tutee",
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.requests[0].id).toBe("req-1");
  });
});

// ── Router 404 ────────────────────────────────────────────────────────────

describe("unknown routes", () => {
  it("returns 404 for unknown route", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /bookings/explode",
      rawPath: "/bookings/explode",
    }));
    expect(result.statusCode).toBe(404);
  });
});
