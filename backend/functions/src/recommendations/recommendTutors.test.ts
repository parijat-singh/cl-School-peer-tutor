import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReviewsGet = vi.fn();

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: mockReviewsGet,
    })),
  },
}));

vi.mock("../lib/runtime", () => ({ shouldEnforceAppCheck: false }));
vi.mock("../lib/sentry", () => ({ captureError: vi.fn() }));

import { recommendTutors } from "./recommendTutors";
const handler = recommendTutors as any;

const tutor1 = { uid: "t1", name: "Tutor1", grade: "11", subjects: ["Math"], bio: "Good", avgRating: 4.5, reviewCount: 10, slotCount: 3, hasRecurringSlots: true, hasDateSlots: false };
const tutor2 = { uid: "t2", name: "Tutor2", grade: "12", subjects: ["Science"], bio: "Great", avgRating: 3.5, reviewCount: 5, slotCount: 1, hasRecurringSlots: false, hasDateSlots: true };

describe("recommendTutors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReviewsGet.mockResolvedValue({ docs: [] });
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("rejects unauthenticated", async () => {
    await expect(handler({ data: { tutors: [] } })).rejects.toThrow("Sign in");
  });

  it("returns single tutor without AI", async () => {
    const result = await handler({
      auth: { uid: "u1" },
      data: { tutors: [tutor1] },
    });
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].uid).toBe("t1");
    expect(result.ranked[0].score).toBe(100);
  });

  it("falls back to rating sort when no API key", async () => {
    const result = await handler({
      auth: { uid: "u1" },
      data: { tutors: [tutor1, tutor2], searchSubject: "Math" },
    });
    expect(result.ranked).toHaveLength(2);
    expect(result.aiPowered).toBe(false);
    // tutor1 should rank higher (better rating + more reviews)
    expect(result.ranked[0].uid).toBe("t1");
  });

  it("falls back on API error", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const result = await handler({
      auth: { uid: "u1" },
      data: { tutors: [tutor1, tutor2] },
    });
    expect(result.aiPowered).toBe(false);
    expect(result.ranked).toHaveLength(2);
    globalThis.fetch = originalFetch;
  });

  it("returns AI-powered rankings on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify([
          { uid: "t2", score: 90, reason: "Great at science" },
          { uid: "t1", score: 80, reason: "Good at math" },
        ]) }],
      }),
    });
    const result = await handler({
      auth: { uid: "u1" },
      data: { tutors: [tutor1, tutor2] },
    });
    expect(result.aiPowered).toBe(true);
    expect(result.ranked[0].uid).toBe("t2");
    globalThis.fetch = originalFetch;
  });
});
