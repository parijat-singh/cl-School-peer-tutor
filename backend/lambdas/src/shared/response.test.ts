import { describe, it, expect } from "vitest";
import { json, error } from "./response.js";

describe("json", () => {
  it("returns 200 with JSON-stringified body by default", () => {
    const result = json({ message: "ok" });
    expect(result).toEqual({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ok" }),
    });
  });

  it("accepts a custom status code", () => {
    const result = json({ id: "123" }, 201);
    expect(result.statusCode).toBe(201);
  });

  it("handles an empty object body", () => {
    const result = json({});
    expect(result.body).toBe("{}");
  });

  it("handles an array body", () => {
    const result = json([1, 2, 3]);
    expect(result.body).toBe("[1,2,3]");
  });

  it("handles null body", () => {
    const result = json(null);
    expect(result.body).toBe("null");
  });

  it("handles string body", () => {
    const result = json("hello");
    expect(result.body).toBe('"hello"');
  });
});

describe("error", () => {
  it("returns a 400 error with default code", () => {
    const result = error(400, "Bad input");
    const body = JSON.parse(result.body as string);
    expect(result.statusCode).toBe(400);
    expect(body.error.code).toBe("bad-request");
    expect(body.error.message).toBe("Bad input");
  });

  it("returns a 401 error with default code", () => {
    const result = error(401, "Not authenticated");
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("returns a 403 error with default code", () => {
    const result = error(403, "No access");
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe("permission-denied");
  });

  it("returns a 404 error with default code", () => {
    const result = error(404, "Not found");
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe("not-found");
  });

  it("returns a 409 error with default code", () => {
    const result = error(409, "Conflict");
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe("already-exists");
  });

  it("returns a 429 error with default code", () => {
    const result = error(429, "Too many requests");
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe("resource-exhausted");
  });

  it("returns 'internal' for unrecognized status codes", () => {
    const result = error(500, "Server error");
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe("internal");
  });

  it("returns 'internal' for uncommon status codes", () => {
    const result = error(502, "Bad gateway");
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe("internal");
  });

  it("uses custom code when provided", () => {
    const result = error(400, "Validation failed", "validation-error");
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe("validation-error");
    expect(body.error.message).toBe("Validation failed");
  });

  it("includes Content-Type header", () => {
    const result = error(500, "oops");
    expect(result.headers).toEqual({ "Content-Type": "application/json" });
  });
});
