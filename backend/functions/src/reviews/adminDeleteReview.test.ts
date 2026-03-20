import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReviewGet = vi.fn();
const mockTxnDelete = vi.fn();
const mockTxnSet = vi.fn();

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: mockReviewGet,
        id: "review-1",
      })),
    })),
    runTransaction: vi.fn(async (fn: any) => fn({ delete: mockTxnDelete, set: mockTxnSet })),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

import { adminDeleteReview } from "./adminDeleteReview";
const handler = adminDeleteReview as any;

describe("adminDeleteReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    await expect(handler({
      data: { reviewId: "r1", reason: "spam" },
    })).rejects.toThrow("Sign in required");
  });

  it("rejects non-admin callers", async () => {
    await expect(handler({
      auth: { uid: "u1", token: { role: "tutee" } },
      data: { reviewId: "r1", reason: "spam" },
    })).rejects.toThrow("Admins only");
  });

  it("rejects cross-school for schooladmin", async () => {
    mockReviewGet.mockResolvedValue({
      exists: true,
      data: () => ({ schoolDomain: "other.edu", stars: 1, authorId: "a1", targetId: "t1" }),
    });
    await expect(handler({
      auth: { uid: "u1", token: { role: "schooladmin", schoolDomain: "myschool.edu" } },
      data: { reviewId: "r1", reason: "inappropriate" },
    })).rejects.toThrow("Cross-school action denied");
  });

  it("deletes review and writes audit log", async () => {
    mockReviewGet.mockResolvedValue({
      exists: true,
      data: () => ({ schoolDomain: "school.edu", stars: 1, authorId: "a1", targetId: "t1" }),
    });
    const result = await handler({
      auth: { uid: "u1", token: { role: "superadmin", schoolDomain: "school.edu" } },
      data: { reviewId: "r1", reason: "inappropriate" },
    });
    expect(result).toEqual({ success: true });
    expect(mockTxnDelete).toHaveBeenCalled();
    expect(mockTxnSet).toHaveBeenCalled();
  });
});
