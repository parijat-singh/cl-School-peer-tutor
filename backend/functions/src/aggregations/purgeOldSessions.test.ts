import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockQueryGet = vi.fn();

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
  Timestamp: { fromDate: vi.fn((d: Date) => d) },
}));

vi.mock("date-fns", () => ({
  subMonths: vi.fn((d: Date, n: number) => new Date(d.getTime() - n * 30 * 86400000)),
}));

import { purgeOldSessions } from "./purgeOldSessions";
const handler = purgeOldSessions as any;

describe("purgeOldSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when no old sessions", async () => {
    mockQueryGet.mockResolvedValue({ empty: true, docs: [], size: 0 });
    await handler();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("deletes old sessions in batch", async () => {
    const mockRef1 = { id: "s1" };
    const mockRef2 = { id: "s2" };
    mockQueryGet.mockResolvedValue({
      empty: false,
      size: 2,
      docs: [{ ref: mockRef1 }, { ref: mockRef2 }],
    });
    await handler();
    expect(mockBatchDelete).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalled();
  });
});
