// Integration tests for the Schools Lambda.
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
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

vi.mock("../../shared/sentry.js", () => ({ captureError: vi.fn() }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({}),
    }),
  },
  createTransport: vi.fn().mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({}),
  }),
}));
vi.mock("../../shared/dynamo.js", () => {
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  return {
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    Tables: {
      Users:             "test-users",
      Schools:           "test-schools",
      AvailabilitySlots: "test-slots",
      Stats:             "test-stats",
      AdminAuditLog:     "test-admin-audit-log",
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
  hasClaims?: boolean;
} = {}): APIGatewayProxyEventV2WithJWTAuthorizer {
  const {
    routeKey = "GET /schools",
    pathParameters = {},
    queryStringParameters = {},
    body = null,
    uid = "user-1",
    role = "tutee",
    status = "active",
    schoolDomain = "test.edu",
    hasClaims = true,
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
      authorizer: hasClaims ? {
        jwt: {
          claims: { sub: uid, email: `${uid}@test.edu`, "custom:role": role, "custom:status": status, "custom:schoolDomain": schoolDomain },
          scopes: [],
        },
      } : { jwt: { claims: {}, scopes: [] } },
      http: { method, path: rawPath },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const SCHOOL = {
  domain: "test.edu",
  name: "Test High School",
  type: "high",
  adminEmail: "admin@test.edu",
  approved: true,
  status: "approved",
  brandColor: "#0055FF",
  logoUrl: null,
  subjects: ["Math", "English"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

// ── POST /schools/register ─────────────────────────────────────────────────

describe("POST /schools/register (via router)", () => {
  beforeEach(() => {
    ddbMock.reset();
    delete process.env.SUPER_ADMIN_EMAIL;
  });

  it("registers a new school and returns success", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-schools" }).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /schools/register",
      hasClaims: false,
      body: JSON.stringify({ domain: "newschool.edu", name: "New School", type: "high", adminEmail: "admin@newschool.edu" }),
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(false);
  });

  it("stores school as pending (not approved) on registration", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-schools" }).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});

    await handler(makeEvent({
      routeKey: "POST /schools/register",
      hasClaims: false,
      body: JSON.stringify({ domain: "newschool.edu", name: "New School", type: "high", adminEmail: "admin@newschool.edu" }),
    }));

    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item!.approved).toBe(false);
    expect(putCall.args[0].input.Item!.status).toBe("pending");
  });

  it("returns 409 when school domain already registered", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand, { TableName: "test-schools" }).resolves({ Item: SCHOOL });

    const result = await handler(makeEvent({
      routeKey: "POST /schools/register",
      hasClaims: false,
      body: JSON.stringify({ domain: "test.edu", name: "Test School", type: "high", adminEmail: "admin@test.edu" }),
    }));

    expect(result.statusCode).toBe(409);
  });

  it("returns 400 when domain format is invalid", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /schools/register",
      hasClaims: false,
      body: JSON.stringify({ domain: "not_a_domain", name: "Test", type: "high", adminEmail: "admin@test.edu" }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when type is invalid", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /schools/register",
      hasClaims: false,
      body: JSON.stringify({ domain: "test.edu", name: "Test", type: "university", adminEmail: "admin@test.edu" }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when adminEmail is invalid", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /schools/register",
      hasClaims: false,
      body: JSON.stringify({ domain: "test.edu", name: "Test", type: "high", adminEmail: "not-an-email" }),
    }));
    expect(result.statusCode).toBe(400);
  });
});

// ── POST /schools/approve ──────────────────────────────────────────────────

describe("POST /schools/approve (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("approves school and logs audit entry when caller is superadmin", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: { ...SCHOOL, approved: false } });
    ddbMock.on(UpdateCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /schools/approve",
      role: "superadmin",
      body: JSON.stringify({ domain: "test.edu" }),
    }));

    expect(result.statusCode).toBe(200);
    // Audit log put should be called
    const putCalls = ddbMock.commandCalls(PutCommand);
    expect(putCalls.length).toBe(1);
    expect(putCalls[0].args[0].input.Item!.action).toBe("approve_school");
  });

  it("returns 403 when caller is not superadmin", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /schools/approve",
      role: "tutee",
      body: JSON.stringify({ domain: "test.edu" }),
    }));
    expect(result.statusCode).toBe(403);
  });

  it("returns 404 when school not found", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await handler(makeEvent({
      routeKey: "POST /schools/approve",
      role: "superadmin",
      body: JSON.stringify({ domain: "ghost.edu" }),
    }));

    expect(result.statusCode).toBe(404);
  });
});

// ── GET /schools/{domain} ──────────────────────────────────────────────────

describe("GET /schools/{domain} (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns school document", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: SCHOOL });

    const result = await handler(makeEvent({
      routeKey: "GET /schools/{domain}",
      rawPath: "/schools/test.edu",
      pathParameters: { domain: "test.edu" },
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ domain: "test.edu", name: "Test High School" });
  });

  it("returns 404 when school not found", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await handler(makeEvent({
      routeKey: "GET /schools/{domain}",
      rawPath: "/schools/ghost.edu",
      pathParameters: { domain: "ghost.edu" },
    }));

    expect(result.statusCode).toBe(404);
  });
});

// ── GET /schools/{domain}/tutors ───────────────────────────────────────────

