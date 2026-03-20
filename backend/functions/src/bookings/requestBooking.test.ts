import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUserGet, mockSlotGet, mockQueryGet, mockDocSet } = vi.hoisted(() => ({
  mockUserGet: vi.fn(), mockSlotGet: vi.fn(),
  mockQueryGet: vi.fn(), mockDocSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("zod", async () => await vi.importActual("zod"));

vi.mock("../lib/admin", () => {
  const bookingRequestsChain = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: mockQueryGet,
  };

  return {
    db: {
      collection: (name: string) => {
        if (name === "users") return {
          doc: () => ({
            get: mockUserGet,
            collection: () => ({
              doc: () => ({ get: mockSlotGet }),
            }),
          }),
        };
        if (name === "bookingRequests") return {
          ...bookingRequestsChain,
          doc: () => ({ id: "req-auto", set: mockDocSet }),
        };
        return { doc: () => ({ set: vi.fn() }) };
      },
    },
    FieldValue: { serverTimestamp: () => "SERVER_TS" },
    Timestamp: { fromDate: (d: Date) => d },
  };
});

vi.mock("../lib/email", () => ({
  sendBookingRequestEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sentry", () => ({
  captureError: vi.fn(),
}));

vi.mock("../lib/runtime", () => ({ shouldEnforceAppCheck: false }));

import { requestBooking } from "./requestBooking";
import { sendBookingRequestEmail } from "../lib/email";
const handler = requestBooking as any;

const tuteeSnap = { exists: true, data: () => ({ name: "Tutee", email: "t@school.edu", schoolDomain: "school.edu", status: "active" }) };
const tutorSnap = { exists: true, data: () => ({ name: "Tutor", email: "tutor@school.edu", schoolDomain: "school.edu" }) };
const slotData = { day: "Mon", startTime: "10:00", endTime: "11:00", duration: 60, booked: false, recurring: false };
const validData = { tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2024-06-15" };

function setupUsers(tutee = tuteeSnap, tutor = tutorSnap) {
  mockUserGet
    .mockResolvedValueOnce(tutee)
    .mockResolvedValueOnce(tutor);
}

describe("requestBooking", () => {
  beforeEach(() => {
    mockUserGet.mockReset();
    mockSlotGet.mockReset();
    mockQueryGet.mockReset();
    mockDocSet.mockClear();
    mockQueryGet.mockResolvedValue({ empty: true, docs: [] });
    mockSlotGet.mockResolvedValue({ exists: true, data: () => slotData });
  });

  it("rejects unauthenticated", async () => {
    await expect(handler({ data: validData })).rejects.toThrow("Sign in");
  });

  it("rejects cross-school", async () => {
    setupUsers(tuteeSnap, {
      exists: true,
      data: () => ({ name: "Tutor", email: "tutor@other.edu", schoolDomain: "other.edu" }),
    });
    await expect(handler({ auth: { uid: "u1" }, data: validData }))
      .rejects.toThrow("different school");
  });

  it("rejects already-booked one-off slot", async () => {
    setupUsers();
    mockSlotGet.mockResolvedValue({ exists: true, data: () => ({ ...slotData, booked: true }) });
    await expect(handler({ auth: { uid: "u1" }, data: validData }))
      .rejects.toThrow("already been booked");
  });

  it("rejects duplicate pending request", async () => {
    setupUsers();
    mockQueryGet.mockResolvedValue({ empty: false, docs: [{ id: "dup" }] });
    await expect(handler({ auth: { uid: "u1" }, data: validData }))
      .rejects.toThrow("already have a pending request");
  });

  it("creates request on happy path", async () => {
    setupUsers();
    const result = await handler({ auth: { uid: "u1" }, data: validData });
    expect(result).toHaveProperty("requestId");
    expect(mockDocSet).toHaveBeenCalledWith(expect.objectContaining({ subject: "Math", status: "pending" }));
  });

  it("handles email failure gracefully", async () => {
    setupUsers();
    vi.mocked(sendBookingRequestEmail).mockRejectedValueOnce(new Error("SMTP down"));
    const result = await handler({ auth: { uid: "u1" }, data: validData });
    expect(result).toHaveProperty("requestId");
  });
});
