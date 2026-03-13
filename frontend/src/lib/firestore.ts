// src/lib/firestore.ts
// All Firestore reads — centralised for easy mocking in tests

import {
  collection, doc, query, where, orderBy, limit,
  getDocs, getDoc, onSnapshot, runTransaction,
  serverTimestamp, updateDoc, deleteDoc, addDoc,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
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

    // Fetch availability slots
    const slotConstraints: QueryConstraint[] = [where("booked", "==", false)];
    if (params.day) slotConstraints.push(where("day", "==", params.day));
    const slotSnap = await getDocs(query(availCol(user.uid), ...slotConstraints));
    const slots = slotSnap.docs.map(
      (s) => ({ id: s.id, ...s.data() } as AvailabilitySlot)
    );

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
    createdAt: serverTimestamp(),
  });
}

export async function removeAvailabilitySlot(tutorUid: string, slotId: string) {
  return deleteDoc(doc(db, "users", tutorUid, "availability", slotId));
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
