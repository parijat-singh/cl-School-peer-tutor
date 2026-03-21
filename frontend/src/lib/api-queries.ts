// src/lib/api-queries.ts
// GET operations — replaces firestore.ts reads and onSnapshot subscriptions.
// Used with usePoll() for live-updating data.

import { api } from "./api";
import type {
  UserDoc, AvailabilitySlot, SessionDoc, ReviewDoc,
  SchoolDoc, StatsDoc, TutorCard, BookingRequest, AdminAuditLog,
} from "./types";

// ── Users ───────────────────────────────────────────────────────

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  try {
    return await api.get<UserDoc>(`/users/${uid}`);
  } catch {
    return null;
  }
}

export async function getMe(): Promise<UserDoc | null> {
  try {
    return await api.get<UserDoc>("/users/me");
  } catch {
    return null;
  }
}

export async function listSuperAdmins(): Promise<UserDoc[]> {
  const res = await api.get<{ users: UserDoc[] }>("/users/superadmins");
  return res.users;
}

export async function getSchoolUsers(domain: string): Promise<UserDoc[]> {
  const res = await api.get<{ users: UserDoc[] }>(`/schools/${domain}/users`);
  return res.users;
}

// ── Tutor search ────────────────────────────────────────────────

export async function searchTutors(params: {
  schoolDomain: string;
  subject?: string;
  day?: string;
  date?: string;
}): Promise<TutorCard[]> {
  const qs = new URLSearchParams();
  qs.set("schoolDomain", params.schoolDomain);
  if (params.subject) qs.set("subject", params.subject);
  if (params.day) qs.set("day", params.day);
  if (params.date) qs.set("date", params.date);
  const res = await api.get<{ tutors: TutorCard[] }>(`/schools/${params.schoolDomain}/tutors?${qs}`);
  return res.tutors;
}

// ── Availability ────────────────────────────────────────────────

export async function getTutorSlots(tutorUid: string): Promise<AvailabilitySlot[]> {
  const res = await api.get<{ slots: AvailabilitySlot[] }>(`/tutors/${tutorUid}/slots`);
  return res.slots;
}

// ── Sessions ────────────────────────────────────────────────────

export async function getMySessions(role: "tutor" | "tutee"): Promise<SessionDoc[]> {
  const res = await api.get<{ sessions: SessionDoc[] }>(`/sessions/mine?role=${role}`);
  return res.sessions;
}

// ── Booking Requests ────────────────────────────────────────────

export async function getMyBookingRequests(role: "tutor" | "tutee"): Promise<BookingRequest[]> {
  const res = await api.get<{ requests: BookingRequest[] }>(`/booking-requests/mine?role=${role}`);
  return res.requests;
}

// ── Reviews ─────────────────────────────────────────────────────

export async function getTutorReviews(tutorUid: string): Promise<ReviewDoc[]> {
  const res = await api.get<{ reviews: ReviewDoc[] }>(`/tutors/${tutorUid}/reviews`);
  return res.reviews;
}

export async function getSchoolReviews(domain: string): Promise<ReviewDoc[]> {
  const res = await api.get<{ reviews: ReviewDoc[] }>(`/reviews/school/${domain}`);
  return res.reviews;
}

// ── Schools ─────────────────────────────────────────────────────

export async function getSchoolDoc(domain: string): Promise<SchoolDoc | null> {
  try {
    return await api.get<SchoolDoc>(`/schools/${domain}`);
  } catch {
    return null;
  }
}

export async function listAllSchools(): Promise<SchoolDoc[]> {
  const res = await api.get<{ schools: SchoolDoc[] }>("/schools");
  return res.schools;
}

// ── Stats ───────────────────────────────────────────────────────

export async function getSchoolStats(domain: string): Promise<StatsDoc | null> {
  try {
    return await api.get<StatsDoc>(`/stats/${domain}`);
  } catch {
    return null;
  }
}

// ── Audit Log ───────────────────────────────────────────────────

export async function getAuditLog(domain: string): Promise<AdminAuditLog[]> {
  const res = await api.get<{ entries: AdminAuditLog[] }>(`/audit-log/${domain}`);
  return res.entries;
}
