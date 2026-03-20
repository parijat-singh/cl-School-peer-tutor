import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInsert, mockDelete, mockJWT } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockJWT: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: mockJWT },
    calendar: () => ({
      events: { insert: mockInsert, delete: mockDelete },
    }),
  },
}));

import { provisionMeetLink, deleteCalendarEvent } from "./googleMeet";

const meetParams = {
  sessionId: "sess-1",
  tutorEmail: "tutor@school.edu",
  tuteeEmail: "tutee@school.edu",
  subject: "Math",
  scheduledDate: "2024-06-15",
  startTime: "10:00",
  endTime: "11:00",
  tutorName: "Tutor",
  tuteeName: "Tutee",
};

describe("provisionMeetLink", () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockDelete.mockReset();
    mockJWT.mockReset();
  });

  it("returns meetLink and calendarEventId on success", async () => {
    mockInsert.mockResolvedValue({
      data: {
        id: "evt-1",
        conferenceData: {
          entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc" }],
        },
      },
    });

    const result = await provisionMeetLink(meetParams);
    expect(result.meetLink).toBe("https://meet.google.com/abc");
    expect(result.calendarEventId).toBe("evt-1");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("throws when no Meet link in response", async () => {
    mockInsert.mockResolvedValue({
      data: { id: "evt-1", conferenceData: { entryPoints: [] } },
    });

    await expect(provisionMeetLink(meetParams)).rejects.toThrow("No Meet link");
  });

  it("retries on failure and succeeds on second attempt", async () => {
    mockInsert
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce({
        data: {
          id: "evt-2",
          conferenceData: {
            entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/def" }],
          },
        },
      });

    const result = await provisionMeetLink(meetParams);
    expect(result.meetLink).toBe("https://meet.google.com/def");
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it("throws after 3 failed attempts", async () => {
    mockInsert.mockRejectedValue(new Error("persistent failure"));

    await expect(provisionMeetLink(meetParams)).rejects.toThrow("persistent failure");
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });
});

describe("deleteCalendarEvent", () => {
  beforeEach(() => {
    mockDelete.mockReset();
  });

  it("deletes the calendar event", async () => {
    mockDelete.mockResolvedValue({});
    await deleteCalendarEvent("evt-1");
    expect(mockDelete).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt-1" }));
  });
});
