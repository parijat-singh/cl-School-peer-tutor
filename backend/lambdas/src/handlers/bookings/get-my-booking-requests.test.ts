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
    Tables: { BookingRequests: "test-booking-requests" },
  };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

function makeEvent(uid: string, role: "tutor" | "tutee" = "tutor"): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    routeKey: "GET /booking-requests/mine",
    rawPath: "/booking-requests/mine",
    pathParameters: {},
    queryStringParameters: { role },
    body: undefined,
    isBase64Encoded: false,
    requestContext: {
      authorizer: { jwt: { claims: { sub: uid, "custom:role": role, "custom:status": "active", "custom:schoolDomain": "test.edu" }, scopes: [] } },
      http: { method: "GET", path: "/booking-requests/mine" },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const REQUEST_ITEM = {
  requestId: "req-abc123",
  tutorId: "tutor-1",
  tuteeId: "tutee-1",
  tutorName: "Alice",
  tuteeName: "Bob",
  tutorEmail: "alice@test.edu",
  tuteeEmail: "bob@test.edu",
  slotId: "slot-1",
  subject: "Math",
  scheduledDate: "2026-04-07",
  day: "Monday",
  startTime: "09:00",
  endTime: "10:00",
  duration: 60,
  recurring: true,
  status: "pending",
  schoolDomain: "test.edu",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("getMyBookingRequests", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("maps requestId to id so the frontend can reference requests by id", async () => {
    const { getMyBookingRequests } = await import("./get-my-booking-requests.js");
    ddbMock.on(QueryCommand).resolves({ Items: [REQUEST_ITEM] });

    const result = await getMyBookingRequests(makeEvent("tutor-1", "tutor"));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].id).toBe("req-abc123");
    expect(body.requests[0].requestId).toBe("req-abc123");
  });

  it("queries the tutor index when role=tutor", async () => {
    const { getMyBookingRequests } = await import("./get-my-booking-requests.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await getMyBookingRequests(makeEvent("tutor-1", "tutor"));

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.IndexName).toBe("tutorId-status-index");
  });

  it("queries the tutee index when role=tutee", async () => {
    const { getMyBookingRequests } = await import("./get-my-booking-requests.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await getMyBookingRequests(makeEvent("tutee-1", "tutee"));

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.IndexName).toBe("tuteeId-createdAt-index");
  });

  it("returns empty requests array when user has no booking requests", async () => {
    const { getMyBookingRequests } = await import("./get-my-booking-requests.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await getMyBookingRequests(makeEvent("tutor-empty", "tutor"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).requests).toEqual([]);
  });
});
