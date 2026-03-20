import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTxnGet = vi.fn();
const mockTxnSet = vi.fn();

vi.mock("./admin", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ id: "test-key" })),
    })),
    runTransaction: vi.fn(async (fn: any) => fn({ get: mockTxnGet, set: mockTxnSet })),
  },
  FieldValue: {
    serverTimestamp: vi.fn(() => "SERVER_TS"),
    increment: vi.fn((n: number) => n),
  },
}));

import { checkAndConsumeRateLimit } from "./rateLimit";

describe("checkAndConsumeRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows first request (no existing record)", async () => {
    mockTxnGet.mockResolvedValue({ exists: false, data: () => ({}) });
    const result = await checkAndConsumeRateLimit({ key: "test:u1", limit: 10, windowMs: 60000 });
    expect(result).toBe(true);
    expect(mockTxnSet).toHaveBeenCalled();
  });

  it("allows request within limit", async () => {
    mockTxnGet.mockResolvedValue({
      exists: true,
      data: () => ({
        count: 5,
        resetAt: { toMillis: () => Date.now() + 30000 },
      }),
    });
    const result = await checkAndConsumeRateLimit({ key: "test:u1", limit: 10, windowMs: 60000 });
    expect(result).toBe(true);
  });

  it("blocks request at limit", async () => {
    mockTxnGet.mockResolvedValue({
      exists: true,
      data: () => ({
        count: 10,
        resetAt: { toMillis: () => Date.now() + 30000 },
      }),
    });
    const result = await checkAndConsumeRateLimit({ key: "test:u1", limit: 10, windowMs: 60000 });
    expect(result).toBe(false);
  });

  it("resets window when expired", async () => {
    mockTxnGet.mockResolvedValue({
      exists: true,
      data: () => ({
        count: 99,
        resetAt: { toMillis: () => Date.now() - 1000 }, // expired
      }),
    });
    const result = await checkAndConsumeRateLimit({ key: "test:u1", limit: 10, windowMs: 60000 });
    expect(result).toBe(true);
    expect(mockTxnSet).toHaveBeenCalled();
  });
});
