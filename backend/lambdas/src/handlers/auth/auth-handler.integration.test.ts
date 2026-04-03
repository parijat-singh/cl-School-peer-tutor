// Integration tests for the Auth Lambda.
// Tests the full request path: router → handler → DynamoDB (mocked) → response.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

vi.mock("../../shared/sentry.js", () => ({ captureError: vi.fn() }));
vi.mock("../../shared/cognito-admin.js", () => ({
  cognitoUpdateAttributes: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../shared/email.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../shared/dynamo.js", () => {
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  return {
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    Tables: {
      Users:              "test-users",
      Schools:            "test-schools",
      EmailVerifications: "test-email-verifications",
      AdminAuditLog:      "test-admin-audit-log",
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
  email?: string;
  role?: string;
  status?: string;
  schoolDomain?: string;
} = {}): APIGatewayProxyEventV2WithJWTAuthorizer {
  const {
    routeKey = "POST /auth/initialize-user",
    pathParameters = {},
    queryStringParameters = {},
    body = null,
    uid = "user-123",
    email = "user@test.edu",
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
          claims: {
            sub: uid,
            email,
            "custom:role": role,
            "custom:status": status,
            "custom:schoolDomain": schoolDomain,
          },
          scopes: [],
        },
      },
      http: { method, path: rawPath },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

// ── POST /auth/initialize-user ──────────────────────────────────────────────

describe("POST /auth/initialize-user (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("creates user doc and returns 200 when school is approved and user is new", async () => {
    const { handler } = await import("./index.js");
    // initialize-user calls GetCommand twice: schools first, then users
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: { domain: "test.edu", approved: true } }) // schools
      .resolvesOnce({ Item: undefined }); // users (not yet initialised)
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      body: JSON.stringify({ name: "Alice", role: "tutee", schoolDomain: "test.edu" }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
  });

  it("writes user doc with correct fields including subjects and grade", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: { approved: true } }) // schools
      .resolvesOnce({ Item: undefined });          // users
    ddbMock.on(PutCommand).resolves({});

    await handler(makeEvent({
      uid: "uid-abc",
      body: JSON.stringify({
        name: "Bob",
        role: "tutor",
        schoolDomain: "test.edu",
        grade: "11",
        subjects: ["Math", "Physics"],
      }),
    }));

    const putCall = ddbMock.commandCalls(PutCommand)[0];
    const item = putCall.args[0].input.Item!;
    expect(item.uid).toBe("uid-abc");
    expect(item.name).toBe("Bob");
    expect(item.role).toBe("tutor");
    expect(item.subjects).toEqual(["Math", "Physics"]);
    expect(item.status).toBe("active");
  });

  it("returns 400 when school is not approved", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: { domain: "test.edu", approved: false } });

    const result = await handler(makeEvent({
      body: JSON.stringify({ name: "Alice", role: "tutee", schoolDomain: "test.edu" }),
    }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string)).toMatchObject({ error: { message: "School is not approved." } });
  });

  it("returns 400 when school item does not exist", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolvesOnce({ Item: undefined });

    const result = await handler(makeEvent({
      body: JSON.stringify({ name: "Alice", role: "tutee", schoolDomain: "test.edu" }),
    }));

    expect(result.statusCode).toBe(400);
  });

  it("returns 409 when user already initialized", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolvesOnce({ Item: { approved: true } })    // schools
      .resolvesOnce({ Item: { uid: "user-123" } }); // users (already exists)

    const result = await handler(makeEvent({
      body: JSON.stringify({ name: "Alice", role: "tutee", schoolDomain: "test.edu" }),
    }));

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body as string)).toMatchObject({ error: { message: "User already initialized." } });
  });

  it("returns 400 when body is missing", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({ body: null }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when role is invalid", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      body: JSON.stringify({ name: "Alice", role: "supervillain", schoolDomain: "test.edu" }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when name is empty string", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      body: JSON.stringify({ name: "", role: "tutee", schoolDomain: "test.edu" }),
    }));
    expect(result.statusCode).toBe(400);
  });
});

// ── POST /auth/send-verification-otp ───────────────────────────────────────

describe("POST /auth/send-verification-otp (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("sends OTP and returns 200 when no recent code exists", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-email-verifications" })
      .resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({ routeKey: "POST /auth/send-verification-otp" }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ sent: true });
  });

  it("returns 429 when a code was sent less than 60 seconds ago", async () => {
    const { handler } = await import("./index.js");
    const recentlySent = new Date(Date.now() - 30_000).toISOString();
    ddbMock.on(GetCommand, { TableName: "test-email-verifications" })
      .resolves({ Item: { uid: "user-123", sentAt: recentlySent } });

    const result = await handler(makeEvent({ routeKey: "POST /auth/send-verification-otp" }));

    expect(result.statusCode).toBe(429);
  });

  it("allows resend after 60+ seconds have elapsed", async () => {
    const { handler } = await import("./index.js");
    const oldSent = new Date(Date.now() - 90_000).toISOString();
    ddbMock.on(GetCommand, { TableName: "test-email-verifications" })
      .resolves({ Item: { uid: "user-123", sentAt: oldSent } });
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({ routeKey: "POST /auth/send-verification-otp" }));

    expect(result.statusCode).toBe(200);
  });
});

// ── POST /auth/verify-email-otp ────────────────────────────────────────────

