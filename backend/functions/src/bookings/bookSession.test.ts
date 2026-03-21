import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockSlotGet = vi.fn();
const mockTxnGet = vi.fn();
const mockTxnUpdate = vi.fn();
const mockTxnSet = vi.fn();
const mockSessionUpdate = vi.fn().mockResolvedValue(undefined);
const mockUserGet = vi.fn();

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "HttpsError"; }
  },
}));

vi.mock("zod", async () => {
  const actual = await vi.importActual("zod");
  return actual;
});

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id?: string) => ({
        id: id || "session-auto-id",
        get: name === "users" ? mockUserGet : mockSlotGet,
        update: mockSessionUpdate,
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({ get: mockSlotGet })),
        })),
      })),
    })),
    runTransaction: vi.fn(async (fn: any) => fn({
      get: mockTxnGet,
      update: mockTxnUpdate,
      set: mockTxnSet,
    })),
  },
  FieldValue: {
    serverTimestamp: vi.fn(() => "SERVER_TS"),
  },
}));

vi.mock("../lib/googleMeet", () => ({
  provisionMeetLink: vi.fn().mockResolvedValue({
    meetLink: "https://meet.google.com/test",
    calendarEventId: "cal-1",
  }),
}));

vi.mock("../lib/email", () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sentry", () => ({
  captureError: vi.fn(),
}));

vi.mock("../lib/rateLimit", () => ({
  checkAndConsumeRateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/runtime", () => ({
  shouldEnforceAppCheck: false,
}));

vi.mock("../lib/dates", () => ({
  dateOnlyToNoonUtcDate: vi.fn(() => new Date("2024-06-15T12:00:00Z")),
  dateOnlyToTimestamp: vi.fn(() => ({ toDate: () => new Date("2024-06-15T12:00:00Z") })),
}));

vi.mock("date-fns", () => ({
  format: vi.fn(() => "Saturday, June 15, 2024"),
}));

import { bookSession } from "./bookSession";
import { checkAndConsumeRateLimit } from "../lib/rateLimit";
import { provisionMeetLink } from "../lib/googleMeet";
const handler = bookSession as any;

const tuteeData = { name: "Tutee", email: "tutee@school.edu", schoolDomain: "school.edu", status: "active" };
const tutorData = { name: "Tutor", email: "tutor@school.edu", schoolDomain: "school.edu" };
const slotData = { day: "Monday", startTime: "10:00", endTime: "11:00", duration: 60, booked: false };
const validInput = { tutorId: "tutor-1", slotId: "slot-1", subject: "Math", scheduledDate: "2024-06-15" };

describe("bookSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: user docs found, same school
    mockUserGet.mockImplementation(() => Promise.resolve({
      exists: true, data: () => tuteeData,
    }));
    mockTxnGet.mockResolvedValue({ exists: true, data: () => slotData });
  });

  it("rejects unauthenticated requests", async () => {
    await expect(handler({ data: validInput })).rejects.toThrow("Sign in");
  });

  it("rejects when rate limited", async () => {
    vi.mocked(checkAndConsumeRateLimit).mockResolvedValueOnce(false);
    await expect(handler({
      auth: { uid: "u1" }, data: validInput,
    })).rejects.toThrow("Too many booking attempts");
  });

  it("rejects invalid input", async () => {
    await expect(handler({
      auth: { uid: "u1" },
      data: { ...validInput, scheduledDate: "bad-date" },
    })).rejects.toThrow("Invalid booking request");
  });

  it("rejects cross-school booking", async () => {
    let callCount = 0;
    mockUserGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ exists: true, data: () => tuteeData });
      return Promise.resolve({ exists: true, data: () => ({ ...tutorData, schoolDomain: "other.edu" }) });
    });
    await expect(handler({
      auth: { uid: "u1" }, data: validInput,
    })).rejects.toThrow("different school");
  });

  it("rejects already-booked slot", async () => {
    let callCount = 0;
    mockUserGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ exists: true, data: () => tuteeData });
      return Promise.resolve({ exists: true, data: () => tutorData });
    });
    mockTxnGet.mockResolvedValue({ exists: true, data: () => ({ ...slotData, booked: true }) });
    await expect(handler({
      auth: { uid: "u1" }, data: validInput,
    })).rejects.toThrow("just booked by someone else");
  });

  it("returns session on happy path", async () => {
    let callCount = 0;
    mockUserGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ exists: true, data: () => tuteeData });
      return Promise.resolve({ exists: true, data: () => tutorData });
    });
    const result = await handler({
      auth: { uid: "u1" }, data: validInput,
    });
    expect(result).toHaveProperty("sessionId");
    expect(result.meetLinkStatus).toBe("ready");
    expect(mockTxnSet).toHaveBeenCalled();
    expect(mockTxnUpdate).toHaveBeenCalled();
  });

  it("handles Meet provisioning failure gracefully", async () => {
    let callCount = 0;
    mockUserGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ exists: true, data: () => tuteeData });
      return Promise.resolve({ exists: true, data: () => tutorData });
    });
    vi.mocked(provisionMeetLink).mockRejectedValueOnce(new Error("Meet API down"));
    const result = await handler({
      auth: { uid: "u1" }, data: validInput,
    });
    expect(result.meetLinkStatus).toBe("failed");
    expect(result.meetLink).toBeNull();
  });
});
