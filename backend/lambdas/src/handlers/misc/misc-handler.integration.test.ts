// Integration tests for the Misc Lambda (contact + recommendations).
// Tests the full request path: router → handler → DynamoDB (mocked) → response.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

vi.mock("../../shared/sentry.js", () => ({ captureError: vi.fn() }));

const mockSendMail = vi.fn().mockResolvedValue({});
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({ sendMail: mockSendMail }),
  },
  createTransport: vi.fn().mockReturnValue({ sendMail: mockSendMail }),
}));

vi.mock("../../shared/dynamo.js", () => {
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  return {
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    Tables: {
      ContactSubmissions: "test-contact-submissions",
      Reviews:            "test-reviews",
    },
  };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

function makeEvent(overrides: {
  routeKey?: string;
  rawPath?: string;
  pathParameters?: Record<string, string>;
  body?: string | null;
  uid?: string;
  role?: string;
  hasClaims?: boolean;
} = {}): APIGatewayProxyEventV2WithJWTAuthorizer {
  const {
    routeKey = "POST /contact/submit",
    pathParameters = {},
    body = null,
    uid = "user-1",
    role = "tutee",
    hasClaims = true,
  } = overrides;
  const rawPath = overrides.rawPath ?? routeKey.split(" ")[1];
  const method = routeKey.split(" ")[0];
  return {
    routeKey,
    rawPath,
    pathParameters,
    queryStringParameters: {},
    body,
    isBase64Encoded: false,
    requestContext: {
      authorizer: hasClaims ? {
        jwt: {
          claims: { sub: uid, email: `${uid}@test.edu`, "custom:role": role, "custom:status": "active", "custom:schoolDomain": "test.edu" },
          scopes: [],
        },
      } : { jwt: { claims: {}, scopes: [] } },
      http: { method, path: rawPath },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const VALID_CONTACT = {
  type: "contact",
  name: "Alice Smith",
  email: "alice@example.com",
  subject: "Question",
  message: "This is a test message that is long enough.",
};

// ── POST /contact/submit ───────────────────────────────────────────────────

describe("POST /contact/submit (via router)", () => {
  beforeEach(() => {
    ddbMock.reset();
    mockSendMail.mockClear();
  });

  it("saves contact submission to DynamoDB and returns success", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      hasClaims: false,
      body: JSON.stringify(VALID_CONTACT),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item!.name).toBe("Alice Smith");
    expect(putCall.args[0].input.Item!.message).toBe(VALID_CONTACT.message);
  });

  it("stores submission even when email sending fails", async () => {
    const { handler } = await import("./index.js");
    mockSendMail.mockRejectedValueOnce(new Error("SMTP timeout"));
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      hasClaims: false,
      body: JSON.stringify(VALID_CONTACT),
    }));

    // DynamoDB write should still happen
    expect(result.statusCode).toBe(200);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
  });

  it("returns 400 when name is missing", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      hasClaims: false,
      body: JSON.stringify({ ...VALID_CONTACT, name: "" }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      hasClaims: false,
      body: JSON.stringify({ ...VALID_CONTACT, email: "" }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when email format is invalid", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      hasClaims: false,
      body: JSON.stringify({ ...VALID_CONTACT, email: "not-an-email" }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when message is fewer than 10 characters", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      hasClaims: false,
      body: JSON.stringify({ ...VALID_CONTACT, message: "short" }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when type is invalid", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      hasClaims: false,
      body: JSON.stringify({ ...VALID_CONTACT, type: "complaint" }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when body is missing", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({ hasClaims: false, body: null }));
    expect(result.statusCode).toBe(400);
  });

  it("accepts feedback type submission", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      hasClaims: false,
      body: JSON.stringify({ type: "feedback", name: "Bob", email: "bob@example.com", message: "Great platform overall!", category: "General", rating: 5 }),
    }));

    expect(result.statusCode).toBe(200);
    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item!.type).toBe("feedback");
  });

  it("sets TTL (expiresAt) on submission", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(PutCommand).resolves({});

    const before = Math.floor(Date.now() / 1000);
    await handler(makeEvent({
      hasClaims: false,
      body: JSON.stringify(VALID_CONTACT),
    }));
    const after = Math.floor(Date.now() / 1000);

    const putCall = ddbMock.commandCalls(PutCommand)[0];
    const expiresAt = putCall.args[0].input.Item!.expiresAt as number;
    const expectedMin = before + 89 * 86400;
    const expectedMax = after + 91 * 86400;
    expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
    expect(expiresAt).toBeLessThanOrEqual(expectedMax);
  });
});

