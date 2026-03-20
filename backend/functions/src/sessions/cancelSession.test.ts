import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSessionGet, mockTxnUpdate, mockUserGet, mockDeleteCalendarEvent, mockSendCancellationEmail, mockCaptureError } = vi.hoisted(() => ({
  mockSessionGet: vi.fn(), mockTxnUpdate: vi.fn(), mockUserGet: vi.fn(),
  mockDeleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
  mockSendCancellationEmail: vi.fn().mockResolvedValue(undefined),
  mockCaptureError: vi.fn(),
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({
        get: name === "sessions" ? mockSessionGet : mockUserGet,
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({ id: "slot-1" })),
        })),
      })),
    })),
    runTransaction: vi.fn(async (fn: any) => fn({ update: mockTxnUpdate })),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS"), delete: vi.fn(() => "DEL") },
}));

vi.mock("../lib/email", () => ({
  sendCancellationEmail: mockSendCancellationEmail,
}));

vi.mock("../lib/googleMeet", () => ({
  deleteCalendarEvent: mockDeleteCalendarEvent,
}));

vi.mock("../lib/sentry", () => ({
  captureError: mockCaptureError,
}));

vi.mock("date-fns", () => ({
  format: vi.fn(() => "Saturday, June 15, 2024"),
}));

import { cancelSession } from "./cancelSession";
const handler = cancelSession as any;

const sessionData = {
  tutorId: "tutor-1", tuteeId: "tutee-1", slotId: "slot-1",
  subject: "Math", status: "upcoming", calendarEventId: "cal-1",
  scheduledDate: { toDate: () => new Date("2024-06-15T12:00:00Z") },
  schoolDomain: "school.edu",
};

describe("cancelSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserGet.mockResolvedValue({ exists: true, data: () => ({ name: "User", email: "u@school.edu" }) });
  });

  it("rejects unauthenticated", async () => {
    await expect(handler({ data: { sessionId: "s1" } })).rejects.toThrow("Sign in");
  });

  it("rejects session not found", async () => {
    mockSessionGet.mockResolvedValue({ exists: false });
    await expect(handler({
      auth: { uid: "u1" }, data: { sessionId: "s1" },
    })).rejects.toThrow("Session not found");
  });

  it("rejects non-participant", async () => {
    mockSessionGet.mockResolvedValue({ exists: true, data: () => sessionData });
    await expect(handler({
      auth: { uid: "outsider" }, data: { sessionId: "s1" },
    })).rejects.toThrow("Not your session");
  });

  it("rejects non-upcoming session", async () => {
    mockSessionGet.mockResolvedValue({ exists: true, data: () => ({ ...sessionData, status: "completed" }) });
    await expect(handler({
      auth: { uid: "tutor-1" }, data: { sessionId: "s1" },
    })).rejects.toThrow("not upcoming");
  });

  it("cancels session on happy path", async () => {
    mockSessionGet.mockResolvedValue({ exists: true, data: () => sessionData });
    const result = await handler({
      auth: { uid: "tutor-1" }, data: { sessionId: "s1", reason: "conflict" },
    });
    expect(result).toEqual({ success: true });
    expect(mockTxnUpdate).toHaveBeenCalledTimes(2); // session + slot
    expect(mockDeleteCalendarEvent).toHaveBeenCalledWith("cal-1");
    expect(mockSendCancellationEmail).toHaveBeenCalled();
  });
});
