// src/lib/functions.ts
// Typed wrappers around Firebase Callable Cloud Functions

import { httpsCallable } from "firebase/functions";
import { fns } from "./firebase";
import type {
  BookSessionRequest,
  BookSessionResponse,
  RateSessionRequest,
  CancelSessionRequest,
} from "./types";

// ── Booking ──────────────────────────────────────────────────────

export const bookSession = httpsCallable<BookSessionRequest, BookSessionResponse>(
  fns, "bookSession"
);

export const cancelSession = httpsCallable<CancelSessionRequest, { success: boolean }>(
  fns, "cancelSession"
);

// ── Reviews ──────────────────────────────────────────────────────

export const submitRating = httpsCallable<RateSessionRequest, { success: boolean }>(
  fns, "submitRating"
);

export const deleteReview = httpsCallable<
  { reviewId: string; reason: string },
  { success: boolean }
>(fns, "adminDeleteReview");

// ── Admin ────────────────────────────────────────────────────────

export const suspendUser = httpsCallable<
  { targetUid: string; durationDays: number | null; reason: string },
  { success: boolean }
>(fns, "adminSuspendUser");

export const unsuspendUser = httpsCallable<
  { targetUid: string },
  { success: boolean }
>(fns, "adminUnsuspendUser");

export const exportSessions = httpsCallable<
  { schoolDomain: string },
  { csvUrl: string }
>(fns, "adminExportSessions");

// ── School onboarding ────────────────────────────────────────────

export const registerSchool = httpsCallable<
  { name: string; domain: string; adminEmail: string; type: string },
  { success: boolean; message: string }
>(fns, "registerSchool");

export const addSchool = httpsCallable<
  { domain: string; name: string; type: string; adminEmail: string; campus: string; address: string; location: string },
  { success: boolean; message: string }
>(fns, "addSchool");

// ── Super Admin ─────────────────────────────────────────────────

export const approveSchool = httpsCallable<
  { domain: string },
  { success: boolean }
>(fns, "approveSchool");

export const rejectSchool = httpsCallable<
  { domain: string; reason: string },
  { success: boolean }
>(fns, "rejectSchool");

export const removeSchool = httpsCallable<
  { domain: string },
  { success: boolean }
>(fns, "removeSchool");

export const promoteSuperAdmin = httpsCallable<
  { targetUid: string },
  { success: boolean }
>(fns, "promoteSuperAdmin");

// ── Tutor profile ────────────────────────────────────────────────

export const updateTutorProfile = httpsCallable<
  { subjects: string[]; bio: string },
  { success: boolean }
>(fns, "updateTutorProfile");
