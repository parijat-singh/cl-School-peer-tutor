import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

vi.mock("../../shared/sentry.js", () => ({ captureError: vi.fn() }));
vi.mock("../../shared/dynamo.js", () => {
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  return {
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    Tables: { AdminAuditLog: "test-audit-log" },
  };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

function makeEvent(domain: string, role = "superadmin", schoolDomain = "test.edu"): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    routeKey: `GET /audit-log/${domain}`,
    rawPath: `/audit-log/${domain}`,
    pathParameters: { domain },
    queryStringParameters: {},
    body: undefined,
    isBase64Encoded: false,
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: "admin-1", "custom:role": role, "custom:status": "active", "custom:schoolDomain": schoolDomain },
          scopes: [],
        },
      },
      http: { method: "GET", path: `/audit-log/${domain}` },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const LOG_ITEM = {
  schoolDomain: "test.edu",
  timestampLogId: "2026-01-01T00:00:00.000Z#01ABCDEF",
  adminUid: "admin-1",
  action: "suspend_user",
  targetId: "user-1",
  reason: "Violation",
  timestamp: "2026-01-01T00:00:00.000Z",
};

describe("getAuditLog", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("maps timestampLogId to id so the frontend can reference entries by id", async () => {
    const { getAuditLog } = await import("./get-audit-log.js");
    ddbMock.on(QueryCommand).resolves({ Items: [LOG_ITEM] });

    const result = await getAuditLog(makeEvent("test.edu"));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe("2026-01-01T00:00:00.000Z#01ABCDEF");
    expect(body.entries[0].timestampLogId).toBe("2026-01-01T00:00:00.000Z#01ABCDEF");
  });

  it("returns empty entries array when domain has no audit log", async () => {
    const { getAuditLog } = await import("./get-audit-log.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await getAuditLog(makeEvent("empty.edu"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).entries).toEqual([]);
  });

  it("rejects non-admin callers with 403", async () => {
    const { getAuditLog } = await import("./get-audit-log.js");

    const result = await getAuditLog(makeEvent("test.edu", "tutor", "test.edu"));
    expect(result.statusCode).toBe(403);
  });

  it("rejects school admin accessing a different school with 403", async () => {
    const { getAuditLog } = await import("./get-audit-log.js");

    const result = await getAuditLog(makeEvent("other.edu", "schooladmin", "test.edu"));
    expect(result.statusCode).toBe(403);
  });

  it("allows school admin to access their own school log", async () => {
    const { getAuditLog } = await import("./get-audit-log.js");
    ddbMock.on(QueryCommand).resolves({ Items: [LOG_ITEM] });

    const result = await getAuditLog(makeEvent("test.edu", "schooladmin", "test.edu"));
    expect(result.statusCode).toBe(200);
  });
});
