import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockSchoolGet: vi.fn(),
  mockUserGet: vi.fn(),
  mockUserSet: vi.fn().mockResolvedValue(undefined),
  mockCognitoUpdate: vi.fn().mockResolvedValue(undefined),
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
      if (name === "schools") return { doc: () => ({ get: mocks.mockSchoolGet }) };
      if (name === "users") return { doc: () => ({ get: mocks.mockUserGet, set: mocks.mockUserSet }) };
      return { doc: () => ({}) };
    },
  },
  FieldValue: { serverTimestamp: () => "SERVER_TS" },
}));

vi.mock("../lib/cognitoAuth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    uid: "cognito-sub-123",
    email: "test@school.edu",
    token: { role: "tutee", schoolDomain: null, status: "active" },
  }),
}));

vi.mock("../lib/cognitoAdmin", () => ({
  cognitoUpdateAttributes: mocks.mockCognitoUpdate,
}));

import { initializeUser } from "./initializeUser";

describe("initializeUser", () => {
  beforeEach(() => {
    mocks.mockSchoolGet.mockReset();
    mocks.mockUserGet.mockReset();
    mocks.mockUserSet.mockReset().mockResolvedValue(undefined);
    mocks.mockCognitoUpdate.mockReset().mockResolvedValue(undefined);
  });

  it("rejects invalid input", async () => {
    await expect(
      (initializeUser as any)({ auth: { uid: "u1", token: {} }, data: {} }),
    ).rejects.toThrow();
  });

  it("rejects unapproved school", async () => {
    mocks.mockSchoolGet.mockResolvedValue({ exists: true, data: () => ({ approved: false }) });
    mocks.mockUserGet.mockResolvedValue({ exists: false });

    await expect(
      (initializeUser as any)({
        auth: { uid: "u1", token: {} },
        data: { name: "Test", role: "tutee", schoolDomain: "bad.edu" },
      }),
    ).rejects.toThrow("School is not approved");
  });

  it("rejects if user already initialized", async () => {
    mocks.mockSchoolGet.mockResolvedValue({ exists: true, data: () => ({ approved: true }) });
    mocks.mockUserGet.mockResolvedValue({ exists: true });

    await expect(
      (initializeUser as any)({
        auth: { uid: "u1", token: {} },
        data: { name: "Test", role: "tutee", schoolDomain: "school.edu" },
      }),
    ).rejects.toThrow("already initialized");
  });

  it("creates user doc and sets Cognito attributes on happy path", async () => {
    mocks.mockSchoolGet.mockResolvedValue({ exists: true, data: () => ({ approved: true }) });
    mocks.mockUserGet.mockResolvedValue({ exists: false });

    const result = await (initializeUser as any)({
      auth: { uid: "u1", token: {} },
      data: { name: "Test User", role: "tutor", schoolDomain: "school.edu", subjects: ["math"] },
    });

    expect(result).toEqual({ success: true });
    expect(mocks.mockUserSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test User",
        role: "tutor",
        schoolDomain: "school.edu",
        status: "active",
        subjects: ["math"],
      }),
    );
    expect(mocks.mockCognitoUpdate).toHaveBeenCalledWith("cognito-sub-123", {
      "custom:role": "tutor",
      "custom:schoolDomain": "school.edu",
      "custom:status": "active",
    });
  });
});
