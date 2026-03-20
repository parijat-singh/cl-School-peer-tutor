import { vi } from "vitest";

// Mock email functions
export const mockEmail = {
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
  sendReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendRatingPrompt: vi.fn().mockResolvedValue(undefined),
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
  sendBookingRequestEmail: vi.fn().mockResolvedValue(undefined),
  sendRequestRejectedEmail: vi.fn().mockResolvedValue(undefined),
};

// Mock Google Meet
export const mockGoogleMeet = {
  provisionMeetLink: vi.fn().mockResolvedValue({
    meetLink: "https://meet.google.com/test-link",
    calendarEventId: "cal-event-1",
  }),
  deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
};

// Mock rate limiter
export const mockRateLimit = {
  checkAndConsumeRateLimit: vi.fn().mockResolvedValue(true),
};

// Mock Sentry
export const mockSentry = {
  captureError: vi.fn(),
  Sentry: {
    init: vi.fn(),
    setContext: vi.fn(),
    captureException: vi.fn(),
  },
};

// Mock nodemailer
export const mockNodemailer = {
  createTransport: vi.fn(() => ({
    sendMail: vi.fn().mockResolvedValue({ messageId: "mock-msg-id" }),
  })),
};
