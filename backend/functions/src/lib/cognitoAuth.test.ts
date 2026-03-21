import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockVerify: vi.fn(),
}));

vi.mock("jsonwebtoken", () => ({
  default: { verify: mocks.mockVerify },
  verify: mocks.mockVerify,
}));

vi.mock("jwks-rsa", () => ({
  default: () => ({
    getSigningKey: (_kid: string, cb: any) => cb(null, { getPublicKey: () => "fake-key" }),
  }),
}));

vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "HttpsError";
    }
  },
}));

import { requireAuth, verifyCognitoToken } from "./cognitoAuth";

describe("requireAuth", () => {
  beforeEach(() => {
    mocks.mockVerify.mockReset();
  });

  it("returns Firebase auth claims when request.auth exists", async () => {
    const result = await requireAuth({
      auth: {
        uid: "firebase-uid",
        token: { role: "tutor", schoolDomain: "test.edu", status: "active", email: "a@test.edu" },
      },
    });

    expect(result).toEqual({
      uid: "firebase-uid",
      email: "a@test.edu",
      token: { role: "tutor", schoolDomain: "test.edu", status: "active" },
    });
    expect(mocks.mockVerify).not.toHaveBeenCalled();
  });

  it("falls back to Cognito JWT when no request.auth", async () => {
    mocks.mockVerify.mockImplementation((_token: string, _keyFn: any, _opts: any, cb: any) => {
      cb(null, {
        sub: "cognito-sub-123",
        email: "b@test.edu",
        "custom:role": "tutee",
        "custom:schoolDomain": "test.edu",
        "custom:status": "active",
      });
    });

    const result = await requireAuth({
      rawRequest: { headers: { authorization: "Bearer some-jwt-token" } },
    });

    expect(result).toEqual({
      uid: "cognito-sub-123",
      email: "b@test.edu",
      token: { role: "tutee", schoolDomain: "test.edu", status: "active" },
    });
  });

  it("throws unauthenticated when no auth and no token", async () => {
    await expect(requireAuth({})).rejects.toThrow("Sign in required.");
  });

  it("throws unauthenticated when Cognito token is invalid", async () => {
    mocks.mockVerify.mockImplementation((_token: string, _keyFn: any, _opts: any, cb: any) => {
      cb(new Error("jwt expired"));
    });

    await expect(
      requireAuth({ rawRequest: { headers: { authorization: "Bearer expired-token" } } }),
    ).rejects.toThrow("Invalid or expired token.");
  });

  it("defaults missing claims to safe values", async () => {
    const result = await requireAuth({
      auth: { uid: "u1", token: {} },
    });

    expect(result.token).toEqual({ role: "tutee", schoolDomain: null, status: "active" });
    expect(result.email).toBe("");
  });
});

describe("verifyCognitoToken", () => {
  beforeEach(() => {
    mocks.mockVerify.mockReset();
  });

  it("resolves with normalized claims on valid token", async () => {
    mocks.mockVerify.mockImplementation((_token: string, _keyFn: any, _opts: any, cb: any) => {
      cb(null, {
        sub: "sub-456",
        email: "c@school.edu",
        "custom:role": "schooladmin",
        "custom:schoolDomain": "school.edu",
        "custom:status": "active",
      });
    });

    const result = await verifyCognitoToken("valid-token");
    expect(result.uid).toBe("sub-456");
    expect(result.token.role).toBe("schooladmin");
  });

  it("rejects on verification error", async () => {
    mocks.mockVerify.mockImplementation((_token: string, _keyFn: any, _opts: any, cb: any) => {
      cb(new Error("invalid signature"));
    });

    await expect(verifyCognitoToken("bad-token")).rejects.toThrow("invalid signature");
  });
});
