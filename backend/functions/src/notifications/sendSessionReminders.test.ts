import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryGet, mockUserGet, mockSendReminderEmail, mockCaptureError } = vi.hoisted(() => ({
  mockQueryGet: vi.fn(), mockUserGet: vi.fn(),
  mockSendReminderEmail: vi.fn().mockResolvedValue(undefined),
  mockCaptureError: vi.fn(),
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: vi.fn((_opts: any, handler: any) => handler),
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "users") return {
        doc: vi.fn(() => ({ get: mockUserGet })),
      };
      return {
        where: vi.fn().mockReturnThis(),
        get: mockQueryGet,
      };
    }),
  },
  Timestamp: { fromDate: vi.fn((d: Date) => d) },
}));

vi.mock("../lib/email", () => ({
  sendReminderEmail: mockSendReminderEmail,
}));

vi.mock("../lib/sentry", () => ({ captureError: mockCaptureError }));

vi.mock("date-fns", () => ({
  addHours: vi.fn((d: Date, h: number) => new Date(d.getTime() + h * 3600000)),
}));

import { sendSessionReminders } from "./sendSessionReminders";
const handler = sendSessionReminders as any;

describe("sendSessionReminders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when no upcoming sessions", async () => {
    mockQueryGet.mockResolvedValue({ docs: [] });
    await handler();
    expect(mockSendReminderEmail).not.toHaveBeenCalled();
  });

  it("sends reminders for matching sessions", async () => {
    mockQueryGet.mockResolvedValueOnce({
      docs: [{
        id: "s1",
        data: () => ({
          tutorId: "t1", tuteeId: "te1", subject: "Math",
          startTime: "10:00", scheduledDate: { toDate: () => new Date() },
          meetLink: "https://meet.google.com/test",
        }),
      }],
    }).mockResolvedValue({ docs: [] }); // second window

    mockUserGet.mockResolvedValue({
      exists: true,
      data: () => ({ name: "User", email: "u@school.edu" }),
    });

    await handler();
    expect(mockSendReminderEmail).toHaveBeenCalledTimes(2); // tutor + tutee
  });

  it("handles email failure gracefully", async () => {
    mockQueryGet.mockResolvedValueOnce({
      docs: [{
        id: "s1",
        data: () => ({
          tutorId: "t1", tuteeId: "te1", subject: "Math",
          startTime: "10:00", scheduledDate: { toDate: () => new Date() },
          meetLink: null,
        }),
      }],
    }).mockResolvedValue({ docs: [] });

    mockUserGet.mockResolvedValue({
      exists: true,
      data: () => ({ name: "User", email: "u@school.edu" }),
    });
    mockSendReminderEmail.mockRejectedValueOnce(new Error("SMTP down"));

    await handler();
    expect(mockCaptureError).toHaveBeenCalled();
  });
});
