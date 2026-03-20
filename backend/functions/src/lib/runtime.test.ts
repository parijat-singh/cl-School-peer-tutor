import { describe, it, expect, vi, beforeEach } from "vitest";

describe("shouldEnforceAppCheck", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should be false when FUNCTIONS_EMULATOR is 'true'", async () => {
    vi.stubEnv("FUNCTIONS_EMULATOR", "true");
    const { shouldEnforceAppCheck } = await import("./runtime");
    expect(shouldEnforceAppCheck).toBe(false);
    vi.unstubAllEnvs();
  });

  it("should be true when FUNCTIONS_EMULATOR is not set", async () => {
    vi.stubEnv("FUNCTIONS_EMULATOR", "");
    const { shouldEnforceAppCheck } = await import("./runtime");
    expect(shouldEnforceAppCheck).toBe(true);
    vi.unstubAllEnvs();
  });

  it("should be true when FUNCTIONS_EMULATOR is 'false'", async () => {
    vi.stubEnv("FUNCTIONS_EMULATOR", "false");
    const { shouldEnforceAppCheck } = await import("./runtime");
    expect(shouldEnforceAppCheck).toBe(true);
    vi.unstubAllEnvs();
  });
});
