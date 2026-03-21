// src/lib/api-functions.ts
// POST/PATCH/DELETE operations — replaces callable.ts + direct Firestore writes.
// Every function maps to a single API Gateway endpoint.

import { api } from "./api";
import type { SessionDuration, DayOfWeek } from "./types";

// ── Auth / Users ────────────────────────────────────────────────

export function initializeUser(data: {
  name: string;
  role: string;
  schoolDomain: string;
  grade?: string | null;
  subjects?: string[];
}) {
  return api.post<{ uid: string }>("/auth/initialize-user", data);
}

export function sendVerificationOtp(data: { email: string }) {
  return api.post<{ message: string }>("/auth/send-verification-otp", data);
}

export function verifyEmailOtp(data: { email: string; otp: string }) {
  return api.post<{ success: boolean }>("/auth/verify-email-otp", data);
}

export function updateTutorProfile(data: {
  subjects: string[];
  bio?: string;
  isActive?: boolean;
}) {
  return api.post<{ success: boolean }>("/auth/update-tutor-profile", data);
}

export function updateUserProfile(data: {
  name: string;
  grade?: string | null;
  subjects?: string[];
  bio?: string;
}) {
  return api.post<{ success: boolean }>("/auth/update-tutor-profile", data);
}

export function promoteSuperAdmin(data: { targetEmail: string }) {
  return api.post<{ success: boolean }>("/auth/promote-superadmin", data);
}

export function adminSuspendUser(data: {
  targetUid: string;
  durationDays: number | null;
  reason: string;
}) {
  return api.post<{ success: boolean }>("/auth/admin-suspend-user", data);
}

export function adminUnsuspendUser(data: { targetUid: string }) {
  return api.post<{ success: boolean }>("/auth/admin-unsuspend-user", data);
}

export function adminApproveUser(data: { targetUid: string }) {
  return api.post<{ success: boolean }>("/auth/admin-approve-user", data);
}

export function adminPromoteSchoolAdmin(data: { targetUid: string; schoolDomain: string }) {
  return api.post<{ success: boolean }>("/auth/promote-school-admin", data);
}

export function adminDemoteSchoolAdmin(data: { targetUid: string; schoolDomain: string }) {
  return api.post<{ success: boolean }>("/auth/demote-school-admin", data);
}

// ── Bookings & Sessions ─────────────────────────────────────────

export function requestBooking(data: {
  tutorId: string;
  slotId: string;
  subject: string;
  scheduledDate: string;
}) {
  return api.post<{ requestId: string }>("/bookings/request", data);
}

export function respondToBooking(data: { requestId: string; action: "accept" | "reject" }) {
  return api.post<{ sessionId?: string; meetLink?: string | null; meetLinkStatus?: string; success?: boolean }>(
    "/bookings/respond", data,
  );
}

export function cancelBookingRequest(data: { requestId: string }) {
  return api.post<{ success: boolean }>("/bookings/cancel-request", data);
}

export function bookSession(data: {
  tutorId: string;
  slotId: string;
  subject: string;
  scheduledDate: string;
}) {
  return api.post<{ sessionId: string; meetLink: string | null; meetLinkStatus: string }>(
    "/bookings/book-session", data,
  );
}

export function cancelSession(data: { sessionId: string; reason?: string }) {
  return api.post<{ success: boolean }>("/sessions/cancel", data);
}

// ── Reviews ─────────────────────────────────────────────────────

export function submitRating(data: {
  sessionId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  text?: string;
}) {
  return api.post<{ reviewId: string }>("/reviews/submit", data);
}

export function adminDeleteReview(data: { reviewId: string; reason: string }) {
  return api.post<{ success: boolean }>("/reviews/admin-delete", data);
}

export function flagReview(reviewId: string) {
  return api.post<{ success: boolean }>(`/reviews/${reviewId}/flag`);
}

// ── Schools ─────────────────────────────────────────────────────

export function registerSchool(data: {
  domain: string;
  name: string;
  type: "middle" | "high" | "k12";
  adminEmail: string;
  campus?: string;
}) {
  return api.publicPost<{ success: boolean }>("/schools/register", data);
}

export function addSchool(data: {
  domain: string;
  name: string;
  type: "middle" | "high" | "k12";
  adminEmail?: string;
  campus?: string;
  address?: string;
  location?: string;
  subjects?: string[];
}) {
  return api.post<{ success: boolean }>("/schools/add", data);
}

export function approveSchool(data: { domain: string }) {
  return api.post<{ success: boolean }>("/schools/approve", data);
}

export function rejectSchool(data: { domain: string; reason?: string }) {
  return api.post<{ success: boolean }>("/schools/reject", data);
}

export function removeSchool(data: { domain: string }) {
  return api.post<{ success: boolean }>("/schools/remove", data);
}

export function promoteSchoolAdmin(data: {
  targetEmail: string;
  schoolDomain: string;
}) {
  return api.post<{ success: boolean }>("/auth/promote-school-admin", data);
}

export function updateSchoolProfile(domain: string, updates: {
  name?: string;
  type?: string;
  adminEmail?: string;
  campus?: string;
  address?: string;
  location?: string;
  brandColor?: string;
}) {
  return api.patch<{ success: boolean }>(`/schools/${domain}/profile`, updates);
}

export function getLogoUploadUrl(domain: string, contentType: string) {
  return api.post<{ uploadUrl: string; logoUrl: string }>(`/schools/${domain}/logo`, { contentType });
}

/** Upload logo to S3 via presigned URL, then update school profile. */
export async function uploadSchoolLogo(domain: string, file: File): Promise<string> {
  const { uploadUrl, logoUrl } = await getLogoUploadUrl(domain, file.type);
  await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  return logoUrl;
}

// ── Availability ────────────────────────────────────────────────

export function addAvailability(data: {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  duration: SessionDuration;
  recurring: boolean;
  date?: string;
  schoolDomain: string;
}) {
  return api.post<{ slotId: string }>("/availability/add", data);
}

export function deleteAvailability(slotId: string) {
  return api.delete<{ success: boolean }>(`/availability/${slotId}`);
}

export function updateAvailability(slotId: string, updates: {
  startTime?: string;
  endTime?: string;
  duration?: SessionDuration;
}) {
  return api.patch<{ success: boolean }>(`/availability/${slotId}`, updates);
}

export function cancelDate(slotId: string, date: string) {
  return api.post<{ success: boolean }>(`/availability/${slotId}/cancel-date`, { date });
}

export function uncancelDate(slotId: string, date: string) {
  return api.post<{ success: boolean }>(`/availability/${slotId}/uncancel-date`, { date });
}

// ── Recommendations ─────────────────────────────────────────────

export function recommendTutors(data: {
  tutors: Array<{
    uid: string;
    name: string;
    grade: string | null;
    subjects: string[];
    bio?: string;
    avgRating: number;
    reviewCount: number;
    slotCount: number;
    hasRecurringSlots: boolean;
    hasDateSlots: boolean;
  }>;
  searchSubject?: string;
  searchDate?: string;
  searchDay?: string;
}) {
  return api.post<{ ranked: Array<{ uid: string; reason: string; score: number }>; aiPowered: boolean }>(
    "/recommendations/tutors", data,
  );
}

// ── Contact ─────────────────────────────────────────────────────

export function submitContactForm(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  return api.publicPost<{ success: boolean }>("/contact/submit", data);
}
