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
    Tables: { Reviews: "test-reviews" },
  };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

function makeEventWithUid(uid: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    routeKey: `GET /tutors/${uid}/reviews`,
    rawPath: `/tutors/${uid}/reviews`,
    pathParameters: { uid },
    queryStringParameters: {},
    body: undefined,
    isBase64Encoded: false,
    requestContext: {
      authorizer: { jwt: { claims: { sub: uid }, scopes: [] } },
      http: { method: "GET", path: `/tutors/${uid}/reviews` },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function makeEventWithDomain(domain: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    routeKey: `GET /reviews/school/${domain}`,
    rawPath: `/reviews/school/${domain}`,
    pathParameters: { domain },
    queryStringParameters: {},
    body: undefined,
    isBase64Encoded: false,
    requestContext: {
      authorizer: { jwt: { claims: { sub: "admin-1" }, scopes: [] } },
      http: { method: "GET", path: `/reviews/school/${domain}` },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const REVIEW_ITEM = {
  reviewId: "rev-abc123",
  sessionId: "sess-1",
  authorId: "tutee-1",
  authorName: "Bob",
  targetId: "tutor-1",
  targetName: "Alice",
  stars: 5,
  text: "Great tutor!",
  flagged: false,
  schoolDomain: "test.edu",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("getTutorReviews", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("maps reviewId to id so the frontend can reference reviews by id", async () => {
    const { getTutorReviews } = await import("./get-tutor-reviews.js");
    ddbMock.on(QueryCommand).resolves({ Items: [REVIEW_ITEM] });

    const result = await getTutorReviews(makeEventWithUid("tutor-1"));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].id).toBe("rev-abc123");
    expect(body.reviews[0].reviewId).toBe("rev-abc123");
  });

  it("returns empty reviews array when tutor has no reviews", async () => {
    const { getTutorReviews } = await import("./get-tutor-reviews.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await getTutorReviews(makeEventWithUid("tutor-empty"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).reviews).toEqual([]);
  });
});

describe("getSchoolReviews", () => {
  beforeEach(() => { ddbMock.reset(); });

  it("maps reviewId to id so the frontend can reference reviews by id", async () => {
    const { getSchoolReviews } = await import("./get-school-reviews.js");
    ddbMock.on(QueryCommand).resolves({ Items: [REVIEW_ITEM] });

    const result = await getSchoolReviews(makeEventWithDomain("test.edu"));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].id).toBe("rev-abc123");
    expect(body.reviews[0].reviewId).toBe("rev-abc123");
  });

  it("returns empty reviews array when school has no reviews", async () => {
    const { getSchoolReviews } = await import("./get-school-reviews.js");
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await getSchoolReviews(makeEventWithDomain("empty.edu"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).reviews).toEqual([]);
  });
});
