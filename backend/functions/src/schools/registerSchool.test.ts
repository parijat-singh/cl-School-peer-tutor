import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDocGet, mockDocSet, mockSendMail, mockCaptureError } = vi.hoisted(() => ({
  mockDocGet: vi.fn(), mockDocSet: vi.fn().mockResolvedValue(undefined),
  mockSendMail: vi.fn().mockResolvedValue({ messageId: "m1" }),
  mockCaptureError: vi.fn(),
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("nodemailer", () => ({
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mockDocGet, set: mockDocSet })),
    })),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("../lib/sentry", () => ({ captureError: mockCaptureError }));

import { registerSchool } from "./registerSchool";
const handler = registerSchool as any;

const validData = { name: "Test School", domain: "test.edu", adminEmail: "a@test.edu", type: "high" };

describe("registerSchool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing fields", async () => {
    await expect(handler({ data: { name: "", domain: "", adminEmail: "", type: "" } }))
      .rejects.toThrow("All fields required");
  });

  it("rejects invalid domain format", async () => {
    await expect(handler({ data: { ...validData, domain: "bad domain!" } }))
      .rejects.toThrow("Invalid domain format");
  });

  it("rejects already-registered domain", async () => {
    mockDocGet.mockResolvedValue({ exists: true });
    await expect(handler({ data: validData }))
      .rejects.toThrow("already registered");
  });

  it("creates school and sends admin notification", async () => {
    mockDocGet.mockResolvedValue({ exists: false });
    const result = await handler({ data: validData });
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mockDocSet).toHaveBeenCalledWith(expect.objectContaining({
      domain: "test.edu", approved: false,
    }));
    expect(mockSendMail).toHaveBeenCalled();
  });

  it("handles email failure gracefully", async () => {
    mockDocGet.mockResolvedValue({ exists: false });
    mockSendMail.mockRejectedValueOnce(new Error("SMTP down"));
    const result = await handler({ data: validData });
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mockCaptureError).toHaveBeenCalled();
  });
});
