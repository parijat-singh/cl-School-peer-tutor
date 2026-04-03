// Integration tests for api-functions.ts and api-queries.ts through real api.ts.
// Mocks fetch at the HTTP boundary only — no mocking of api.ts, api-queries.ts,
// or api-functions.ts. Tests URL construction, error propagation, and response unwrapping.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError, setTokenGetter } from "../lib/api";
import {
  getUserDoc,
  getMe,
  getSchoolDoc,
  getSchoolStats,
  listSuperAdmins,
  getMySessions,
  getMyBookingRequests,
  getTutorReviews,
  getSchoolReviews,
  getTutorSlots,
  listAllSchools,
  searchTutors,
  getAuditLog,
  getSchoolUsers,
} from "../lib/api-queries";
import {
  requestBooking,
  submitRating,
  registerSchool,
  submitContactForm,
  bookSession,
  cancelSession,
  addAvailability,
  deleteAvailability,
  updateAvailability,
  cancelDate,
  uncancelDate,
  flagReview,
  adminDeleteReview,
  uploadSchoolLogo,
  getLogoUploadUrl,
} from "../lib/api-functions";

// ── Setup ──────────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setTokenGetter(async () => "test-bearer-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  setTokenGetter(async () => { throw new Error("Not authenticated"); });
});

function mockOk(data: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: true,
    status,
    json: async () => data,
  });
}

function mockError(status: number, message: string, code?: string) {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: message, code }),
  });
}

// ── api-queries: null-safe getters ─────────────────────────────────────────

describe("getUserDoc", () => {
  it("returns user doc on success", async () => {
    const doc = { uid: "u1", name: "Alice", role: "tutee" };
    mockOk(doc);
    const result = await getUserDoc("u1");
    expect(result).toEqual(doc);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/users/u1"),
      expect.any(Object),
    );
  });

  it("returns null on 404 (swallows error)", async () => {
    mockError(404, "User not found.");
    const result = await getUserDoc("ghost");
    expect(result).toBeNull();
  });

  it("returns null on any error (swallows all errors)", async () => {
    mockError(500, "Internal server error");
    const result = await getUserDoc("u1");
    expect(result).toBeNull();
  });
});

describe("getSchoolDoc", () => {
  it("returns school doc on success", async () => {
    const doc = { domain: "test.edu", name: "Test School" };
    mockOk(doc);
    const result = await getSchoolDoc("test.edu");
    expect(result).toEqual(doc);
  });

  it("returns null on 404", async () => {
    mockError(404, "School not found.");
    const result = await getSchoolDoc("ghost.edu");
    expect(result).toBeNull();
  });
});

describe("getSchoolStats", () => {
  it("returns stats on success", async () => {
    const stats = { domain: "test.edu", totalSessions: 42 };
    mockOk(stats);
    const result = await getSchoolStats("test.edu");
    expect(result).toEqual(stats);
  });

  it("returns null on 404", async () => {
    mockError(404, "Not found.");
    const result = await getSchoolStats("ghost.edu");
    expect(result).toBeNull();
  });
});

// ── api-queries: throwing getters ─────────────────────────────────────────

describe("listSuperAdmins", () => {
  it("returns unwrapped users array", async () => {
    const users = [{ uid: "sa1", role: "superadmin" }];
    mockOk({ users });
    const result = await listSuperAdmins();
    expect(result).toEqual(users);
  });

  it("throws ApiError on 403", async () => {
    mockError(403, "Forbidden.", "permission-denied");
    await expect(listSuperAdmins()).rejects.toThrow(ApiError);
  });
});

describe("getMySessions", () => {
  it("returns unwrapped sessions array", async () => {
    const sessions = [{ sessionId: "s1", subject: "Math" }];
    mockOk({ sessions });
    const result = await getMySessions("tutor");
    expect(result).toEqual(sessions);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sessions/mine?role=tutor"),
      expect.any(Object),
    );
  });

  it("sends role=tutee in URL when specified", async () => {
    mockOk({ sessions: [] });
    await getMySessions("tutee");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("role=tutee"),
      expect.any(Object),
    );
  });

  it("throws ApiError on 401", async () => {
    mockError(401, "Unauthorized");
    await expect(getMySessions("tutor")).rejects.toThrow(ApiError);
  });
});

describe("getMyBookingRequests", () => {
  it("returns unwrapped requests array", async () => {
    const requests = [{ requestId: "r1" }];
    mockOk({ requests });
    const result = await getMyBookingRequests("tutee");
    expect(result).toEqual(requests);
  });
});

