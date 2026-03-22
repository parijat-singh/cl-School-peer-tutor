import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureError, Sentry } from "./sentry";

describe("sentry stub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Sentry is null (stub mode)", () => {
    expect(Sentry).toBeNull();
  });

  it("captureError logs to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    captureError(err);
    expect(spy).toHaveBeenCalledWith("[ERROR]", "", err);
    spy.mockRestore();
  });

  it("captureError includes context in log output", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    captureError(err, { handler: "auth", route: "GET /users/me" });
    expect(spy).toHaveBeenCalledWith(
      "[ERROR]",
      JSON.stringify({ handler: "auth", route: "GET /users/me" }),
      err,
    );
    spy.mockRestore();
  });
});
