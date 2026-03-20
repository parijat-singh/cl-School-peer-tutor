import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockUserGet: vi.fn(),
  mockTxnUpdate: vi.fn(),
  mockTxnSet: vi.fn(),
  mockAuthUpdateUser: vi.fn().mockResolvedValue(undefined),
  mockBatchUpdate: vi.fn(),
  mockBatchCommit: vi.fn().mockResolvedValue(undefined),
  mockSessionsGet: vi.fn(),
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: (name: string) => {
      if (name === "users") return { doc: () => ({ get: mocks.mockUserGet, collection: () => ({ doc: () => ({}) }) }) };
      if (name === "sessions") return { where: vi.fn().mockReturnThis(), get: mocks.mockSessionsGet };
      return { doc: () => ({ id: "doc-1" }) };
    },
    runTransaction: async (fn: any) => fn({ update: mocks.mockTxnUpdate, set: mocks.mockTxnSet }),
    batch: () => ({ update: mocks.mockBatchUpdate, commit: mocks.mockBatchCommit }),
  },
  auth: { updateUser: mocks.mockAuthUpdateUser },
  FieldValue: { serverTimestamp: () => "SERVER_TS", delete: () => "DEL" },
  Timestamp: { fromDate: (d: Date) => ({ toDate: () => d }) },
}));

vi.mock("date-fns", () => ({
  addDays: vi.fn((d: Date, n: number) => new Date(d.getTime() + n * 86400000)),
}));

import { adminSuspendUser, adminUnsuspendUser } from "./adminSuspendUser";

describe("adminSuspendUser", () => {
  beforeEach(() => {
    mocks.mockUserGet.mockReset();
    mocks.mockTxnUpdate.mockReset();
    mocks.mockTxnSet.mockReset();
    mocks.mockAuthUpdateUser.mockReset().mockResolvedValue(undefined);
    mocks.mockBatchUpdate.mockReset();
    mocks.mockBatchCommit.mockReset().mockResolvedValue(undefined);
    mocks.mockSessionsGet.mockReset().mockResolvedValue({ docs: [] });
  });

  it("rejects unauthenticated", async () => {
    await expect((adminSuspendUser as any)({ data: { targetUid: "u2", durationDays: 7, reason: "spam" } })).rejects.toThrow("Sign in");
  });

  it("rejects non-admin", async () => {
    await expect((adminSuspendUser as any)({ auth: { uid: "u1", token: { role: "tutee" } }, data: { targetUid: "u2", durationDays: 7, reason: "spam" } })).rejects.toThrow("Admins only");
  });

  it("rejects missing targetUid or reason", async () => {
    await expect((adminSuspendUser as any)({ auth: { uid: "a1", token: { role: "superadmin" } }, data: { targetUid: "", durationDays: 7, reason: "spam" } })).rejects.toThrow("targetUid and reason required");
  });

  it("rejects cross-school for schooladmin", async () => {
    mocks.mockUserGet.mockResolvedValue({ exists: true, data: () => ({ schoolDomain: "other.edu" }) });
    await expect((adminSuspendUser as any)({ auth: { uid: "a1", token: { role: "schooladmin", schoolDomain: "my.edu" } }, data: { targetUid: "u2", durationDays: 7, reason: "spam" } })).rejects.toThrow("Cross-school");
  });

  it("rejects invalid duration", async () => {
    await expect((adminSuspendUser as any)({ auth: { uid: "a1", token: { role: "superadmin" } }, data: { targetUid: "u2", durationDays: 91, reason: "spam" } })).rejects.toThrow("Duration must be 1-90");
  });

  it("rejects user not found", async () => {
    mocks.mockUserGet.mockResolvedValue({ exists: false });
    await expect((adminSuspendUser as any)({ auth: { uid: "a1", token: { role: "superadmin" } }, data: { targetUid: "u2", durationDays: 7, reason: "spam" } })).rejects.toThrow("User not found");
  });

  it("suspends user with null duration (indefinite)", async () => {
    mocks.mockUserGet.mockResolvedValue({ exists: true, data: () => ({ schoolDomain: "school.edu" }) });
    const result = await (adminSuspendUser as any)({ auth: { uid: "a1", token: { role: "superadmin", schoolDomain: "school.edu" } }, data: { targetUid: "u2", durationDays: null, reason: "spam" } });
    expect(result).toEqual({ success: true });
    expect(mocks.mockAuthUpdateUser).toHaveBeenCalledWith("u2", { disabled: true });
  });

  it("suspends user and cancels their sessions", async () => {
    mocks.mockUserGet.mockResolvedValue({ exists: true, data: () => ({ schoolDomain: "school.edu" }) });
    mocks.mockSessionsGet.mockResolvedValue({
      docs: [
        { data: () => ({ tutorId: "u2", tuteeId: "u3", slotId: "s1" }), ref: { id: "sess-1" } },
        { data: () => ({ tutorId: "u4", tuteeId: "u5", slotId: "s2" }), ref: { id: "sess-2" } },  // not involved
      ],
    });
    const result = await (adminSuspendUser as any)({ auth: { uid: "a1", token: { role: "superadmin", schoolDomain: "school.edu" } }, data: { targetUid: "u2", durationDays: 7, reason: "spam" } });
    expect(result).toEqual({ success: true });
    expect(mocks.mockBatchUpdate).toHaveBeenCalled();
  });
});

describe("adminUnsuspendUser", () => {
  beforeEach(() => {
    mocks.mockUserGet.mockReset();
    mocks.mockTxnUpdate.mockReset();
    mocks.mockTxnSet.mockReset();
    mocks.mockAuthUpdateUser.mockReset().mockResolvedValue(undefined);
  });

  it("rejects unauthenticated", async () => {
    await expect((adminUnsuspendUser as any)({ data: { targetUid: "u2" } })).rejects.toThrow("Sign in");
  });

  it("rejects non-admin", async () => {
    await expect((adminUnsuspendUser as any)({ auth: { uid: "u1", token: { role: "tutee" } }, data: { targetUid: "u2" } })).rejects.toThrow("Admins only");
  });

  it("rejects cross-school for schooladmin", async () => {
    mocks.mockUserGet.mockResolvedValue({ exists: true, data: () => ({ schoolDomain: "other.edu" }) });
    await expect((adminUnsuspendUser as any)({ auth: { uid: "a1", token: { role: "schooladmin", schoolDomain: "my.edu" } }, data: { targetUid: "u2" } })).rejects.toThrow("Cross-school");
  });

  it("unsuspends user on happy path", async () => {
    mocks.mockUserGet.mockResolvedValue({ exists: true, data: () => ({ schoolDomain: "school.edu" }) });
    const result = await (adminUnsuspendUser as any)({ auth: { uid: "a1", token: { role: "superadmin", schoolDomain: "school.edu" } }, data: { targetUid: "u2" } });
    expect(result).toEqual({ success: true });
    expect(mocks.mockAuthUpdateUser).toHaveBeenCalledWith("u2", { disabled: false });
  });
});
