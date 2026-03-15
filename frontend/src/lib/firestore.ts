// src/lib/firestore.ts
// All Firestore reads — centralised for easy mocking in tests

import {
  collection, doc, query, where, orderBy, limit,
  getDocs, getDoc, onSnapshot,
  serverTimestamp, updateDoc, deleteDoc, addDoc,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { fns } from "./firebase";
import type {
  UserDoc, AvailabilitySlot, SessionDoc, ReviewDoc,
  SchoolDoc, StatsDoc, TutorCard,
} from "./types";

// ── Collection refs ──────────────────────────────────────────────
export const usersCol      = () => collection(db, "users");
export const sessionsCol   = () => collection(db, "sessions");
export const reviewsCol    = () => collection(db, "reviews");
export const schoolsCol    = () => collection(db, "schools");
export const auditCol      = () => collection(db, "adminAuditLog");
export const statsCol      = () => collection(db, "stats");
export const availCol      = (uid: string) => collection(db, "users", uid, "availability");

// ── Users ────────────────────────────────────────────────────────

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserDoc) : null;
}

export function subscribeUser(uid: string, cb: (u: UserDoc | null) => void): Unsubscribe {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    cb(snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserDoc) : null);
  });
}

// ── Tutor search ─────────────────────────────────────────────────

export async function searchTutors(params: {
  schoolDomain: string;
  subject?: string;
  day?: string;
  date?: string;           // "YYYY-MM-DD" — filter by specific date
}): Promise<TutorCard[]> {
  const constraints: QueryConstraint[] = [
    where("schoolDomain", "==", params.schoolDomain),
    where("role", "in", ["tutor", "both"]),
    where("status", "==", "active"),
    where("isActive", "==", true),
  ];
  if (params.subject) {
    constraints.push(where("subjects", "array-contains", params.subject));
  }

  const snap = await getDocs(query(usersCol(), ...constraints));
  const tutors: TutorCard[] = [];

  for (const userSnap of snap.docs) {
    const user = { uid: userSnap.id, ...userSnap.data() } as UserDoc;

    // Fetch all availability slots (we filter client-side for complex logic)
    const slotConstraints: QueryConstraint[] = [];
    if (params.day) slotConstraints.push(where("day", "==", params.day));
    const slotSnap = await getDocs(query(availCol(user.uid), ...slotConstraints));
    const allSlots = slotSnap.docs.map(
      (s) => ({ id: s.id, ...s.data() } as AvailabilitySlot)
    );

    // Filter to available slots only
    const today = new Date().toISOString().split("T")[0];
    const slots = allSlots.filter((slot) => {
      if (slot.recurring) {
        // Recurring: has at least one available date in next 4 weeks
        const cancelled = slot.cancelledDates ?? [];
        const booked = slot.bookedDates ?? {};
        // If filtering by specific date, check that date
        if (params.date) {
          return !cancelled.includes(params.date) && !booked[params.date];
        }
        // Otherwise check if any date in next 4 weeks is available
        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const dayIdx = dayNames.indexOf(slot.day);
        const now = new Date();
        for (let w = 0; w < 4; w++) {
          const d = new Date(now);
          const diff = (dayIdx - d.getDay() + 7) % 7 || 7;
          d.setDate(d.getDate() + diff + w * 7);
          const ds = d.toISOString().split("T")[0];
          if (!cancelled.includes(ds) && !booked[ds]) return true;
        }
        return false;
      } else {
        // One-off: not booked and date is in the future
        if (slot.booked) return false;
        if (slot.date && slot.date < today) return false;
        if (params.date && slot.date !== params.date) return false;
        return true;
      }
    });

    // Only include tutors with open slots
    if (slots.length > 0) {
      tutors.push({
        uid: user.uid,
        name: user.name,
        grade: user.grade,
        subjects: user.subjects ?? [],
        bio: user.bio,
        avgRating: user.avgRating ?? 0,
        reviewCount: user.reviewCount ?? 0,
        availableSlots: slots,
      });
    }
  }

  return tutors;
}

// ── Availability ─────────────────────────────────────────────────

export function subscribeTutorSlots(
  tutorUid: string,
  cb: (slots: AvailabilitySlot[]) => void
): Unsubscribe {
  return onSnapshot(availCol(tutorUid), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AvailabilitySlot)));
  });
}

export async function addAvailabilitySlot(
  tutorUid: string,
  slot: Omit<AvailabilitySlot, "id" | "booked" | "createdAt">
) {
  return addDoc(availCol(tutorUid), {
    ...slot,
    booked: false,
    bookedDates: slot.recurring ? {} : undefined,
    cancelledDates: slot.recurring ? [] : undefined,
    createdAt: serverTimestamp(),
  });
}

export async function removeAvailabilitySlot(tutorUid: string, slotId: string) {
  return deleteDoc(doc(db, "users", tutorUid, "availability", slotId));
}

export async function updateAvailabilitySlot(
  tutorUid: string,
  slotId: string,
  updates: Partial<Pick<AvailabilitySlot, "startTime" | "endTime" | "duration" | "cancelledDates" | "bookedDates">>
) {
  return updateDoc(doc(db, "users", tutorUid, "availability", slotId), updates);
}