describe("GET /schools/{domain}/tutors (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("combines tutors from role=tutor and role=both queries", async () => {
    const { handler } = await import("./index.js");
    const tutor1 = { uid: "t1", role: "tutor", schoolDomain: "test.edu" };
    const tutor2 = { uid: "t2", role: "both",  schoolDomain: "test.edu" };
    // First QueryCommand returns role=tutor, second returns role=both
    ddbMock.on(QueryCommand).resolvesOnce({ Items: [tutor1] }).resolvesOnce({ Items: [tutor2] });

    const result = await handler(makeEvent({
      routeKey: "GET /schools/{domain}/tutors",
      rawPath: "/schools/test.edu/tutors",
      pathParameters: { domain: "test.edu" },
      queryStringParameters: { schoolDomain: "test.edu" },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.tutors).toHaveLength(2);
    expect(body.tutors.map((t: { uid: string }) => t.uid)).toEqual(["t1", "t2"]);
  });
});

// ── Availability CRUD ──────────────────────────────────────────────────────

describe("POST /availability/add (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("creates slot and returns slotId", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(PutCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "POST /availability/add",
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({
        day: "Monday",
        startTime: "09:00",
        endTime: "10:00",
        duration: 60,
        recurring: true,
        schoolDomain: "test.edu",
      }),
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).slotId).toBeTruthy();
  });

  it("stores slot with correct tutorId from JWT claims", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(PutCommand).resolves({});

    await handler(makeEvent({
      routeKey: "POST /availability/add",
      uid: "tutor-abc",
      role: "tutor",
      body: JSON.stringify({
        day: "Friday",
        startTime: "14:00",
        endTime: "15:00",
        duration: 60,
        recurring: false,
        date: "2026-05-10",
        schoolDomain: "test.edu",
      }),
    }));

    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item!.tutorId).toBe("tutor-abc");
  });
});

describe("DELETE /availability/{slotId} (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("deletes slot and returns success", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(DeleteCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "DELETE /availability/{slotId}",
      rawPath: "/availability/slot-1",
      pathParameters: { slotId: "slot-1" },
      uid: "tutor-1",
      role: "tutor",
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toMatchObject({ success: true });
  });
});

describe("PATCH /availability/{slotId} (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("updates slot fields and returns success", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler(makeEvent({
      routeKey: "PATCH /availability/{slotId}",
      rawPath: "/availability/slot-1",
      pathParameters: { slotId: "slot-1" },
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({ startTime: "10:00", endTime: "11:00" }),
    }));

    expect(result.statusCode).toBe(200);
  });

  it("returns 400 when no fields to update", async () => {
    const { handler } = await import("./index.js");

    const result = await handler(makeEvent({
      routeKey: "PATCH /availability/{slotId}",
      rawPath: "/availability/slot-1",
      pathParameters: { slotId: "slot-1" },
      uid: "tutor-1",
      role: "tutor",
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(400);
  });
});

// ── GET /audit-log/{domain} ────────────────────────────────────────────────

describe("GET /audit-log/{domain} (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns audit entries with id field for superadmin", async () => {
    const { handler } = await import("./index.js");
    const entry = { schoolDomain: "test.edu", timestampLogId: "2026-01-01T00:00:00.000Z#ulid1", action: "approve_school" };
    ddbMock.on(QueryCommand).resolves({ Items: [entry] });

    const result = await handler(makeEvent({
      routeKey: "GET /audit-log/{domain}",
      rawPath: "/audit-log/test.edu",
      pathParameters: { domain: "test.edu" },
      role: "superadmin",
      schoolDomain: "test.edu",
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.entries[0].id).toBe(entry.timestampLogId);
  });

  it("allows schooladmin to view their own school's audit log", async () => {
    const { handler } = await import("./index.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await handler(makeEvent({
      routeKey: "GET /audit-log/{domain}",
      rawPath: "/audit-log/test.edu",
      pathParameters: { domain: "test.edu" },
      role: "schooladmin",
      schoolDomain: "test.edu",
    }));

    expect(result.statusCode).toBe(200);
  });

  it("returns 403 when schooladmin tries to view another school's log", async () => {
    const { handler } = await import("./index.js");

    const result = await handler(makeEvent({
      routeKey: "GET /audit-log/{domain}",
      rawPath: "/audit-log/other.edu",
      pathParameters: { domain: "other.edu" },
      role: "schooladmin",
      schoolDomain: "test.edu",
    }));

    expect(result.statusCode).toBe(403);
  });

  it("returns 403 when caller is a regular tutee", async () => {
    const { handler } = await import("./index.js");

    const result = await handler(makeEvent({
      routeKey: "GET /audit-log/{domain}",
      rawPath: "/audit-log/test.edu",
      pathParameters: { domain: "test.edu" },
      role: "tutee",
    }));

    expect(result.statusCode).toBe(403);
  });
});

// ── GET /tutors/{uid}/slots ────────────────────────────────────────────────

describe("GET /tutors/{uid}/slots (via router)", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("returns slots with id field mapped from slotId", async () => {
    const { handler } = await import("./index.js");
    const slot = { tutorId: "tutor-1", slotId: "slot-1", day: "Monday", startTime: "09:00", endTime: "10:00" };
    ddbMock.on(QueryCommand).resolves({ Items: [slot] });

    const result = await handler(makeEvent({
      routeKey: "GET /tutors/{uid}/slots",
      rawPath: "/tutors/tutor-1/slots",
      pathParameters: { uid: "tutor-1" },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.slots[0].id).toBe("slot-1");
  });
});

// ── Router 404 ────────────────────────────────────────────────────────────

describe("unknown routes", () => {
  it("returns 404 for unknown route", async () => {
    const { handler } = await import("./index.js");
    const result = await handler(makeEvent({
      routeKey: "POST /schools/explode",
      rawPath: "/schools/explode",
    }));
    expect(result.statusCode).toBe(404);
  });
});
