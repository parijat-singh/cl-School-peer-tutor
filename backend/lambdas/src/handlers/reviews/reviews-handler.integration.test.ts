// Integration tests for the Reviews Lambda.
// Tests the full request path: router → handler → DynamoDB (mocked) → response.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

vi.mock("../../shared/sentry.js", () => ({ captureError: vi.fn() }));
vi.mock("../../shared/dynamo.js", () => {
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  return {
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    Tables: {
      Sessions:      "test-sessions",
      Reviews:       "test-reviews",
      Users:         "test-users",
      AdminAuditLog: "test-admin-audit-log",
    },
  };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

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
    routeKey = "POST /reviews/submit",
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

const SESSION = {
  sessionId: "sess-1",
  tutorId: "tutor-1",
  tuteeId: "tutee-1",
  tutorName: "Bob",
  tuteeName: "Alice",
  subject: "Math",
  status: "completed",
  schoolDomain: "test.edu",
  tutorRated: false,
  tuteeRated: false,
};

const REVIEW = {
  reviewId: "rev-1",
  sessionId: "sess-1",
  authorId: "tutee-1",
  authorName: "Alice",
  targetId: "tutor-1",
  targetName: "Bob",
  stars: 5,
  text: "Great tutor!",
  flagged: false,
  schoolDomain: "test.edu",
  createdAt: "2026-01-01T00:00:00.000Z",
};

// ── POST /reviews/submit ───────────────────────────────────────────────────

describe("POST /reviews/submit (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("tutee submits rating for tutor and returns success", async () => {
    const { handler } = await import("./index.js");
    // submit-rating: GetCommand(Sessions), TransactWrite, UpdateCommand(init), GetCommand(Users for tutor), UpdateCommand(set avg)
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: SESSION })                                               // session
      .resolvesOnce({ Item: { uid: "tutor-1", avgRating: 4.0, reviewCount: 5 } }); // tutor for avg update
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      uid: "tutee-1",
      body: JSON.stringify({ sessionId: "sess-1", stars: 5, text: "Great tutor!" }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
  });

  it("updates tutor aggregate rating when tutee submits review", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: SESSION })
      .resolvesOnce({ Item: { uid: "tutor-1", avgRating: 4.0, reviewCount: 4 } });
    ddbMock.on(TransactWriteCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    await handler(makeEvent({
      uid: "tutee-1",
      body: JSON.stringify({ sessionId: "sess-1", stars: 5 }),
    }));

    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    // Find the UpdateCommand that actually sets :avg (not the initialisation one that sets :zero)
    const avgUpdateCall = updateCalls.find(c =>
      c.args[0].input.ExpressionAttributeValues?.[":avg"] !== undefined
    );
    expect(avgUpdateCall).toBeTruthy();
    const newAvg = avgUpdateCall!.args[0].input.ExpressionAttributeValues![":avg"];
    expect(newAvg).toBe(4.2); // (4.0 * 4 + 5) / 5 = 4.2
  });

  it("tutor submits rating for tutee without triggering aggregate update", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolvesOnce({ Item: SESSION });
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(makeEvent({
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({ sessionId: "sess-1", stars: 4 }),
    }));

    expect(result.statusCode).toBe(200);
    // No UpdateCommand on Users table should be called (tutor rating does not update aggregate)
    const userUpdateCalls = ddbMock.commandCalls(UpdateCommand).filter(c =>
      c.args[0].input.TableName === "test-users"
    );
    expect(userUpdateCalls).toHaveLength(0);
  });

  it("returns 403 when caller is not a session participant", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolvesOnce({ Item: SESSION });

    const result = await handler(makeEvent({
      uid: "outsider",
      body: JSON.stringify({ sessionId: "sess-1", stars: 5 }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it("returns 409 when tutee already rated this session", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolvesOnce({ Item: { ...SESSION, tuteeRated: true } });

    const result = await handler(makeEvent({
      uid: "tutee-1",
      body: JSON.stringify({ sessionId: "sess-1", stars: 5 }),
    }));

    expect(result.statusCode).toBe(409);
  });

  it("returns 409 when tutor already rated this session", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolvesOnce({ Item: { ...SESSION, tutorRated: true } });

    const result = await handler(makeEvent({
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({ sessionId: "sess-1", stars: 4 }),
    }));

    expect(result.statusCode).toBe(409);
  });

  it("returns 400 when stars is 0", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      uid: "tutee-1",
      body: JSON.stringify({ sessionId: "sess-1", stars: 0 }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when stars is 6", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      uid: "tutee-1",
      body: JSON.stringify({ sessionId: "sess-1", stars: 6 }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 404 when session not found", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolvesOnce({ Item: undefined });

    const result = await handler(makeEvent({
      uid: "tutee-1",
      body: JSON.stringify({ sessionId: "sess-1", stars: 5 }),
    }));

    expect(result.statusCode).toBe(404);
  });
});

// ── POST /reviews/admin-delete ─────────────────────────────────────────────

describe("POST /reviews/admin-delete (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("deletes review and writes audit log when schooladmin calls for own school", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: REVIEW });
    ddbMock.on(DeleteCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /reviews/admin-delete",
      uid: "admin-1",
      role: "schooladmin",
      schoolDomain: "test.edu",
      body: JSON.stringify({ reviewId: "rev-1", reason: "Inappropriate content" }),
    }));

    expect(result.statusCode).toBe(200);
    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item!.action).toBe("delete_review");
  });

  it("returns 403 when schooladmin tries to delete review from another school", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: { ...REVIEW, schoolDomain: "other.edu" } });

    const result = await handler(makeEvent({
      routeKey: "POST /reviews/admin-delete",
      uid: "admin-1",
      role: "schooladmin",
      schoolDomain: "test.edu",
      body: JSON.stringify({ reviewId: "rev-1", reason: "Inappropriate" }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it("allows superadmin to delete any review", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: { ...REVIEW, schoolDomain: "other.edu" } });
    ddbMock.on(DeleteCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /reviews/admin-delete",
      uid: "super-1",
      role: "superadmin",
      schoolDomain: "test.edu",
      body: JSON.stringify({ reviewId: "rev-1", reason: "Spam" }),
    }));

    expect(result.statusCode).toBe(200);
  });

  it("returns 403 when caller is a regular tutee", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /reviews/admin-delete",
      uid: "tutee-1",
      role: "tutee",
      body: JSON.stringify({ reviewId: "rev-1", reason: "I don't like it" }),
    }));
    expect(result.statusCode).toBe(403);
  });

  it("returns 404 when review not found", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await handler(makeEvent({
      routeKey: "POST /reviews/admin-delete",
      role: "superadmin",
      body: JSON.stringify({ reviewId: "ghost-rev", reason: "Spam" }),
    }));

    expect(result.statusCode).toBe(404);
  });

  it("returns 400 when reason is missing", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /reviews/admin-delete",
      role: "superadmin",
      body: JSON.stringify({ reviewId: "rev-1" }),
    }));
    expect(result.statusCode).toBe(400);
  });
});

