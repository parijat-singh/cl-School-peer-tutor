import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sentry/aws-serverless before importing
vi.mock("@sentry/aws-serverless", () => ({
  init: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/aws-serverless";
import { captureError } from "./sentry";

describe("sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captureError calls Sentry.captureException", () => {
    const err = new Error("boom");
    captureError(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it("captureError sets context when provided", () => {
    const err = new Error("boom");
    captureError(err, { handler: "auth", route: "GET /users/me" });
    expect(Sentry.setContext).toHaveBeenCalledWith("lambda", {
      handler: "auth",
      route: "GET /users/me",
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it("captureError does not set context when not provided", () => {
    captureError("string error");
    expect(Sentry.setContext).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith("string error");
  });
});