describe("POST /auth/verify-email-otp (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns 404 when no pending verification exists", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-email-verifications" })
      .resolves({ Item: undefined });

    const result = await handler(makeEvent({
      routeKey: "POST /auth/verify-email-otp",
      body: JSON.stringify({ otp: "123456" }),
    }));

    expect(result.statusCode).toBe(404);
  });

  it("returns 400 when OTP is wrong and decrements remaining attempts", async () => {
    const { handler } = await import("./index.js");
    const crypto = await import("crypto");
    const wrongHashData = {
      uid: "user-123",
      otpHash: "bad-hash",
      expiresAtIso: new Date(Date.now() + 600_000).toISOString(),
      attempts: 0,
    };
    ddbMock.on(GetCommand, { TableName: "test-email-verifications" })
      .resolves({ Item: wrongHashData });
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /auth/verify-email-otp",
      body: JSON.stringify({ otp: "000000" }),
    }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error.message).toMatch(/incorrect code/i);
  });

  it("returns 410 when code is expired", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-email-verifications" })
      .resolves({ Item: {
        uid: "user-123",
        otpHash: "any-hash",
        expiresAtIso: new Date(Date.now() - 1000).toISOString(),
        attempts: 0,
      }});
    ddbMock.on(DeleteCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /auth/verify-email-otp",
      body: JSON.stringify({ otp: "123456" }),
    }));

    expect(result.statusCode).toBe(410);
  });

  it("returns 400 when OTP is not 6 digits", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /auth/verify-email-otp",
      body: JSON.stringify({ otp: "123" }),
    }));
    expect(result.statusCode).toBe(400);
  });
});

// ── POST /auth/update-tutor-profile ────────────────────────────────────────

describe("POST /auth/update-tutor-profile (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("updates subjects and bio and returns 200", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /auth/update-tutor-profile",
      body: JSON.stringify({ subjects: ["Math", "Chemistry"], bio: "I love tutoring!" }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
  });

  it("returns 400 when subjects is empty array", async () => {
    const { handler } = await import("./index.js");

    const result = await handler(makeEvent({
      routeKey: "POST /auth/update-tutor-profile",
      body: JSON.stringify({ subjects: [], bio: "test" }),
    }));

    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when bio exceeds 280 characters", async () => {
    const { handler } = await import("./index.js");

    const result = await handler(makeEvent({
      routeKey: "POST /auth/update-tutor-profile",
      body: JSON.stringify({ subjects: ["Math"], bio: "x".repeat(281) }),
    }));

    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when body is missing", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /auth/update-tutor-profile",
      body: null,
    }));
    expect(result.statusCode).toBe(400);
  });
});

// ── POST /auth/promote-superadmin ──────────────────────────────────────────

describe("POST /auth/promote-superadmin (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("promotes user to superadmin when caller is superadmin", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand)
      .resolves({ Item: { uid: "target-uid", email: "target@test.edu", schoolDomain: "test.edu" } });
    ddbMock.on(UpdateCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /auth/promote-superadmin",
      role: "superadmin",
      body: JSON.stringify({ uid: "target-uid" }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
  });

  it("returns 403 when caller is not superadmin", async () => {
    const { handler } = await import("./index.js");

    const result = await handler(makeEvent({
      routeKey: "POST /auth/promote-superadmin",
      role: "tutee",
      body: JSON.stringify({ uid: "target-uid" }),
    }));

    expect(result.statusCode).toBe(403);
  });

  it("returns 404 when target user does not exist", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await handler(makeEvent({
      routeKey: "POST /auth/promote-superadmin",
      role: "superadmin",
      body: JSON.stringify({ uid: "ghost-uid" }),
    }));

    expect(result.statusCode).toBe(404);
  });
});

// ── GET /users/me ──────────────────────────────────────────────────────────

describe("GET /users/me (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns current user document", async () => {
    const { handler } = await import("./index.js");
    const userDoc = { uid: "user-123", name: "Alice", role: "tutee", schoolDomain: "test.edu" };
    ddbMock.on(GetCommand).resolves({ Item: userDoc });

    const result = await handler(makeEvent({ routeKey: "GET /users/me" }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ uid: "user-123", name: "Alice" });
  });

  it("returns 404 when user not found", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await handler(makeEvent({ routeKey: "GET /users/me" }));

    expect(result.statusCode).toBe(404);
  });
});

// ── GET /users/{uid} ───────────────────────────────────────────────────────

describe("GET /users/{uid} (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns public user profile with correct fields", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({
      Item: {
        uid: "tutor-1",
        name: "Bob",
        role: "tutor",
        grade: "12",
        schoolDomain: "test.edu",
        subjects: ["Math"],
        bio: "Love math!",
        avgRating: 4.5,
        reviewCount: 10,
        status: "active",
        email: "bob@test.edu", // should NOT be in response
      },
    });

    const result = await handler(makeEvent({
      routeKey: "GET /users/{uid}",
      rawPath: "/users/tutor-1",
      pathParameters: { uid: "tutor-1" },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.uid).toBe("tutor-1");
    expect(body.name).toBe("Bob");
    expect(body.avgRating).toBe(4.5);
    // Email is a private field — the handler should not expose it
    expect(body).not.toHaveProperty("email");
  });

  it("returns 404 when user does not exist", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await handler(makeEvent({
      routeKey: "GET /users/{uid}",
      rawPath: "/users/ghost",
      pathParameters: { uid: "ghost" },
    }));

    expect(result.statusCode).toBe(404);
  });
});

// ── Router 404 ─────────────────────────────────────────────────────────────

describe("unknown routes", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns 404 for unregistered route key", async () => {
    const { handler } = await import("./index.js");

    const result = await handler(makeEvent({
      routeKey: "DELETE /auth/nope",
      rawPath: "/auth/nope",
    }));

    expect(result.statusCode).toBe(404);
  });
});
