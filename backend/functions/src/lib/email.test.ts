import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendMail } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: "m1" });
  return { mockSendMail };
});

vi.mock("nodemailer", () => ({
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
}));

import {
  sendBookingConfirmation, sendCancellationEmail,
  sendReminderEmail, sendRatingPrompt, sendOtpEmail,
} from "./email";

describe("email module", () => {
  beforeEach(() => mockSendMail.mockClear());

  it("sendBookingConfirmation sends 2 emails", async () => {
    await sendBookingConfirmation({
      tutorEmail: "tutor@school.edu", tutorName: "Tutor",
      tuteeEmail: "tutee@school.edu", tuteeName: "Tutee",
      subject: "Math", day: "Monday", startTime: "10:00", endTime: "11:00",
      duration: 60, scheduledDate: "Saturday, June 15, 2024",
      meetLink: "https://meet.google.com/test", sessionId: "s1",
    });
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it("sendCancellationEmail sends 1 email", async () => {
    await sendCancellationEmail({
      recipientEmail: "u@school.edu", recipientName: "User",
      otherPartyName: "Other", subject: "Math",
      scheduledDate: "2024-06-15", cancelledBy: "tutor",
    });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it("sendReminderEmail sends 1 email", async () => {
    await sendReminderEmail({
      recipientEmail: "u@school.edu", recipientName: "User",
      otherPartyName: "Other", subject: "Math",
      startTime: "10:00", scheduledDate: "2024-06-15",
      meetLink: null, hoursUntil: 24,
    });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it("sendRatingPrompt sends 1 email", async () => {
    await sendRatingPrompt({
      recipientEmail: "u@school.edu", recipientName: "User",
      otherPartyName: "Other", sessionId: "s1", subject: "Math",
    });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it("sendOtpEmail sends 1 email", async () => {
    await sendOtpEmail({ to: "user@school.edu", otp: "123456", expiresMinutes: 10 });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe("user@school.edu");
  });
});