describe("getTutorReviews", () => {
  it("returns unwrapped reviews array", async () => {
    const reviews = [{ reviewId: "rv1", stars: 5 }];
    mockOk({ reviews });
    const result = await getTutorReviews("tutor-1");
    expect(result).toEqual(reviews);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/tutors/tutor-1/reviews"),
      expect.any(Object),
    );
  });
});

describe("getSchoolReviews", () => {
  it("returns unwrapped reviews for school domain", async () => {
    mockOk({ reviews: [] });
    await getSchoolReviews("test.edu");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/reviews/school/test.edu"),
      expect.any(Object),
    );
  });
});

describe("getTutorSlots", () => {
  it("returns unwrapped slots array", async () => {
    const slots = [{ slotId: "sl1" }];
    mockOk({ slots });
    const result = await getTutorSlots("tutor-1");
    expect(result).toEqual(slots);
  });
});

describe("listAllSchools", () => {
  it("returns unwrapped schools array", async () => {
    const schools = [{ domain: "test.edu" }];
    mockOk({ schools });
    const result = await listAllSchools();
    expect(result).toEqual(schools);
  });
});

describe("searchTutors", () => {
  it("builds correct query string with all params", async () => {
    mockOk({ tutors: [] });
    await searchTutors({ schoolDomain: "test.edu", subject: "Math", day: "Monday", date: "2026-05-01" });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("schoolDomain=test.edu");
    expect(url).toContain("subject=Math");
    expect(url).toContain("day=Monday");
    expect(url).toContain("date=2026-05-01");
  });

  it("omits optional params when not provided", async () => {
    mockOk({ tutors: [] });
    await searchTutors({ schoolDomain: "test.edu" });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain("subject=");
    expect(url).not.toContain("day=");
    expect(url).not.toContain("date=");
  });

  it("returns unwrapped tutors array", async () => {
    const tutors = [{ uid: "t1" }];
    mockOk({ tutors });
    const result = await searchTutors({ schoolDomain: "test.edu" });
    expect(result).toEqual(tutors);
  });
});

describe("getAuditLog", () => {
  it("returns unwrapped entries array", async () => {
    const entries = [{ id: "e1", action: "approve_school" }];
    mockOk({ entries });
    const result = await getAuditLog("test.edu");
    expect(result).toEqual(entries);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/audit-log/test.edu"),
      expect.any(Object),
    );
  });
});

describe("getSchoolUsers", () => {
  it("returns unwrapped users array", async () => {
    const users = [{ uid: "u1" }];
    mockOk({ users });
    const result = await getSchoolUsers("test.edu");
    expect(result).toEqual(users);
  });
});

// ── api-functions: error propagation ──────────────────────────────────────

describe("requestBooking", () => {
  it("propagates ApiError with correct statusCode and code on 409", async () => {
    mockError(409, "Slot taken", "already-exists");
    try {
      await requestBooking({ tutorId: "t1", slotId: "s1", subject: "Math", scheduledDate: "2026-05-01" });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(409);
    }
  });

  it("posts to /bookings/request with correct body", async () => {
    mockOk({ requestId: "req-1" });
    await requestBooking({ tutorId: "t1", slotId: "s1", subject: "Math", scheduledDate: "2026-05-01" });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/bookings/request");
    expect(JSON.parse(opts.body as string)).toMatchObject({ tutorId: "t1", subject: "Math" });
  });
});

describe("submitRating", () => {
  it("propagates error message from 400 response", async () => {
    mockError(400, "Invalid rating data.");
    try {
      await submitRating({ sessionId: "s1", stars: 0 as never });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("Invalid rating data.");
    }
  });
});

describe("bookSession", () => {
  it("returns sessionId, meetLink, and meetLinkStatus on success", async () => {
    mockOk({ sessionId: "sess-1", meetLink: "https://meet.google.com/abc", meetLinkStatus: "ready" });
    const result = await bookSession({ tutorId: "t1", slotId: "s1", subject: "Math", scheduledDate: "2026-05-01" });
    expect(result.sessionId).toBe("sess-1");
    expect(result.meetLink).toBe("https://meet.google.com/abc");
    expect(result.meetLinkStatus).toBe("ready");
  });
});

describe("cancelSession", () => {
  it("posts to /sessions/cancel", async () => {
    mockOk({ success: true });
    await cancelSession({ sessionId: "sess-1" });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sessions/cancel");
    expect(JSON.parse(opts.body as string)).toMatchObject({ sessionId: "sess-1" });
  });
});

// ── api-functions: public endpoints (no auth header) ──────────────────────

