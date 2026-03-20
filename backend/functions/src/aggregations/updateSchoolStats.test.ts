import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStatsSet = vi.fn().mockResolvedValue(undefined);
const mockUsersGet = vi.fn();
const mockSessionsGet = vi.fn();
const mockReviewsGet = vi.fn();

vi.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: vi.fn((_opts: any, handler: any) => handler),
}));

vi.mock("../lib/admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "stats") return {
        doc: vi.fn(() => ({ set: mockStatsSet })),
      };
      return {
        where: vi.fn().mockReturnThis(),
        get: name === "users" ? mockUsersGet : name === "sessions" ? mockSessionsGet : mockReviewsGet,
      };
    }),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
}));

vi.mock("date-fns", () => ({
  startOfMonth: vi.fn(() => new Date("2024-06-01")),
}));

import { updateSchoolStats } from "./updateSchoolStats";
const handler = updateSchoolStats as any;

describe("updateSchoolStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns early when no schoolDomain", async () => {
    await handler({ data: { after: { data: () => ({}) } } });
    expect(mockStatsSet).not.toHaveBeenCalled();
  });

  it("returns early when session is undefined", async () => {
    await handler({ data: { after: null, before: null } });
    expect(mockStatsSet).not.toHaveBeenCalled();
  });

  it("recalculates stats on happy path", async () => {
    mockUsersGet.mockResolvedValue({
      size: 10,
      docs: [
        { data: () => ({ role: "tutor", status: "active", isActive: true }) },
        { data: () => ({ role: "tutee", status: "active", isActive: true }) },
      ],
    });
    mockSessionsGet.mockResolvedValue({
      size: 5,
      docs: [
        { data: () => ({ scheduledDate: { toDate: () => new Date("2024-06-10") } }) },
      ],
    });
    mockReviewsGet.mockResolvedValue({
      size: 3,
      docs: [
        { data: () => ({ stars: 5 }) },
        { data: () => ({ stars: 4 }) },
        { data: () => ({ stars: 3 }) },
      ],
    });

    await handler({
      data: {
        after: { data: () => ({ schoolDomain: "school.edu", status: "completed", scheduledDate: { toDate: () => new Date() } }) },
        before: null,
      },
    });
    expect(mockStatsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolDomain: "school.edu",
        totalUsers: 10,
        totalSessions: 5,
      }),
      { merge: true },
    );
  });
});
