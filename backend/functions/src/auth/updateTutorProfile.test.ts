import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUpdate, mockDoc, mockCollection } = vi.hoisted(() => {
  const mockUpdate = vi.fn().mockResolvedValue(undefined);
  const mockDoc = vi.fn(() => ({ update: mockUpdate }));
  const mockCollection = vi.fn(() => ({ doc: mockDoc }));
  return { mockUpdate, mockDoc, mockCollection };
});

vi.mock("../lib/admin", () => ({
  db: { collection: mockCollection },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

import { updateTutorProfile } from "./updateTutorProfile";
const handler = updateTutorProfile as any;

describe("updateTutorProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    await expect(handler({ data: {} })).rejects.toThrow("Sign in required");
  });

  it("rejects empty subjects array", async () => {
    await expect(handler({
      auth: { uid: "u1" },
      data: { subjects: [], bio: "" },
    })).rejects.toThrow("At least one subject required");
  });

  it("rejects bio over 280 characters", async () => {
    await expect(handler({
      auth: { uid: "u1" },
      data: { subjects: ["Math"], bio: "x".repeat(281) },
    })).rejects.toThrow("Bio max 280 characters");
  });

  it("updates Firestore on valid input", async () => {
    const result = await handler({
      auth: { uid: "u1" },
      data: { subjects: ["Math", "Physics"], bio: "I teach well" },
    });
    expect(result).toEqual({ success: true });
    expect(mockCollection).toHaveBeenCalledWith("users");
    expect(mockDoc).toHaveBeenCalledWith("u1");
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      subjects: ["Math", "Physics"],
      bio: "I teach well",
    }));
  });
});
