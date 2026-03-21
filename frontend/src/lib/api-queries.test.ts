import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  publicPost: vi.fn(),
  publicGet: vi.fn(),
}));

vi.mock("./api", () => ({
  api: mockApi,
}));

import {
  getUserDoc, getMe, listSuperAdmins, getSchoolUsers,
  searchTutors, getTutorSlots, getMySessions, getMyBookingRequests,
  getTutorReviews, getSchoolReviews, getSchoolDoc, listAllSchools,
  getSchoolStats, getAuditLog,
} from "./api-queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("user queries", () => {
  it("getUserDoc returns user on success", async () => {
    const user = { uid: "u1", name: "Alice" };
    mockApi.get.mockResolvedValue(user);
    expect(await getUserDoc("u1")).toEqual(user);
    expect(mockApi.get).toHaveBeenCalledWith("/users/u1");
  });

  it("getUserDoc returns null on error", async () => {
    mockApi.get.mockRejectedValue(new Error("404"));
    expect(await getUserDoc("bad")).toBeNull();
  });

  it("getMe returns user", async () => {
    mockApi.get.mockResolvedValue({ uid: "me" });
    expect(await getMe()).toEqual({ uid: "me" });
    expect(mockApi.get).toHaveBeenCalledWith("/users/me");
  });

  it("getMe returns null on error", async () => {
    mockApi.get.mockRejectedValue(new Error("unauth"));
    expect(await getMe()).toBeNull();
  });

  it("listSuperAdmins unwraps users array", async () => {
    mockApi.get.mockResolvedValue({ users: [{ uid: "sa1" }] });
    const result = await listSuperAdmins();
    expect(result).toEqual([{ uid: "sa1" }]);
    expect(mockApi.get).toHaveBeenCalledWith("/users/superadmins");
  });

  it("getSchoolUsers unwraps users array", async () => {
    mockApi.get.mockResolvedValue({ users: [{ uid: "u1" }] });
    const result = await getSchoolUsers("x.edu");
    expect(result).toEqual([{ uid: "u1" }]);
    expect(mockApi.get).toHaveBeenCalledWith("/schools/x.edu/users");
  });
});

describe("tutor search", () => {
  it("searchTutors with all params", async () => {
    mockApi.get.mockResolvedValue({ tutors: [{ uid: "t1" }] });
    const result = await searchTutors({ schoolDomain: "x.edu", subject: "Math", day: "Monday", date: "2026-04-01" });
    expect(result).toEqual([{ uid: "t1" }]);
    const url = mockApi.get.mock.calls[0][0] as string;
    expect(url).toContain("/schools/x.edu/tutors?");
    expect(url).toContain("subject=Math");
    expect(url).toContain("day=Monday");
    expect(url).toContain("date=2026-04-01");
  });

  it("searchTutors with only schoolDomain", async () => {
    mockApi.get.mockResolvedValue({ tutors: [] });
    await searchTutors({ schoolDomain: "y.edu" });
    const url = mockApi.get.mock.calls[0][0] as string;
    expect(url).toContain("schoolDomain=y.edu");
    expect(url).not.toContain("subject=");
  });
});

describe("availability", () => {
  it("getTutorSlots unwraps slots", async () => {
    mockApi.get.mockResolvedValue({ slots: [{ slotId: "s1" }] });
    const result = await getTutorSlots("t1");
    expect(result).toEqual([{ slotId: "s1" }]);
    expect(mockApi.get).toHaveBeenCalledWith("/tutors/t1/slots");
  });
});

describe("sessions", () => {
  it("getMySessions unwraps sessions", async () => {
    mockApi.get.mockResolvedValue({ sessions: [{ sessionId: "ses1" }] });
    const result = await getMySessions("tutor");
    expect(result).toEqual([{ sessionId: "ses1" }]);
    expect(mockApi.get).toHaveBeenCalledWith("/sessions/mine?role=tutor");
  });
});

describe("booking requests", () => {
  it("getMyBookingRequests unwraps requests", async () => {
    mockApi.get.mockResolvedValue({ requests: [{ requestId: "r1" }] });
    const result = await getMyBookingRequests("tutee");
    expect(result).toEqual([{ requestId: "r1" }]);
    expect(mockApi.get).toHaveBeenCalledWith("/booking-requests/mine?role=tutee");
  });
});

describe("reviews", () => {
  it("getTutorReviews unwraps reviews", async () => {
    mockApi.get.mockResolvedValue({ reviews: [{ reviewId: "rv1" }] });
    const result = await getTutorReviews("t1");
    expect(result).toEqual([{ reviewId: "rv1" }]);
    expect(mockApi.get).toHaveBeenCalledWith("/tutors/t1/reviews");
  });

  it("getSchoolReviews unwraps reviews", async () => {
    mockApi.get.mockResolvedValue({ reviews: [] });
    const result = await getSchoolReviews("x.edu");
    expect(result).toEqual([]);
    expect(mockApi.get).toHaveBeenCalledWith("/reviews/school/x.edu");
  });
});

describe("schools", () => {
  it("getSchoolDoc returns school on success", async () => {
    mockApi.get.mockResolvedValue({ domain: "x.edu", name: "X" });
    expect(await getSchoolDoc("x.edu")).toEqual({ domain: "x.edu", name: "X" });
  });

  it("getSchoolDoc returns null on error", async () => {
    mockApi.get.mockRejectedValue(new Error("404"));
    expect(await getSchoolDoc("bad.edu")).toBeNull();
  });

  it("listAllSchools unwraps schools", async () => {
    mockApi.get.mockResolvedValue({ schools: [{ domain: "x.edu" }] });
    const result = await listAllSchools();
    expect(result).toEqual([{ domain: "x.edu" }]);
    expect(mockApi.get).toHaveBeenCalledWith("/schools");
  });
});

describe("stats", () => {
  it("getSchoolStats returns stats on success", async () => {
    mockApi.get.mockResolvedValue({ totalSessions: 10 });
    expect(await getSchoolStats("x.edu")).toEqual({ totalSessions: 10 });
  });

  it("getSchoolStats returns null on error", async () => {
    mockApi.get.mockRejectedValue(new Error("404"));
    expect(await getSchoolStats("bad.edu")).toBeNull();
  });
});

describe("audit log", () => {
  it("getAuditLog unwraps entries", async () => {
    mockApi.get.mockResolvedValue({ entries: [{ action: "suspend" }] });
    const result = await getAuditLog("x.edu");
    expect(result).toEqual([{ action: "suspend" }]);
    expect(mockApi.get).toHaveBeenCalledWith("/audit-log/x.edu");
  });
});
