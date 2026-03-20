import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDocGet = vi.fn();
const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
const mockCollectionAdd = vi.fn().mockResolvedValue({ id: "audit-1" });
const mockGetUser = vi.fn();
const mockSetCustomUserClaims = vi.fn().mockResolvedValue(undefined);

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(() => ({
    getUser: mockGetUser,
    setCustomUserClaims: mockSetCustomUserClaims,
  })),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({
    doc: vi.fn((path: string) => ({
      get: mockDocGet,
      update: mockDocUpdate,
    })),
    collection: vi.fn(() => ({
      add: mockCollectionAdd,
    })),
  })),
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

import { promoteSuperAdmin } from "./promoteSuperAdmin";
const handler = promoteSuperAdmin as any;

describe("promoteSuperAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    await expect(handler({ data: { uid: "u2" } })).rejects.toThrow("Sign in required");
  });

  it("rejects non-superadmin callers", async () => {
    await expect(handler({
      auth: { uid: "u1", token: { role: "schooladmin" } },
      data: { uid: "u2" },
    })).rejects.toThrow("Only super admins can promote");
  });

  it("rejects missing uid", async () => {
    await expect(handler({
      auth: { uid: "u1", token: { role: "superadmin" } },
      data: {},
    })).rejects.toThrow("uid required");
  });

  it("promotes user on valid request", async () => {
    mockGetUser.mockResolvedValue({ uid: "u2", email: "target@school.edu", customClaims: { role: "tutee" } });
    const result = await handler({
      auth: { uid: "u1", token: { role: "superadmin" } },
      data: { uid: "u2" },
    });
    expect(result).toEqual({ success: true });
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u2", expect.objectContaining({ role: "superadmin" }));
    expect(mockDocUpdate).toHaveBeenCalledWith({ role: "superadmin" });
    expect(mockCollectionAdd).toHaveBeenCalledWith(expect.objectContaining({
      action: "promote_superadmin",
      targetId: "u2",
    }));
  });
});