// ── POST /recommendations/tutors ───────────────────────────────────────────

const TUTOR_INPUT = {
  uid: "tutor-1",
  name: "Bob",
  grade: "12",
  subjects: ["Math"],
  bio: "I love math",
  avgRating: 4.5,
  reviewCount: 10,
  slotCount: 3,
  hasRecurringSlots: true,
  hasDateSlots: false,
};

const TUTOR_INPUT_2 = {
  uid: "tutor-2",
  name: "Carol",
  grade: "11",
  subjects: ["English"],
  bio: "English expert",
  avgRating: 3.8,
  reviewCount: 3,
  slotCount: 1,
  hasRecurringSlots: false,
  hasDateSlots: true,
};

describe("POST /recommendations/tutors (via router)", () => {
  beforeEach(() => {
    ddbMock.reset();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns empty ranked array when tutors list is empty", async () => {
    const { handler } = await import("./index.js");

    const result = await handler(makeEvent({
      routeKey: "POST /recommendations/tutors",
      body: JSON.stringify({ tutors: [] }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ ranked: [] });
  });

  it("returns single tutor directly without ranking", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await handler(makeEvent({
      routeKey: "POST /recommendations/tutors",
      body: JSON.stringify({ tutors: [TUTOR_INPUT] }),
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ranked).toHaveLength(1);
    expect(body.ranked[0].uid).toBe("tutor-1");
    expect(body.ranked[0].score).toBe(100);
  });

  it("returns fallback-sorted results when no Anthropic API key is set", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await handler(makeEvent({
      routeKey: "POST /recommendations/tutors",
      body: JSON.stringify({ tutors: [TUTOR_INPUT, TUTOR_INPUT_2] }),
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.aiPowered).toBe(false);
    expect(body.ranked).toHaveLength(2);
    // Both tutor UIDs should be present
    const uids = body.ranked.map((r: { uid: string }) => r.uid);
    expect(uids).toContain("tutor-1");
    expect(uids).toContain("tutor-2");
  });

  it("fallback sort ranks tutor with higher rating * log(reviews) first", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await handler(makeEvent({
      routeKey: "POST /recommendations/tutors",
      body: JSON.stringify({ tutors: [TUTOR_INPUT_2, TUTOR_INPUT] }), // lower-rated first in input
    }));

    const body = JSON.parse(result.body as string);
    // tutor-1 has higher score (4.5 rating, 10 reviews) and should rank first
    expect(body.ranked[0].uid).toBe("tutor-1");
  });

  it("fetches reviews for each tutor from DynamoDB", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(QueryCommand).resolves({ Items: [{ stars: 5, text: "Great!", authorName: "Alice" }] });

    await handler(makeEvent({
      routeKey: "POST /recommendations/tutors",
      body: JSON.stringify({ tutors: [TUTOR_INPUT, TUTOR_INPUT_2] }),
    }));

    // One QueryCommand per tutor
    expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(2);
  });

  it("requires authentication", async () => {
    const { handler } = await import("./index.js");

    const result = await handler(makeEvent({
      routeKey: "POST /recommendations/tutors",
      hasClaims: false,
      body: JSON.stringify({ tutors: [TUTOR_INPUT] }),
    }));

    expect(result.statusCode).toBe(401);
  });
});

// ── Router 404 ────────────────────────────────────────────────────────────

describe("unknown routes", () => {
  it("returns 404 for unknown route", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "GET /misc/explode",
      rawPath: "/misc/explode",
    }));
    expect(result.statusCode).toBe(404);
  });
});
