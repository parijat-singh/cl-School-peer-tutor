/**
 * seed-emulator.mjs
 * Populates the local Firebase emulator with test data for the
 * booking-request-queue feature.
 *
 * Run AFTER emulators are up:
 *   node seed-emulator.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ── Point admin SDK at local emulators ────────────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

initializeApp({ projectId: "peertutor-dev" });
const db = getFirestore();

// ── Shared constants ──────────────────────────────────────────────────────
const SCHOOL_DOMAIN = "lincoln.edu";

// Next Monday, Tuesday, Wednesday from today so slots are in the future
function nextWeekday(targetDay) {
  // targetDay: 0=Sun,1=Mon,...,6=Sat
  const d = new Date();
  const diff = (targetDay - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

const NEXT_MONDAY    = nextWeekday(1);
const NEXT_TUESDAY   = nextWeekday(2);
const NEXT_WEDNESDAY = nextWeekday(3);

console.log("Seed dates →", { NEXT_MONDAY, NEXT_TUESDAY, NEXT_WEDNESDAY });

// ── 1. School ─────────────────────────────────────────────────────────────
async function seedSchool() {
  await db.collection("schools").doc(SCHOOL_DOMAIN).set({
    name:        "Lincoln University",
    domain:      SCHOOL_DOMAIN,
    status:      "approved",
    approved:    true,          // required by onUserCreate to activate users
    adminEmail:  "admin@lincoln.edu",
    adminName:   "Sarah Chen",
    logoUrl:     null,
    createdAt:   Timestamp.now(),
    updatedAt:   Timestamp.now(),
  }, { merge: true });
  console.log("✔ school seeded");
}

// ── 2. Users ──────────────────────────────────────────────────────────────
async function seedUsers() {
  const users = [
    {
      id: "user-tutor-001",
      data: {
        name:         "Marcus Johnson",
        email:        "tutor1@lincoln.edu",
        role:         "tutor",
        schoolDomain: SCHOOL_DOMAIN,
        status:       "active",
        bio:          "Math tutor specialising in Calculus and Algebra.",
        subjects:     ["Mathematics", "Calculus", "Algebra"],
        rating:       4.8,
        reviewCount:  12,
        isActive:     true,
        avgRating:    4.8,
        createdAt:    Timestamp.now(),
      },
    },
    {
      id: "user-tutor-002",
      data: {
        name:         "Emily Rodriguez",
        email:        "tutor2@lincoln.edu",
        role:         "tutor",
        schoolDomain: SCHOOL_DOMAIN,
        status:       "active",
        bio:          "Physics tutor with 3 years of experience.",
        subjects:     ["Physics", "Science"],
        rating:       4.5,
        reviewCount:  8,
        isActive:     true,
        avgRating:    4.5,
        createdAt:    Timestamp.now(),
      },
    },
    {
      id: "user-tutee-001",
      data: {
        name:         "Alex Kim",
        email:        "tutee1@lincoln.edu",
        role:         "tutee",
        schoolDomain: SCHOOL_DOMAIN,
        status:       "active",
        createdAt:    Timestamp.now(),
      },
    },
    {
      id: "user-tutee-002",
      data: {
        name:         "Jordan Patel",
        email:        "tutee2@lincoln.edu",
        role:         "tutee",
        schoolDomain: SCHOOL_DOMAIN,
        status:       "active",
        createdAt:    Timestamp.now(),
      },
    },
    {
      id: "user-admin-001",
      data: {
        name:         "Sarah Chen",
        email:        "admin@lincoln.edu",
        role:         "schooladmin",
        schoolDomain: SCHOOL_DOMAIN,
        status:       "active",
        createdAt:    Timestamp.now(),
      },
    },
  ];

  for (const u of users) {
    await db.collection("users").doc(u.id).set(u.data, { merge: true });
    console.log(`✔ user ${u.id} (${u.data.email})`);
  }
}

// ── 3. Availability slots for Marcus (tutor-001) ──────────────────────────
async function seedAvailability() {
  const tutorId = "user-tutor-001";
  const avRef   = db.collection("users").doc(tutorId).collection("availability");

  const slots = [
    // Recurring Monday slot – Mathematics (slot-001)
    {
      id: "slot-recurring-mon",
      data: {
        tutorId,
        day:        "Monday",
        startTime:  "10:00",
        endTime:    "11:00",
        duration:   60,
        subject:    "Mathematics",
        recurring:  true,
        booked:     false,
        bookedDates: {},    // map of YYYY-MM-DD → tuteeId when accepted
        cancelledDates: [],
        createdAt:  Timestamp.now(),
      },
    },
    // Recurring Tuesday slot – Calculus (slot-002)
    {
      id: "slot-recurring-tue",
      data: {
        tutorId,
        day:        "Tuesday",
        startTime:  "14:00",
        endTime:    "15:00",
        duration:   60,
        subject:    "Calculus",
        recurring:  true,
        booked:     false,
        bookedDates: {},
        cancelledDates: [],
        createdAt:  Timestamp.now(),
      },
    },
    // One-off Wednesday slot – Algebra (slot-003)
    {
      id: "slot-oneoff-wed",
      data: {
        tutorId,
        day:        "Wednesday",
        startTime:  "09:00",
        endTime:    "10:00",
        duration:   60,
        subject:    "Algebra",
        recurring:  false,
        booked:     false,
        bookedBy:   null,
        specificDate: NEXT_WEDNESDAY,
        createdAt:  Timestamp.now(),
      },
    },
  ];

  for (const s of slots) {
    await avRef.doc(s.id).set(s.data, { merge: true });
    console.log(`✔ slot ${s.id}`);
  }
}

// ── 4. School stats placeholder ───────────────────────────────────────────
async function seedStats() {
  await db.collection("stats").doc(SCHOOL_DOMAIN).set({
    tutorCount:  2,
    tuteeCount:  2,
    sessionCount: 0,
    updatedAt:   Timestamp.now(),
  }, { merge: true });
  console.log("✔ stats seeded");
}

// ── Run all ───────────────────────────────────────────────────────────────
(async () => {
  try {
    await seedSchool();
    await seedUsers();
    await seedAvailability();
    await seedStats();
    console.log("\n✅  Seed complete — emulator is ready for testing.\n");
    console.log("Test accounts (password: Test1234!):");
    console.log("  Tutor:  tutor1@lincoln.edu");
    console.log("  Tutee1: tutee1@lincoln.edu");
    console.log("  Tutee2: tutee2@lincoln.edu");
    console.log("  Admin:  admin@lincoln.edu");
    console.log("\nAvailability slots created for Marcus Johnson:");
    console.log("  slot-recurring-mon  → Mon 10:00–11:00 (Mathematics, recurring)");
    console.log("  slot-recurring-tue  → Tue 14:00–15:00 (Calculus, recurring)");
    console.log(`  slot-oneoff-wed     → Wed 09:00–10:00 (Algebra, one-off on ${NEXT_WEDNESDAY})`);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
})();
