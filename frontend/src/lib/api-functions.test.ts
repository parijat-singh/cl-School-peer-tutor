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
  initializeUser, sendVerificationOtp, verifyEmailOtp, updateTutorProfile,
  updateUserProfile, promoteSuperAdmin, adminSuspendUser, adminUnsuspendUser,
  adminApproveUser, adminPromoteSchoolAdmin, adminDemoteSchoolAdmin,
  requestBooking, respondToBooking, cancelBookingRequest, bookSession,
  cancelSession, submitRating, adminDeleteReview, flagReview,
  registerSchool, addSchool, approveSchool, rejectSchool, removeSchool,
  promoteSchoolAdmin, updateSchoolProfile, getLogoUploadUrl, uploadSchoolLogo,
  addAvailability, deleteAvailability, updateAvailability, cancelDate, uncancelDate,
  recommendTutors, submitContactForm,
} from "./api-functions";

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.post.mockResolvedValue({ success: true });
  mockApi.patch.mockResolvedValue({ success: true });
  mockApi.delete.mockResolvedValue({ success: true });
  mockApi.publicPost.mockResolvedValue({ success: true });
});

describe("auth functions", () => {
  it("initializeUser posts to /auth/initialize-user", async () => {
    const data = { name: "A", role: "tutee", schoolDomain: "x.edu" };
    await initializeUser(data);
    expect(mockApi.post).toHaveBeenCalledWith("/auth/initialize-user", data);
  });

  it("sendVerificationOtp", async () => {
    await sendVerificationOtp({ email: "a@b.com" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/send-verification-otp", { email: "a@b.com" });
  });

  it("verifyEmailOtp", async () => {
    await verifyEmailOtp({ email: "a@b.com", otp: "123456" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/verify-email-otp", { email: "a@b.com", otp: "123456" });
  });

  it("updateTutorProfile", async () => {
    await updateTutorProfile({ subjects: ["Math"] });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/update-tutor-profile", { subjects: ["Math"] });
  });

  it("updateUserProfile", async () => {
    await updateUserProfile({ name: "B" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/update-tutor-profile", { name: "B" });
  });

  it("promoteSuperAdmin", async () => {
    await promoteSuperAdmin({ targetEmail: "x@y.com" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/promote-superadmin", { targetEmail: "x@y.com" });
  });

  it("adminSuspendUser", async () => {
    await adminSuspendUser({ targetUid: "u1", durationDays: 7, reason: "spam" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/admin-suspend-user", expect.objectContaining({ targetUid: "u1" }));
  });

  it("adminUnsuspendUser", async () => {
    await adminUnsuspendUser({ targetUid: "u1" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/admin-unsuspend-user", { targetUid: "u1" });
  });

  it("adminApproveUser", async () => {
    await adminApproveUser({ targetUid: "u1" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/admin-approve-user", { targetUid: "u1" });
  });

  it("adminPromoteSchoolAdmin", async () => {
    await adminPromoteSchoolAdmin({ targetUid: "u1", schoolDomain: "x.edu" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/promote-school-admin", expect.objectContaining({ targetUid: "u1" }));
  });

  it("adminDemoteSchoolAdmin", async () => {
    await adminDemoteSchoolAdmin({ targetUid: "u1", schoolDomain: "x.edu" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/demote-school-admin", expect.objectContaining({ targetUid: "u1" }));
  });
});

describe("booking functions", () => {
  it("requestBooking", async () => {
    const data = { tutorId: "t1", slotId: "s1", subject: "Math", scheduledDate: "2026-04-01" };
    await requestBooking(data);
    expect(mockApi.post).toHaveBeenCalledWith("/bookings/request", data);
  });

  it("respondToBooking", async () => {
    await respondToBooking({ requestId: "r1", action: "accept" });
    expect(mockApi.post).toHaveBeenCalledWith("/bookings/respond", { requestId: "r1", action: "accept" });
  });

  it("cancelBookingRequest", async () => {
    await cancelBookingRequest({ requestId: "r1" });
    expect(mockApi.post).toHaveBeenCalledWith("/bookings/cancel-request", { requestId: "r1" });
  });

  it("bookSession", async () => {
    const data = { tutorId: "t1", slotId: "s1", subject: "Math", scheduledDate: "2026-04-01" };
    await bookSession(data);
    expect(mockApi.post).toHaveBeenCalledWith("/bookings/book-session", data);
  });

  it("cancelSession", async () => {
    await cancelSession({ sessionId: "ses1" });
    expect(mockApi.post).toHaveBeenCalledWith("/sessions/cancel", { sessionId: "ses1" });
  });
});

describe("review functions", () => {
  it("submitRating", async () => {
    await submitRating({ sessionId: "s1", stars: 5, text: "Great" });
    expect(mockApi.post).toHaveBeenCalledWith("/reviews/submit", expect.objectContaining({ stars: 5 }));
  });

  it("adminDeleteReview", async () => {
    await adminDeleteReview({ reviewId: "r1", reason: "spam" });
    expect(mockApi.post).toHaveBeenCalledWith("/reviews/admin-delete", { reviewId: "r1", reason: "spam" });
  });

  it("flagReview", async () => {
    await flagReview("r1");
    expect(mockApi.post).toHaveBeenCalledWith("/reviews/r1/flag");
  });
});

describe("school functions", () => {
  it("registerSchool uses publicPost", async () => {
    await registerSchool({ domain: "x.edu", name: "X", type: "high", adminEmail: "a@x.edu" });
    expect(mockApi.publicPost).toHaveBeenCalledWith("/schools/register", expect.objectContaining({ domain: "x.edu" }));
  });

  it("addSchool", async () => {
    await addSchool({ domain: "x.edu", name: "X", type: "high" });
    expect(mockApi.post).toHaveBeenCalledWith("/schools/add", expect.objectContaining({ domain: "x.edu" }));
  });

  it("approveSchool", async () => {
    await approveSchool({ domain: "x.edu" });
    expect(mockApi.post).toHaveBeenCalledWith("/schools/approve", { domain: "x.edu" });
  });

  it("rejectSchool", async () => {
    await rejectSchool({ domain: "x.edu" });
    expect(mockApi.post).toHaveBeenCalledWith("/schools/reject", { domain: "x.edu" });
  });

  it("removeSchool", async () => {
    await removeSchool({ domain: "x.edu" });
    expect(mockApi.post).toHaveBeenCalledWith("/schools/remove", { domain: "x.edu" });
  });

  it("promoteSchoolAdmin", async () => {
    await promoteSchoolAdmin({ targetEmail: "a@x.edu", schoolDomain: "x.edu" });
    expect(mockApi.post).toHaveBeenCalledWith("/auth/promote-school-admin", expect.objectContaining({ targetEmail: "a@x.edu" }));
  });

  it("updateSchoolProfile uses patch", async () => {
    await updateSchoolProfile("x.edu", { name: "New" });
    expect(mockApi.patch).toHaveBeenCalledWith("/schools/x.edu/profile", { name: "New" });
  });

  it("getLogoUploadUrl", async () => {
    mockApi.post.mockResolvedValue({ uploadUrl: "https://s3/up", logoUrl: "https://s3/logo" });
    const res = await getLogoUploadUrl("x.edu", "image/png");
    expect(mockApi.post).toHaveBeenCalledWith("/schools/x.edu/logo", { contentType: "image/png" });
    expect(res.uploadUrl).toBe("https://s3/up");
  });

  it("uploadSchoolLogo uploads to presigned URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
    mockApi.post.mockResolvedValue({ uploadUrl: "https://s3/up", logoUrl: "https://s3/logo.png" });
    const file = new File(["img"], "logo.png", { type: "image/png" });
    const result = await uploadSchoolLogo("x.edu", file);
    expect(result).toBe("https://s3/logo.png");
    expect(mockFetch).toHaveBeenCalledWith("https://s3/up", expect.objectContaining({ method: "PUT" }));
  });
});

describe("availability functions", () => {
  it("addAvailability", async () => {
    const data = { day: "Monday" as const, startTime: "09:00", endTime: "10:00", duration: 30 as const, recurring: true, schoolDomain: "x.edu" };
    await addAvailability(data);
    expect(mockApi.post).toHaveBeenCalledWith("/availability/add", data);
  });

  it("deleteAvailability", async () => {
    await deleteAvailability("slot1");
    expect(mockApi.delete).toHaveBeenCalledWith("/availability/slot1");
  });

  it("updateAvailability", async () => {
    await updateAvailability("slot1", { startTime: "10:00" });
    expect(mockApi.patch).toHaveBeenCalledWith("/availability/slot1", { startTime: "10:00" });
  });

  it("cancelDate", async () => {
    await cancelDate("slot1", "2026-04-01");
    expect(mockApi.post).toHaveBeenCalledWith("/availability/slot1/cancel-date", { date: "2026-04-01" });
  });

  it("uncancelDate", async () => {
    await uncancelDate("slot1", "2026-04-01");
    expect(mockApi.post).toHaveBeenCalledWith("/availability/slot1/uncancel-date", { date: "2026-04-01" });
  });
});

describe("misc functions", () => {
  it("recommendTutors", async () => {
    mockApi.post.mockResolvedValue({ ranked: [], aiPowered: false });
    const data = { tutors: [] };
    await recommendTutors(data);
    expect(mockApi.post).toHaveBeenCalledWith("/recommendations/tutors", data);
  });

  it("submitContactForm uses publicPost", async () => {
    await submitContactForm({ name: "A", email: "a@b.com", subject: "Hi", message: "Hello world" });
    expect(mockApi.publicPost).toHaveBeenCalledWith("/contact/submit", expect.objectContaining({ name: "A" }));
  });
});
