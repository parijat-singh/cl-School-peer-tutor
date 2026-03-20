import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDocGet = vi.fn();
const mockDocDelete = vi.fn().mockResolvedValue(undefined);
const mockCollectionAdd = vi.fn().mockResolvedValue({ id: "audit-1" });

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: mockDocGet,
      delete: mockDocDelete,
    })),
    collection: vi.fn(() => ({ add: mockCollectionAdd })),
  })),
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

import { removeSchool } from "./removeSchool";
const handler = removeSchool as any;

describe("removeSchool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    await expect(handler({ data: { domain: "school.edu" } })).rejects.toThrow("Sign in required");
  });

  it("rejects non-superadmin callers", async () => {
    await expect(handler({
      auth: { uid: "u1", token: { role: "tutee" } },
      data: { domain: "school.edu" },
    })).rejects.toThrow("Only super admins");
  });

  it("removes school, writes audit log", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ name: "Old School" }) });
    const result = await handler({
      auth: { uid: "u1", token: { role: "superadmin" } },
      data: { domain: "old.edu" },
    });
    expect(result).toEqual({ success: true });
    expect(mockDocDelete).toHaveBeenCalled();
    expect(mockCollectionAdd).toHaveBeenCalledWith(expect.objectContaining({
      action: "remove_school",
      targetId: "old.edu",
    }));
  });
});