describe("registerSchool", () => {
  it("does NOT send Authorization header (public endpoint)", async () => {
    mockOk({ success: true });
    await registerSchool({ domain: "new.edu", name: "New School", type: "high", adminEmail: "admin@new.edu" });
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("posts to /schools/register", async () => {
    mockOk({ success: true });
    await registerSchool({ domain: "new.edu", name: "New School", type: "high", adminEmail: "admin@new.edu" });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/schools/register");
  });
});

describe("submitContactForm", () => {
  it("does NOT send Authorization header (public endpoint)", async () => {
    mockOk({ success: true });
    await submitContactForm({ name: "Alice", email: "a@b.com", message: "Hello world!", type: "contact" });
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

// ── api-functions: auth header is sent for private endpoints ───────────────

describe("auth header injection", () => {
  it("includes Bearer token in authenticated requests", async () => {
    mockOk({ success: true });
    await flagReview("rev-1");
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-bearer-token");
  });

  it("does not include Authorization header when token getter is not set", async () => {
    setTokenGetter(async () => { throw new Error("no token"); });
    mockOk({ success: true });
    await flagReview("rev-1");
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

// ── api-functions: availability ────────────────────────────────────────────

describe("addAvailability", () => {
  it("posts to /availability/add and returns slotId", async () => {
    mockOk({ slotId: "sl-new" });
    const result = await addAvailability({ day: "Monday", startTime: "09:00", endTime: "10:00", duration: 60, recurring: true, schoolDomain: "test.edu" });
    expect(result.slotId).toBe("sl-new");
    expect(fetchMock.mock.calls[0][0]).toContain("/availability/add");
  });
});

describe("deleteAvailability", () => {
  it("sends DELETE to /availability/{slotId}", async () => {
    mockOk({ success: true });
    await deleteAvailability("slot-123");
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/availability/slot-123");
    expect(opts.method).toBe("DELETE");
  });
});

describe("updateAvailability", () => {
  it("sends PATCH to /availability/{slotId}", async () => {
    mockOk({ success: true });
    await updateAvailability("slot-123", { startTime: "10:00" });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/availability/slot-123");
    expect(opts.method).toBe("PATCH");
  });
});

describe("cancelDate", () => {
  it("posts date to /availability/{slotId}/cancel-date", async () => {
    mockOk({ success: true });
    await cancelDate("slot-123", "2026-05-01");
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/availability/slot-123/cancel-date");
    expect(JSON.parse(opts.body as string)).toMatchObject({ date: "2026-05-01" });
  });
});

describe("uncancelDate", () => {
  it("posts date to /availability/{slotId}/uncancel-date", async () => {
    mockOk({ success: true });
    await uncancelDate("slot-123", "2026-05-01");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/availability/slot-123/uncancel-date");
  });
});

// ── api-functions: uploadSchoolLogo ────────────────────────────────────────

describe("uploadSchoolLogo", () => {
  it("makes two fetch calls: POST for presigned URL then PUT to S3", async () => {
    const presignedUrl = "https://s3.amazonaws.com/bucket/logo.png?signature=xyz";
    const logoUrl = "https://cdn.example.com/logo.png";
    // First call: POST /schools/{domain}/logo
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ uploadUrl: presignedUrl, logoUrl }),
    });
    // Second call: PUT to presigned S3 URL
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const file = new File(["logo data"], "logo.png", { type: "image/png" });
    const result = await uploadSchoolLogo("test.edu", file);

    expect(result).toBe(logoUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [firstUrl] = fetchMock.mock.calls[0] as [string];
    expect(firstUrl).toContain("/schools/test.edu/logo");

    const [secondUrl, secondOpts] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(secondUrl).toBe(presignedUrl);
    expect(secondOpts.method).toBe("PUT");
  });

  it("S3 PUT does not include Authorization header", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ uploadUrl: "https://s3.example.com/presigned", logoUrl: "https://cdn.example.com/l.png" }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const file = new File(["data"], "logo.png", { type: "image/png" });
    await uploadSchoolLogo("test.edu", file);

    const [, s3Opts] = fetchMock.mock.calls[1] as [string, RequestInit];
    const headers = s3Opts.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

// ── api-functions: reviews ────────────────────────────────────────────────

describe("adminDeleteReview", () => {
  it("posts to /reviews/admin-delete with reviewId and reason", async () => {
    mockOk({ success: true });
    await adminDeleteReview({ reviewId: "rev-1", reason: "Spam" });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/reviews/admin-delete");
    expect(JSON.parse(opts.body as string)).toMatchObject({ reviewId: "rev-1", reason: "Spam" });
  });
});

describe("flagReview", () => {
  it("posts to /reviews/{reviewId}/flag", async () => {
    mockOk({ success: true });
    await flagReview("rev-xyz");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/reviews/rev-xyz/flag");
  });
});
