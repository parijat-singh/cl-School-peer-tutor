/**
 * Unit tests for Sentry helper (captureError and init path).
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

const mockInit = vi.fn();
const mockCaptureException = vi.fn();
const mockSetContext = vi.fn();
const mockOnUnhandledRejectionIntegration = vi.fn(() => ({}));

vi.mock("@sentry/node", () => ({
  init: mockInit,
  captureException: mockCaptureException,
  setContext: mockSetContext,
  onUnhandledRejectionIntegration: mockOnUnhandledRejectionIntegration,
}));

beforeAll(() => {
  process.env.FUNCTIONS_EMULATOR = "false";
  process.env.SENTRY_DSN = "https://key@o123.ingest.sentry.io/1";
});

describe("sentry", () => {
  it("calls captureException when captureError is invoked", async () => {
    const { captureError } = await import("./sentry");
    const err = new Error("test");
    captureError(err);
    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });

  it("sets context when captureError is invoked with context", async () => {
    mockSetContext.mockClear();
    mockCaptureException.mockClear();
    const { captureError } = await import("./sentry");
    captureError(new Error("x"), { requestId: "req1", action: "accept" });
    expect(mockSetContext).toHaveBeenCalledWith("function", {
      requestId: "req1",
      action: "accept",
    });
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it("does not set context when captureError is invoked without context", async () => {
    mockSetContext.mockClear();
    mockCaptureException.mockClear();
    const { captureError } = await import("./sentry");
    captureError(new Error("y"));
    expect(mockSetContext).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(new Error("y"));
  });

  it("initialises Sentry when DSN is set and not in emulator", () => {
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://key@o123.ingest.sentry.io/1",
        environment: "production",
        tracesSampleRate: 0.2,
      })
    );
  });

  it("does not initialise Sentry when in emulator (no DSN)", async () => {
    vi.resetModules();
    const origEmulator = process.env.FUNCTIONS_EMULATOR;
    const origDsn = process.env.SENTRY_DSN;
    process.env.FUNCTIONS_EMULATOR = "true";
    process.env.SENTRY_DSN = "";
    const initCountBefore = mockInit.mock.calls.length;
    await import("./sentry");
    expect(mockInit.mock.calls.length).toBe(initCountBefore);
    process.env.FUNCTIONS_EMULATOR = origEmulator;
    process.env.SENTRY_DSN = origDsn;
  });
});