/** Cancel a specific date occurrence of a recurring slot */
export async function cancelRecurringDate(
  tutorUid: string,
  slotId: string,
  date: string
) {
  const slotRef = doc(db, "users", tutorUid, "availability", slotId);
  const snap = await getDoc(slotRef);
  if (!snap.exists()) return;
  const data = snap.data();
  const cancelled = data.cancelledDates ?? [];
  if (!cancelled.includes(date)) {
    await updateDoc(slotRef, { cancelledDates: [...cancelled, date] });
  }
}

/** Uncancel a specific date occurrence of a recurring slot */
export async function uncancelRecurringDate(
  tutorUid: string,
  slotId: string,
  date: string
) {
  const slotRef = doc(db, "users", tutorUid, "availability", slotId);
  const snap = await getDoc(slotRef);
  if (!snap.exists()) return;
  const data = snap.data();
  const cancelled = (data.cancelledDates ?? []).filter((d: string) => d !== date);
  await updateDoc(slotRef, { cancelledDates: cancelled });
}

// ── Sessions ─────────────────────────────────────────────────────

export function subscribeUserSessions(
  uid: string,
  role: "tutor" | "tutee",
  cb: (sessions: SessionDoc[]) => void
): Unsubscribe {
  const field = role === "tutor" ? "tutorId" : "tuteeId";
  const q = query(
    sessionsCol(),
    where(field, "==", uid),
    where("status", "in", ["upcoming", "completed"]),
    orderBy("scheduledDate", "asc")
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SessionDoc)));
  });
}

// ── Reviews ──────────────────────────────────────────────────────

export async function getTutorReviews(
  tutorId: string,
  schoolDomain: string
): Promise<ReviewDoc[]> {
  const q = query(
    reviewsCol(),
    where("targetId", "==", tutorId),
    where("schoolDomain", "==", schoolDomain),
    orderBy("createdAt", "desc"),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReviewDoc));
}

export function subscribeSchoolReviews(
  schoolDomain: string,
  cb: (reviews: ReviewDoc[]) => void
): Unsubscribe {
  const q = query(
    reviewsCol(),
    where("schoolDomain", "==", schoolDomain),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReviewDoc)));
  });
}

// ── School ───────────────────────────────────────────────────────

export async function getSchoolDoc(domain: string): Promise<SchoolDoc | null> {
  const snap = await getDoc(doc(db, "schools", domain));
  return snap.exists() ? (snap.data() as SchoolDoc) : null;
}

export async function uploadSchoolLogo(domain: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "png";
  const storageRef = ref(storage, `schools/${domain}/logo.${ext}`);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  // Update school doc with the new logo URL
  await updateDoc(doc(db, "schools", domain), { logoUrl: url });
  return url;
}

export async function updateSchoolProfile(
  domain: string,
  updates: { name?: string; campus?: string; brandColor?: string }
) {
  await updateDoc(doc(db, "schools", domain), updates);
}

// ── Stats ────────────────────────────────────────────────────────

export function subscribeStats(
  schoolDomain: string,
  cb: (stats: StatsDoc | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, "stats", schoolDomain), (snap) => {
    cb(snap.exists() ? (snap.data() as StatsDoc) : null);
  });
}

// ── Flag review ──────────────────────────────────────────────────

export async function flagReview(reviewId: string, flaggedBy: string) {
  return updateDoc(doc(db, "reviews", reviewId), { flagged: true, flaggedBy });
}

// ── Super Admin queries ──────────────────────────────────────────

export function subscribeAllSchools(cb: (schools: SchoolDoc[]) => void): Unsubscribe {
  const q = query(schoolsCol(), orderBy("domain"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data() as SchoolDoc));
  });
}

export function subscribeAllSuperAdmins(cb: (users: UserDoc[]) => void): Unsubscribe {
  const q = query(usersCol(), where("role", "==", "superadmin"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserDoc)));
  });
}

// ── AI Recommendation Engine ─────────────────────────────────

export interface TutorRecommendation {
  uid: string;
  reason: string;
  score: number;
}

export interface RecommendationResult {
  ranked: TutorRecommendation[];
  aiPowered: boolean;
}

export async function getRecommendedTutors(
  tutors: TutorCard[],
  searchContext: { subject?: string; date?: string; day?: string }
): Promise<RecommendationResult> {
  const fn = httpsCallable<unknown, RecommendationResult>(fns, "recommendTutors");

  const tutorInputs = tutors.map((t) => ({
    uid: t.uid,
    name: t.name,
    grade: t.grade,
    subjects: t.subjects,
    bio: t.bio,
    avgRating: t.avgRating,
    reviewCount: t.reviewCount,
    slotCount: t.availableSlots.length,
    hasRecurringSlots: t.availableSlots.some((s) => s.recurring),
    hasDateSlots: t.availableSlots.some((s) => !s.recurring),
  }));

  const result = await fn({
    tutors: tutorInputs,
    searchSubject: searchContext.subject,
    searchDate: searchContext.date,
    searchDay: searchContext.day,
  });

  return result.data;
}
