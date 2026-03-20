import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockVerifGet, mockVerifDelete, mockVerifUpdate, mockUserGet, mockUserUpdate, mockSetCustomUserClaims } = vi.hoisted(() => ({
  mockVerifGet: vi.fn(), mockVerifDelete: vi.fn().mockResolvedValue(undefined),
  mockVerifUpdate: vi.fn().mockResolvedValue(undefined),
  mockUserGet: vi.fn(), mockUserUpdate: vi.fn().mockResolvedValue(undefined),
  mockSetCustomUserClaims: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: (name: string) => ({
      doc: () => ({
        get: name === "emailVerifications" ? mockVerifGet : mockUserGet,
        delete: mockVerifDelete,
        update: name === "emailVerifications" ? mockVerifUpdate : mockUserUpdate,
      }),
    }),
  },
  auth: { setCustomUserClaims: mockSetCustomUserClaims },
  Timestamp: {
    fromDate: vi.fn((d: Date) => ({ toDate: () => d })),
  },
  FieldValue: {
    serverTimestamp: vi.fn(() => "SERVER_TS"),
    increment: vi.fn((n: number) => n),
  },
}));

import { verifyEmailOtp } from "./verifyEmailOtp";
import crypto from "crypto";
const handler = verifyEmailOtp as any;

function hashOtp(uid: string, otp: string): string {
  return crypto.createHash("sha256").update(`${uid}:${otp}`).digest("hex");
}

describe("verifyEmailOtp", () => {
  beforeEach(() => {
    mockVerifGet.mockReset();
    mockVerifDelete.mockReset().mockResolvedValue(undefined);
    mockVerifUpdate.mockReset().mockResolvedValue(undefined);
    mockUserGet.mockReset();
    mockUserUpdate.mockReset().mockResolvedValue(undefined);
    mockSetCustomUserClaims.mockReset().mockResolvedValue(undefined);
  });

  it("rejects unauthenticated", async () => {
    await expect(handler({ data: { otp: "123456" } })).rejects.toThrow("Sign in required");
  });

  it("rejects invalid OTP format", async () => {
    await expect(handler({
      auth: { uid: "u1" }, data: { otp: "12" },
    })).rejects.toThrow("OTP must be 6 digits");
  });

  it("rejects when no verification exists", async () => {
    mockVerifGet.mockResolvedValue({ exists: false });
    await expect(handler({
      auth: { uid: "u1" }, data: { otp: "123456" },
    })).rejects.toThrow("No pending verification");
  });

  it("rejects expired code", async () => {
    mockVerifGet.mockResolvedValue({
      exists: true,
      data: () => ({
        expiresAt: { toDate: () => new Date(Date.now() - 60000) }, // expired
        attempts: 0,
        otpHash: "xxx",
      }),
    });
    await expect(handler({
      auth: { uid: "u1" }, data: { otp: "123456" },
    })).rejects.toThrow("Code expired");
  });

  it("rejects max attempts exceeded", async () => {
    mockVerifGet.mockResolvedValue({
      exists: true,
      data: () => ({
        expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        attempts: 5,
        otpHash: "xxx",
      }),
    });
    await expect(handler({
      auth: { uid: "u1" }, data: { otp: "123456" },
    })).rejects.toThrow("Too many attempts");
  });

  it("rejects wrong code and increments attempts", async () => {
    mockVerifGet.mockResolvedValue({
      exists: true,
      data: () => ({
        expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        attempts: 0,
        otpHash: "wrong-hash",
      }),
    });
    await expect(handler({
      auth: { uid: "u1" }, data: { otp: "123456" },
    })).rejects.toThrow("Incorrect code");
    expect(mockVerifUpdate).toHaveBeenCalled();
  });

  it("rejects wrong code on last attempt with no remaining message", async () => {
    mockVerifGet.mockResolvedValue({
      exists: true,
      data: () => ({
        expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        attempts: 4,
        otpHash: "wrong-hash",
      }),
    });
    await expect(handler({
      auth: { uid: "u1" }, data: { otp: "123456" },
    })).rejects.toThrow("Too many attempts");
  });

  it("activates user on correct OTP", async () => {
    const correctOtp = "654321";
    const hash = hashOtp("u1", correctOtp);
    mockVerifGet.mockResolvedValue({
      exists: true,
      data: () => ({
        expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        attempts: 0,
        otpHash: hash,
      }),
    });
    mockUserGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "test@school.edu", role: "tutee", schoolDomain: "school.edu" }),
    });
    const result = await handler({
      auth: { uid: "u1" }, data: { otp: correctOtp },
    });
    expect(result).toEqual({ verified: true });
    expect(mockVerifDelete).toHaveBeenCalled();
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
    expect(mockSetCustomUserClaims).toHaveBeenCalled();
  });
});
