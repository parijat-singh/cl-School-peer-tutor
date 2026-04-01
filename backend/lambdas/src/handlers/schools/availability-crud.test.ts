import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

// Mock sentry and dynamo before importing handler
vi.mock("../../shared/sentry.js", () => ({ captureError: vi.fn() }));
vi.mock("../../shared/dynamo.js", () => {
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  return {
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    Tables: { AvailabilitySlots: "test-slots" },
  };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

function makeEvent(uid: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    routeKey: `GET /tutors/${uid}/slots`,
    rawPath: `/tutors/${uid}/slots`,
    pathParameters: { uid },
    queryStringParameters: {},
    body: undefined,
    isBase64Encoded: false,
    requestContext: {
      authorizer: { jwt: { claims: { sub: uid }, scopes: [] } },
      http: { method: "GET", path: `/tutors/${uid}/slots` },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("getTutorSlots", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it("maps slotId to id in the response so the frontend can reference slots by id", async () => {
    const { getTutorSlots } = await import("./availability-crud.js");

    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          tutorId: "tutor-1",
          slotId: "slot-abc123",
          recurring: true,
          day: "Monday",
          startTime: "09:00",
          endTime: "10:00",
          duration: 60,
          booked: false,
          schoolDomain: "testschool.edu",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await getTutorSlots(makeEvent("tutor-1"));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.slots).toHaveLength(1);

    // The critical fix: id must equal slotId so frontend operations work
    expect(body.slots[0].id).toBe("slot-abc123");
    expect(body.slots[0].slotId).toBe("slot-abc123");
  });

  it("returns empty slots array when tutor has no availability", async () => {
    const { getTutorSlots } = await import("./availability-crud.js");

    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await getTutorSlots(makeEvent("tutor-empty"));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.slots).toEqual([]);
  });
});
