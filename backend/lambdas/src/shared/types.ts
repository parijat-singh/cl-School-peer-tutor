// Shared type definitions for Lambda handlers.
// All timestamps are ISO 8601 strings (no Firestore Timestamp).

export type UserRole = "tutor" | "tutee" | "both" | "teacher" | "schooladmin" | "superadmin";
export type GradeLevel = "6th" | "7th" | "8th" | "9th" | "10th" | "11th" | "12th";
export type SessionStatus = "upcoming" | "completed" | "cancelled";
export type AccountStatus = "active" | "pending" | "suspended";
export type SessionDuration = 30 | 45 | 60;
export type BookingRequestStatus = "pending" | "accepted" | "rejected" | "cancelled";
export type SchoolStatus = "pending" | "approved" | "rejected";

export const DAYS_OF_WEEK = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;
export type DayOfWeek = typeof DAYS_OF_WEEK[number];

export interface UserDoc {
  uid: string;
  name: string;
  email: string;
  grade: GradeLevel | null;
  role: UserRole;
  schoolDomain: string | null;
  status: AccountStatus;
  suspendedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
  subjects?: string[];
  bio?: string;
  avgRating?: number;
  reviewCount?: number;
  isActive?: boolean;
}

export interface AvailabilitySlot {
  tutorId: string;
  slotId: string;
  recurring: boolean;
  day: DayOfWeek;
  date?: string;
  startTime: string;
  endTime: string;
  duration: SessionDuration;
  booked: boolean;
  bookedBy?: string;
  bookedDates?: Record<string, string>;
  cancelledDates?: string[];
  schoolDomain: string;
  createdAt: string;
}

export interface SessionDoc {
  sessionId: string;
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
  scheduledDate: string;
  status: SessionStatus;
  meetLink?: string;
  calendarEventId?: string;
  meetLinkStatus: "pending" | "ready" | "failed";
  schoolDomain: string;
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
  tutorRated: boolean;
  tuteeRated: boolean;
}

export interface BookingRequest {
  requestId: string;
  tutorId: string;
  tuteeId: string;
  tuteeName: string;
  tutorName: string;
  tuteeEmail: string;
  tutorEmail: string;
  slotId: string;
  subject: string;
  scheduledDate: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  duration: SessionDuration;
  recurring: boolean;
  status: BookingRequestStatus;
  schoolDomain: string;
  createdAt: string;
  respondedAt?: string;
  sessionId?: string;
  rejectionReason?: string;
}

export interface ReviewDoc {
  reviewId: string;
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
  createdAt: string;
}

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
  createdAt: string;
}

export interface StatsDoc {
  schoolDomain: string;
  totalUsers: number;
  activeTutors: number;
  sessionsThisMonth: number;
  totalSessions: number;
  avgRating: number;
  updatedAt: string;
}
