import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

// Mock dynamo module before importing rate-limit
vi.mock("./dynamo.js", () => {
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return {
    ddb: client,
    Tables: {
      RateLimits: "test-rate-limits",
    },
  };
});

import { checkAndConsumeRateLimit } from "./rate-limit.js";
import { ddb } from "./dynamo.js";

const ddbMock = mockClient(ddb as unknown as DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe("checkAndConsumeRateLimit", () => {
  it("returns true when increment succeeds (under limit)", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { count: 3 },
    });

    const result = await checkAndConsumeRateLimit("test:key", 5, 60_000);
    expect(result).toBe(true);
  });

  it("returns true when increment returns count equal to limit", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { count: 5 },
    });

    const result = await checkAndConsumeRateLimit("test:key", 5, 60_000);
    expect(result).toBe(true);
  });

  it("returns true when first update fails but reset succeeds (new window)", async () => {
    ddbMock
      .on(UpdateCommand)
      .rejectsOnce(
        new ConditionalCheckFailedException({
          message: "Condition not met",
          $metadata: {},
        }),
      )
      .resolvesOnce({}); // reset succeeds

    const result = await checkAndConsumeRateLimit("test:key", 5, 60_000);
    expect(result).toBe(true);
  });

  it("returns false when both updates fail (concurrent race, rate limited)", async () => {
    ddbMock
      .on(UpdateCommand)
      .rejectsOnce(
        new ConditionalCheckFailedException({
          message: "Condition not met",
          $metadata: {},
        }),
      )
      .rejectsOnce(
        new ConditionalCheckFailedException({
          message: "Condition not met",
          $metadata: {},
        }),
      );

    const result = await checkAndConsumeRateLimit("test:key", 5, 60_000);
    expect(result).toBe(false);
  });

  it("throws when first update throws a non-conditional error", async () => {
    ddbMock.on(UpdateCommand).rejectsOnce(new Error("DynamoDB is down"));

    await expect(
      checkAndConsumeRateLimit("test:key", 5, 60_000),
    ).rejects.toThrow("DynamoDB is down");
  });

  it("throws when reset throws a non-conditional error", async () => {
    ddbMock
      .on(UpdateCommand)
      .rejectsOnce(
        new ConditionalCheckFailedException({
          message: "Condition not met",
          $metadata: {},
        }),
      )
      .rejectsOnce(new Error("Unexpected failure"));

    await expect(
      checkAndConsumeRateLimit("test:key", 5, 60_000),
    ).rejects.toThrow("Unexpected failure");
  });

  it("sends UpdateCommand to the correct table", async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { count: 1 } });

    await checkAndConsumeRateLimit("mykey", 10, 30_000);

    const calls = ddbMock.commandCalls(UpdateCommand);
    expect(calls.length).toBe(1);
    expect(calls[0].args[0].input.TableName).toBe("test-rate-limits");
    expect(calls[0].args[0].input.Key).toEqual({ key: "mykey" });
  });

  it("returns true when Attributes is missing (defaults to limit)", async () => {
    ddbMock.on(UpdateCommand).resolves({});

    const result = await checkAndConsumeRateLimit("test:key", 5, 60_000);
    expect(result).toBe(true);
  });
});
