import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReqGet = vi.fn();
const mockReqUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("zod", async () => await vi.importActual("zod"));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ id: "req-1", get: mockReqGet, update: mockReqUpdate })),
    })),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("../lib/runtime", () => ({ shouldEnforceAppCheck: false }));

import { cancelBookingRequest } from "./cancelBookingRequest";
const handler = cancelBookingRequest as any;

describe("cancelBookingRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated", async () => {
    await expect(handler({ data: { requestId: "r1" } })).rejects.toThrow("Sign in");
  });

  it("rejects non-owner", async () => {
    mockReqGet.mockResolvedValue({ exists: true, data: () => ({ tuteeId: "other-user", status: "pending" }) });
    await expect(handler({
      auth: { uid: "not-owner" },
      data: { requestId: "r1" },
    })).rejects.toThrow("your own requests");
  });

  it("rejects non-pending request", async () => {
    mockReqGet.mockResolvedValue({ exists: true, data: () => ({ tuteeId: "u1", status: "accepted" }) });
    await expect(handler({
      auth: { uid: "u1" },
      data: { requestId: "r1" },
    })).rejects.toThrow("already accepted");
  });

  it("cancels on happy path", async () => {
    mockReqGet.mockResolvedValue({ exists: true, data: () => ({ tuteeId: "u1", status: "pending" }) });
    const result = await handler({
      auth: { uid: "u1" },
      data: { requestId: "r1" },
    });
    expect(result).toEqual({ success: true });
    expect(mockReqUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
  });
});
