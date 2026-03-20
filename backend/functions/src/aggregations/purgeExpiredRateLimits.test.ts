import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockBatchDelete, mockBatchCommit, mockQueryGet, mockCaptureError } = vi.hoisted(() => ({
  mockBatchDelete: vi.fn(),
  mockBatchCommit: vi.fn().mockResolvedValue(undefined),
  mockQueryGet: vi.fn(),
  mockCaptureError: vi.fn(),
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: vi.fn((_opts: any, handler: any) => handler),
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: mockQueryGet,
    })),
    batch: vi.fn(() => ({ delete: mockBatchDelete, commit: mockBatchCommit })),
  },
}));

vi.mock("../lib/sentry", () => ({ captureError: mockCaptureError }));

import { purgeExpiredRateLimits } from "./purgeExpiredRateLimits";
const handler = purgeExpiredRateLimits as any;

describe("purgeExpiredRateLimits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when no expired docs", async () => {
    mockQueryGet.mockResolvedValue({ empty: true, docs: [], size: 0 });
    await handler();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("deletes expired rate-limit docs in batch", async () => {
    const mockRef1 = { id: "rl1" };
    const mockRef2 = { id: "rl2" };
    mockQueryGet.mockResolvedValue({
      empty: false,
      size: 2,
      docs: [{ ref: mockRef1 }, { ref: mockRef2 }],
    });
    await handler();
    expect(mockBatchDelete).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it("handles batch commit failure gracefully", async () => {
    mockQueryGet.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [{ ref: { id: "rl1" } }],
    });
    mockBatchCommit.mockRejectedValueOnce(new Error("Firestore down"));
    await handler();
    expect(mockCaptureError).toHaveBeenCalled();
  });
});
