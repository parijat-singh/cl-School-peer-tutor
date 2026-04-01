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
    Tables: { Sessions: "test-sessions" },
  };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

function makeEvent(uid: string, role: "tutor" | "tutee" = "tutor"): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    routeKey: "GET /sessions/mine",
    rawPath: "/sessions/mine",
    pathParameters: {},
    queryStringParameters: { role },
    body: undefined,
    isBase64Encoded: false,
    requestContext: {
      authorizer: { jwt: { claims: { sub: uid, "custom:role": role, "custom:status": "active", "custom:schoolDomain": "test.edu" }, scopes: [] } },
      http: { method: "GET", path: "/sessions/mine" },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const SESSION_ITEM = {
  sessionId: "sess-abc123",
  tutorId: "tutor-1",
  tuteeId: "tutee-1",
  tutorName: "Alice",
  tuteeName: "Bob",
  subject: "Math",
  slotId: "slot-1",
  day: "Monday",
  startTime: "09:00",
  endTime: "10:00",
  duration: 60,
  scheduledDate: "2026-04-07",
  status: "upcoming",
  meetLinkStatus: "pending",
  schoolDomain: "test.edu",
  createdAt: "2026-01-01T00:00:00.000Z",
  tutorRated: false,
  tuteeRated: false,
};

describe("getMySessions", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("maps sessionId to id so the frontend can reference sessions by id", async () => {
    const { getMySessions } = await import("./get-my-sessions.js");
    ddbMock.on(QueryCommand).resolves({ Items: [SESSION_ITEM] });

    const result = await getMySessions(makeEvent("tutor-1", "tutor"));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe("sess-abc123");
    expect(body.sessions[0].sessionId).toBe("sess-abc123");
  });

  it("queries the tutor index when role=tutor", async () => {
    const { getMySessions } = await import("./get-my-sessions.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await getMySessions(makeEvent("tutor-1", "tutor"));

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.IndexName).toBe("tutorId-status-index");
  });

  it("queries the tutee index when role=tutee", async () => {
    const { getMySessions } = await import("./get-my-sessions.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await getMySessions(makeEvent("tutee-1", "tutee"));

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.IndexName).toBe("tuteeId-status-index");
  });

  it("returns empty sessions array when user has no sessions", async () => {
    const { getMySessions } = await import("./get-my-sessions.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await getMySessions(makeEvent("tutor-empty", "tutor"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).sessions).toEqual([]);
  });
});
