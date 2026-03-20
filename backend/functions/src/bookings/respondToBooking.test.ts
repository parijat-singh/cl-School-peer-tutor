import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReqGet = vi.fn();
const mockReqUpdate = vi.fn().mockResolvedValue(undefined);
const mockTxnGet = vi.fn();
const mockTxnSet = vi.fn();
const mockTxnUpdate = vi.fn();
const mockSessionUpdate = vi.fn().mockResolvedValue(undefined);
const mockSiblingsGet = vi.fn();

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("zod", async () => await vi.importActual("zod"));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "bookingRequests") return {
        doc: vi.fn(() => ({ id: "req-1", get: mockReqGet, update: mockReqUpdate, ref: "reqRef" })),
        where: vi.fn().mockReturnThis(),
        get: mockSiblingsGet,
      };
      if (name === "users") return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({ id: "slot-1" })),
          })),
        })),
      };
      if (name === "sessions") return {
        doc: vi.fn(() => ({ id: "session-1", update: mockSessionUpdate })),
      };
      return { doc: vi.fn(() => ({ set: vi.fn() })) };
    }),
    runTransaction: vi.fn(async (fn: any) => fn({ get: mockTxnGet, set: mockTxnSet, update: mockTxnUpdate })),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
  Timestamp: { now: vi.fn(() => "NOW"), fromDate: vi.fn((d: Date) => d) },
}));

vi.mock("../lib/googleMeet", () => ({
  provisionMeetLink: vi.fn().mockResolvedValue({
    meetLink: "https://meet.google.com/test", calendarEventId: "cal-1",
  }),
}));

vi.mock("../lib/email", () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendRequestRejectedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sentry", () => ({ captureError: vi.fn() }));
vi.mock("../lib/runtime", () => ({ shouldEnforceAppCheck: false }));
vi.mock("../lib/dates", () => ({
  dateOnlyToNoonUtcDate: vi.fn(() => new Date("2024-06-15T12:00:00Z")),
  dateOnlyToTimestamp: vi.fn(() => ({ toDate: () => new Date("2024-06-15T12:00:00Z") })),
}));
vi.mock("date-fns", () => ({ format: vi.fn(() => "Saturday, June 15, 2024") }));

import { respondToBooking } from "./respondToBooking";
import { provisionMeetLink } from "../lib/googleMeet";
const handler = respondToBooking as any;

const reqData = {
  tutorId: "tutor-1", tuteeId: "tutee-1",
  tutorName: "Tutor", tuteeName: "Tutee",
  tutorEmail: "tutor@school.edu", tuteeEmail: "tutee@school.edu",
  slotId: "slot-1", subject: "Math", scheduledDate: "2024-06-15",
  day: "Monday", startTime: "10:00", endTime: "11:00", duration: 60,
  status: "pending", schoolDomain: "school.edu",
};
const slotData = { day: "Mon", startTime: "10:00", endTime: "11:00", duration: 60, recurring: false, booked: false };

describe("respondToBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReqGet.mockResolvedValue({ exists: true, data: () => reqData });
    mockSiblingsGet.mockResolvedValue({ docs: [] });
    mockTxnGet.mockImplementation(() =>
      Promise.resolve({ exists: true, data: () => ({ ...reqData }) })
    );
  });

  it("rejects unauthenticated", async () => {
    await expect(handler({ data: { requestId: "r1", action: "accept" } }))
      .rejects.toThrow("Sign in");
  });

  it("rejects non-tutor caller", async () => {
    await expect(handler({
      auth: { uid: "not-tutor" },
      data: { requestId: "r1", action: "accept" },
    })).rejects.toThrow("your own booking requests");
  });

  it("rejects non-pending request", async () => {
    mockReqGet.mockResolvedValue({ exists: true, data: () => ({ ...reqData, status: "accepted" }) });
    await expect(handler({
      auth: { uid: "tutor-1" },
      data: { requestId: "r1", action: "reject" },
    })).rejects.toThrow("already accepted");
  });

  it("handles reject action", async () => {
    const result = await handler({
      auth: { uid: "tutor-1" },
      data: { requestId: "r1", action: "reject" },
    });
    expect(result).toEqual({ success: true });
    expect(mockReqUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
  });

  it("handles accept action with Meet link", async () => {
    // Mock transaction reads
    let txnCallCount = 0;
    mockTxnGet.mockImplementation(() => {
      txnCallCount++;
      if (txnCallCount === 1) return Promise.resolve({ exists: true, data: () => reqData });
      return Promise.resolve({ exists: true, data: () => slotData });
    });
    const result = await handler({
      auth: { uid: "tutor-1" },
      data: { requestId: "r1", action: "accept" },
    });
    expect(result).toHaveProperty("sessionId");
    expect(result.meetLinkStatus).toBe("ready");
  });

  it("handles Meet failure gracefully on accept", async () => {
    let txnCallCount = 0;
    mockTxnGet.mockImplementation(() => {
      txnCallCount++;
      if (txnCallCount === 1) return Promise.resolve({ exists: true, data: () => reqData });
      return Promise.resolve({ exists: true, data: () => slotData });
    });
    vi.mocked(provisionMeetLink).mockRejectedValueOnce(new Error("API down"));
    const result = await handler({
      auth: { uid: "tutor-1" },
      data: { requestId: "r1", action: "accept" },
    });
    expect(result.meetLinkStatus).toBe("failed");
  });
});
