import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryGet, mockUserGet, mockBatchUpdate, mockBatchCommit, mockSendRatingPrompt, mockCaptureError } = vi.hoisted(() => ({
  mockQueryGet: vi.fn(), mockUserGet: vi.fn(),
  mockBatchUpdate: vi.fn(), mockBatchCommit: vi.fn().mockResolvedValue(undefined),
  mockSendRatingPrompt: vi.fn().mockResolvedValue(undefined),
  mockCaptureError: vi.fn(),
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: vi.fn((_opts: any, handler: any) => handler),
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "users") return {
        doc: vi.fn(() => ({ get: mockUserGet })),
      };
      return {
        where: vi.fn().mockReturnThis(),
        get: mockQueryGet,
      };
    }),
    batch: vi.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
  },
  Timestamp: { fromDate: vi.fn((d: Date) => d) },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("../lib/email", () => ({
  sendRatingPrompt: mockSendRatingPrompt,
}));

vi.mock("../lib/sentry", () => ({ captureError: mockCaptureError }));

vi.mock("date-fns", () => ({
  subMinutes: vi.fn((d: Date, m: number) => new Date(d.getTime() - m * 60000)),
}));

import { triggerRatingPrompts } from "./triggerRatingPrompts";
const handler = triggerRatingPrompts as any;

describe("triggerRatingPrompts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when no matching sessions", async () => {
    mockQueryGet.mockResolvedValue({ docs: [] });
    await handler();
    expect(mockBatchCommit).toHaveBeenCalled();
    expect(mockSendRatingPrompt).not.toHaveBeenCalled();
  });

  it("marks sessions completed and sends prompts", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [{
        id: "s1",
        ref: { id: "s1" },
        data: () => ({
          tutorId: "t1", tuteeId: "te1", subject: "Math",
          tutorRated: false, tuteeRated: false,
        }),
      }],
    });
    mockUserGet.mockResolvedValue({
      exists: true,
      data: () => ({ name: "User", email: "u@school.edu" }),
    });
    await handler();
    expect(mockBatchUpdate).toHaveBeenCalled();
    expect(mockSendRatingPrompt).toHaveBeenCalledTimes(2);
  });

  it("handles email failure gracefully", async () => {
    mockQueryGet.mockResolvedValue({
      docs: [{
        id: "s1",
        ref: { id: "s1" },
        data: () => ({
          tutorId: "t1", tuteeId: "te1", subject: "Math",
          tutorRated: false, tuteeRated: false,
        }),
      }],
    });
    mockUserGet.mockResolvedValue({
      exists: true,
      data: () => ({ name: "User", email: "u@school.edu" }),
    });
    mockSendRatingPrompt.mockRejectedValueOnce(new Error("SMTP down"));
    await handler();
    expect(mockCaptureError).toHaveBeenCalled();
  });
});
