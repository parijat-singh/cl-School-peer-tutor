// src/lib/types.ts
// Canonical type definitions shared across frontend and backend

import type { Timestamp } from "firebase/firestore";

// ── Enums ────────────────────────────────────────────────────────

export type UserRole = "tutor" | "tutee" | "both" | "teacher" | "schooladmin" | "superadmin";
export type GradeLevel = "6th" | "7th" | "8th" | "9th" | "10th" | "11th" | "12th";
export type SessionStatus = "upcoming" | "completed" | "cancelled";
export type AccountStatus = "active" | "pending" | "suspended";
export type SessionDuration = 30 | 45 | 60;

export const DAYS_OF_WEEK = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;
export type DayOfWeek = typeof DAYS_OF_WEEK[number];

// ── Firestore Documents ──────────────────────────────────────────

export interface UserDoc {
  uid: string;
  name: string;
  email: string;
  grade: GradeLevel | null;
  role: UserRole;
  schoolDomain: string | null;
  status: AccountStatus;
  suspendedUntil?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Tutor-specific
  subjects?: string[];
  bio?: string;
  avgRating?: number;
  reviewCount?: number;
  isActive?: boolean;
}

export interface AvailabilitySlot {
  id: string;
  // Recurring weekly slot fields
  recurring?: boolean;
  day: DayOfWeek;
  startTime: string;   // "HH:MM" 24h format
  endTime: string;
  duration: SessionDuration;
  booked: boolean;
  bookedBy?: string;   // tuteeUid when booked
  bookedDates?: string[];      // ISO date strings for recurring slots
  cancelledDates?: string[];   // ISO date strings cancelled by tutor
  // Specific-date slot fields
  date?: string;               // ISO date string for one-off slots
  schoolDomain: string;
  createdAt: Timestamp;
}

export interface SessionDoc {
  id: string;
  tutorId: string;
  tuteeId: string;
  tutorName: string;
  tuteeName: string;
  subject: string;
  slotId: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  duration: SessionDuration;
  scheduledDate: Timestamp;
  status: SessionStatus;
  meetLink?: string;
  calendarEventId?: string;
  meetLinkStatus: "pending" | "ready" | "failed";
  schoolDomain: string;
  createdAt: Timestamp;
  cancelledAt?: Timestamp;
  cancelledBy?: string;
  tutorRated: boolean;
  tuteeRated: boolean;
}

export interface ReviewDoc {
  id: string;
  sessionId: string;
  authorId: string;
  authorName: string;
  targetId: string;
  targetName: string;
  stars: 1 | 2 | 3 | 4 | 5;
  text?: string;
  flagged: boolean;
  flaggedBy?: string;
  schoolDomain: string;
  createdAt: Timestamp;
}

export type SchoolStatus = "pending" | "approved" | "rejected";

export interface SchoolDoc {
  domain: string;
  name: string;
  type: "middle" | "high" | "k12";
  approved: boolean;
  status?: SchoolStatus;
  adminEmail?: string;
  adminUid?: string;
  campus?: string;
  address?: string;
  location?: string;
  brandColor: string;
  logoUrl?: string;
  subjects: string[];
  createdAt: Timestamp;
}

export interface StatsDoc {
  schoolDomain: string;
  totalUsers: number;
  activeTutors: number;
  sessionsThisMonth: number;
  totalSessions: number;
  avgRating: number;
  updatedAt: Timestamp;
}

export interface AdminAuditLog {
  id: string;
  adminUid: string;
  action: "suspend_user" | "unsuspend_user" | "approve_user" | "delete_review" | "update_subjects" | "update_branding" | "approve_school" | "reject_school" | "remove_school" | "add_school" | "promote_superadmin" | "promote_schooladmin" | "demote_schooladmin";
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  schoolDomain: string;
  timestamp: Timestamp;
}

// ── API Request/Response types ───────────────────────────────────

export interface BookSessionRequest {
  tutorId: string;
  slotId: string;
  subject: string;
  scheduledDate: string; // ISO date string
}

export interface BookSessionResponse {
  sessionId: string;
  meetLink: string | null;
  meetLinkStatus: "ready" | "pending";
  message: string;
}

export interface RateSessionRequest {
  sessionId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  text?: string;
}

export interface CancelSessionRequest {
  sessionId: string;
  reason?: string;
}

// ── UI-only types ────────────────────────────────────────────────

export interface TutorCard {
  uid: string;
  name: string;
  grade: GradeLevel;
  subjects: string[];
  bio?: string;
  avgRating: number;
  reviewCount: number;
  availableSlots: AvailabilitySlot[];
}

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  grade: GradeLevel | null;
  schoolDomain: string | null;
  status: AccountStatus;
}
