import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDocGet = vi.fn();
const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockCollectionAdd = vi.fn().mockResolvedValue({ id: "audit-1" });

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "schools") return { doc: vi.fn(() => ({ get: mockDocGet, set: mockDocSet })) };
      return { add: mockCollectionAdd };
    }),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

import { addSchool } from "./addSchool";
const handler = addSchool as any;

const validData = {
  domain: "newschool.edu", name: "New School", type: "high",
  adminEmail: "admin@newschool.edu", campus: "Main", address: "123 St", location: "NY",
};

describe("addSchool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    await expect(handler({ data: validData })).rejects.toThrow("Must be signed in");
  });

  it("rejects non-superadmin callers", async () => {
    await expect(handler({
      auth: { uid: "u1", token: { role: "schooladmin" } },
      data: validData,
    })).rejects.toThrow("Only super admins");
  });

  it("rejects when domain already exists", async () => {
    mockDocGet.mockResolvedValue({ exists: true });
    await expect(handler({
      auth: { uid: "u1", token: { role: "superadmin" } },
      data: validData,
    })).rejects.toThrow("already registered");
  });

  it("creates school and writes audit log", async () => {
    mockDocGet.mockResolvedValue({ exists: false });
    const result = await handler({
      auth: { uid: "u1", token: { role: "superadmin" } },
      data: validData,
    });
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mockDocSet).toHaveBeenCalledWith(expect.objectContaining({
      domain: "newschool.edu", name: "New School", approved: true,
    }));
    expect(mockCollectionAdd).toHaveBeenCalledWith(expect.objectContaining({
      action: "add_school",
    }));
  });
});
