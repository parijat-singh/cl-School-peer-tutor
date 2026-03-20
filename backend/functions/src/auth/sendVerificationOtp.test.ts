import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockVerifGet, mockVerifSet, mockSendOtpEmail } = vi.hoisted(() => ({
  mockVerifGet: vi.fn(),
  mockVerifSet: vi.fn().mockResolvedValue(undefined),
  mockSendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mockVerifGet, set: mockVerifSet })),
    })),
  },
  Timestamp: {
    fromDate: vi.fn((d: Date) => ({
      toDate: () => d,
      toMillis: () => d.getTime(),
    })),
  },
}));

vi.mock("../lib/email", () => ({
  sendOtpEmail: mockSendOtpEmail,
}));

import { sendVerificationOtp } from "./sendVerificationOtp";
const handler = sendVerificationOtp as any;

describe("sendVerificationOtp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated", async () => {
    await expect(handler({ data: {} })).rejects.toThrow("Sign in required");
  });

  it("rejects when no email on account", async () => {
    await expect(handler({
      auth: { uid: "u1", token: {} },
      data: {},
    })).rejects.toThrow("No email on account");
  });

  it("rejects rate limit (code sent within 60s)", async () => {
    mockVerifGet.mockResolvedValue({
      exists: true,
      data: () => ({
        sentAt: { toDate: () => new Date(Date.now() - 30000) }, // 30s ago
      }),
    });
    await expect(handler({
      auth: { uid: "u1", token: { email: "test@school.edu" } },
      data: {},
    })).rejects.toThrow("Please wait");
  });

  it("stores hash and sends email on happy path", async () => {
    mockVerifGet.mockResolvedValue({ exists: false });
    const result = await handler({
      auth: { uid: "u1", token: { email: "test@school.edu" } },
      data: {},
    });
    expect(result).toEqual({ sent: true });
    expect(mockVerifSet).toHaveBeenCalledWith(expect.objectContaining({
      email: "test@school.edu",
      attempts: 0,
    }));
    expect(mockSendOtpEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "test@school.edu",
      expiresMinutes: 10,
    }));
  });
});