// ── POST /reviews/{reviewId}/flag ──────────────────────────────────────────

describe("POST /reviews/{reviewId}/flag (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("flags a review by any authenticated user", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /reviews/{reviewId}/flag",
      rawPath: "/reviews/rev-1/flag",
      pathParameters: { reviewId: "rev-1" },
      uid: "tutee-1",
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
  });

  it("passes correct reviewId to DynamoDB update", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(UpdateCommand).resolves({});

    await handler(makeEvent({
      routeKey: "POST /reviews/{reviewId}/flag",
      rawPath: "/reviews/rev-xyz/flag",
      pathParameters: { reviewId: "rev-xyz" },
      uid: "user-1",
    }));

    const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
    expect(updateCall.args[0].input.Key!.reviewId).toBe("rev-xyz");
    expect(updateCall.args[0].input.ExpressionAttributeValues![":uid"]).toBe("user-1");
  });
});

// ── GET /tutors/{uid}/reviews ──────────────────────────────────────────────

describe("GET /tutors/{uid}/reviews (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns reviews with id field mapped from reviewId", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(QueryCommand).resolves({ Items: [REVIEW] });

    const result = await handler(makeEvent({
      routeKey: "GET /tutors/{uid}/reviews",
      rawPath: "/tutors/tutor-1/reviews",
      pathParameters: { uid: "tutor-1" },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.reviews[0].id).toBe("rev-1");
    expect(body.reviews[0].reviewId).toBe("rev-1");
  });
});

// ── GET /reviews/school/{domain} ───────────────────────────────────────────

describe("GET /reviews/school/{domain} (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns school reviews with id field", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(QueryCommand).resolves({ Items: [REVIEW] });

    const result = await handler(makeEvent({
      routeKey: "GET /reviews/school/{domain}",
      rawPath: "/reviews/school/test.edu",
      pathParameters: { domain: "test.edu" },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.reviews[0].id).toBe("rev-1");
  });
});

// ── Router 404 ────────────────────────────────────────────────────────────

describe("unknown routes", () => {
  it("returns 404 for unknown route", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "DELETE /reviews/explode",
      rawPath: "/reviews/explode",
    }));
    expect(result.statusCode).toBe(404);
  });
});
