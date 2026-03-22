import { describe, it, expect, vi } from "vitest";
import { createRouter, parseBody, pathParam, queryParam } from "./router.js";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
} from "aws-lambda";

// Mock sentry to avoid side effects
vi.mock("./sentry.js", () => ({
  captureError: vi.fn(),
}));

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /test",
    body: undefined,
    isBase64Encoded: false,
    pathParameters: {},
    queryStringParameters: {},
    requestContext: {
      authorizer: { jwt: { claims: { sub: "u1" }, scopes: [] } },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEventV2;
}

describe("createRouter", () => {
  it("dispatches to the matching handler", async () => {
    const handler = vi.fn().mockResolvedValue({ statusCode: 200, body: "ok" });
    const router = createRouter({ "GET /test": handler });

    const result = await router(makeEvent({ routeKey: "GET /test" }));
    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({ statusCode: 200, body: "ok" });
  });

  it("returns 404 for unmatched routes", async () => {
    const router = createRouter({ "GET /test": vi.fn() });
    const result = await router(makeEvent({ routeKey: "POST /unknown" }));
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body as string);
    expect(body.error.message).toContain("POST /unknown");
  });

  it("catches application errors with statusCode and returns them", async () => {
    const handler = vi.fn().mockRejectedValue(
      Object.assign(new Error("Not found"), { statusCode: 404 }),
    );
    const router = createRouter({ "GET /test": handler });
    const result = await router(makeEvent({ routeKey: "GET /test" }));
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body as string);
    expect(body.error.message).toBe("Not found");
  });

  it("catches unexpected errors and returns 500", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("kaboom"));
    const router = createRouter({ "GET /test": handler });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await router(makeEvent({ routeKey: "GET /test" }));
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body as string);
    expect(body.error.message).toContain("Internal server error");

    consoleSpy.mockRestore();
  });

  it("resolves proxy+ routes using rawPath fallback", async () => {
    const handler = vi.fn().mockResolvedValue({ statusCode: 200, body: "ok" });
    const router = createRouter({ "POST /contact/submit": handler });

    const event = makeEvent({
      routeKey: "POST /contact/{proxy+}",
      rawPath: "/contact/submit",
      requestContext: {
        http: { method: "POST", path: "/contact/submit" },
        authorizer: { jwt: { claims: { sub: "u1" }, scopes: [] } },
      } as any,
    });

    const result = await router(event);
    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({ statusCode: 200, body: "ok" });
  });

  it("returns 404 when proxy+ route does not match any handler", async () => {
    const router = createRouter({ "POST /contact/submit": vi.fn() });

    const event = makeEvent({
      routeKey: "POST /contact/{proxy+}",
      rawPath: "/contact/nonexistent",
      requestContext: {
        http: { method: "POST", path: "/contact/nonexistent" },
        authorizer: { jwt: { claims: { sub: "u1" }, scopes: [] } },
      } as any,
    });

    const result = await router(event);
    expect(result.statusCode).toBe(404);
  });

  it("does not treat 5xx statusCode errors as application errors", async () => {
    const handler = vi.fn().mockRejectedValue(
      Object.assign(new Error("Server broke"), { statusCode: 500 }),
    );
    const router = createRouter({ "GET /test": handler });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await router(makeEvent({ routeKey: "GET /test" }));
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body as string);
    expect(body.error.message).toContain("Internal server error");

    consoleSpy.mockRestore();
  });
});

describe("parseBody", () => {
  it("returns parsed JSON from body", () => {
    const event = makeEvent({ body: '{"name":"Alice"}' });
    expect(parseBody(event)).toEqual({ name: "Alice" });
  });

  it("returns null when body is undefined", () => {
    const event = makeEvent({ body: undefined });
    expect(parseBody(event)).toBeNull();
  });

  it("returns null when body is empty string", () => {
    const event = makeEvent({ body: "" });
    expect(parseBody(event)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const event = makeEvent({ body: "not json" });
    expect(parseBody(event)).toBeNull();
  });

  it("decodes base64-encoded body", () => {
    const payload = { key: "value" };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const event = makeEvent({ body: encoded, isBase64Encoded: true });
    expect(parseBody(event)).toEqual(payload);
  });

  it("returns null for invalid base64 JSON", () => {
    const encoded = Buffer.from("not json").toString("base64");
    const event = makeEvent({ body: encoded, isBase64Encoded: true });
    expect(parseBody(event)).toBeNull();
  });
});

describe("pathParam", () => {
  it("returns the decoded path parameter", () => {
    const event = makeEvent({ pathParameters: { uid: "user-123" } });
    expect(pathParam(event, "uid")).toBe("user-123");
  });

  it("decodes URI-encoded values", () => {
    const event = makeEvent({ pathParameters: { domain: "school%40test.com" } });
    expect(pathParam(event, "domain")).toBe("school@test.com");
  });

  it("throws 400 when parameter is missing", () => {
    const event = makeEvent({ pathParameters: {} });
    expect(() => pathParam(event, "uid")).toThrow("Missing path parameter: uid");
    try {
      pathParam(event, "uid");
    } catch (e: any) {
      expect(e.statusCode).toBe(400);
    }
  });

  it("throws 400 when pathParameters is undefined", () => {
    const event = makeEvent({ pathParameters: undefined });
    expect(() => pathParam(event, "uid")).toThrow("Missing path parameter");
  });
});

describe("queryParam", () => {
  it("returns the query parameter value", () => {
    const event = makeEvent({ queryStringParameters: { page: "2" } });
    expect(queryParam(event, "page")).toBe("2");
  });

  it("returns undefined when parameter is absent", () => {
    const event = makeEvent({ queryStringParameters: {} });
    expect(queryParam(event, "page")).toBeUndefined();
  });

  it("returns undefined when queryStringParameters is undefined", () => {
    const event = makeEvent({ queryStringParameters: undefined });
    expect(queryParam(event, "page")).toBeUndefined();
  });
});
