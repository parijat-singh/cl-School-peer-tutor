import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDocGet = vi.fn();
const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
const mockCollectionAdd = vi.fn().mockResolvedValue({ id: "audit-1" });

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: mockDocGet,
      update: mockDocUpdate,
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

import { rejectSchool } from "./rejectSchool";
const handler = rejectSchool as any;

describe("rejectSchool", () => {
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

  it("rejects when school not found", async () => {
    mockDocGet.mockResolvedValue({ exists: false });
    await expect(handler({
      auth: { uid: "u1", token: { role: "superadmin" } },
      data: { domain: "x.edu" },
    })).rejects.toThrow("School not found");
  });

  it("rejects school and writes audit log", async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ name: "Bad School" }) });
    const result = await handler({
      auth: { uid: "u1", token: { role: "superadmin" } },
      data: { domain: "bad.edu" },
    });
    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalledWith({ approved: false, status: "rejected" });
    expect(mockCollectionAdd).toHaveBeenCalledWith(expect.objectContaining({
      action: "reject_school",
      targetId: "bad.edu",
    }));
  });
});
