import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSessionGet = vi.fn();
const mockSessionUpdate = vi.fn();
const mockTutorGet = vi.fn();
const mockTutorUpdate = vi.fn().mockResolvedValue(undefined);
const mockReviewSet = vi.fn();
const mockTxnSet = vi.fn();
const mockTxnUpdate = vi.fn();

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "sessions") return {
        doc: vi.fn(() => ({ get: mockSessionGet, update: mockSessionUpdate })),
      };
      if (name === "reviews") return {
        doc: vi.fn(() => ({ id: "review-1", set: mockReviewSet })),
      };
      if (name === "users") return {
        doc: vi.fn(() => ({ get: mockTutorGet, update: mockTutorUpdate })),
      };
      return { doc: vi.fn(() => ({ set: vi.fn() })) };
    }),
    runTransaction: vi.fn(async (fn: any) => fn({ set: mockTxnSet, update: mockTxnUpdate })),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

import { submitRating } from "./submitRating";
const handler = submitRating as any;

const sessionData = {
  tutorId: "tutor-1", tuteeId: "tutee-1",
  tutorName: "Tutor", tuteeName: "Tutee",
  tutorRated: false, tuteeRated: false,
  schoolDomain: "school.edu",
};

describe("submitRating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    await expect(handler({ data: { sessionId: "s1", stars: 5 } }))
      .rejects.toThrow("Sign in required");
  });

  it("rejects invalid stars", async () => {
    await expect(handler({
      auth: { uid: "tutee-1" },
      data: { sessionId: "s1", stars: 0 },
    })).rejects.toThrow("Invalid rating data");
  });

  it("rejects non-participant", async () => {
    mockSessionGet.mockResolvedValue({ exists: true, data: () => sessionData });
    await expect(handler({
      auth: { uid: "outsider" },
      data: { sessionId: "s1", stars: 5 },
    })).rejects.toThrow("Not a participant");
  });

  it("rejects already-rated tutee", async () => {
    mockSessionGet.mockResolvedValue({
      exists: true, data: () => ({ ...sessionData, tuteeRated: true }),
    });
    await expect(handler({
      auth: { uid: "tutee-1" },
      data: { sessionId: "s1", stars: 4 },
    })).rejects.toThrow("Already rated");
  });

  it("creates review and updates avg rating on happy path", async () => {
    mockSessionGet.mockResolvedValue({ exists: true, data: () => sessionData });
    mockTutorGet.mockResolvedValue({
      exists: true, data: () => ({ avgRating: 4.0, reviewCount: 5 }),
    });
    const result = await handler({
      auth: { uid: "tutee-1" },
      data: { sessionId: "s1", stars: 5, text: "Great!" },
    });
    expect(result).toEqual({ success: true });
    expect(mockTxnSet).toHaveBeenCalled();
    expect(mockTxnUpdate).toHaveBeenCalled();
    expect(mockTutorUpdate).toHaveBeenCalledWith(expect.objectContaining({
      reviewCount: 6,
    }));
  });
});
