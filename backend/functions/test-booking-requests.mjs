/**
 * test-booking-requests.mjs
 * ─────────────────────────────────────────────────────────────────
 * End-to-end test for the booking request queue feature.
 * Runs against local Firebase emulators (Auth :9099, Functions :5001, Firestore :8090).
 *
 * Tests:
 *   1. Tutee1 submits a booking request
 *   2. Tutee2 submits a request for the SAME slot+date (both pending simultaneously)
 *   3. Tutor accepts Tutee1's request
 *      → session is created
 *      → Tutee2's request is auto-rejected ("slot_taken")
 *      → slot is marked booked
 *   4. Tutee1 cannot request the same slot again (already accepted)
 *   5. Tutee1 cancels a different pending request (cancel flow)
 *   6. Tutor rejects a request manually (reject flow)
 *
 * Run: node test-booking-requests.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ── Emulator config ────────────────────────────────────────────────────────
const PROJECT_ID       = "peertutor-dev";
const AUTH_HOST        = "http://localhost:9099";
const FUNCTIONS_HOST   = "http://localhost:5001";
const FIRESTORE_HOST   = "localhost:8090";

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

// ── Helpers ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  ✅ PASS  ${msg}`);
  passed++;
}
function fail(msg, detail = "") {
  console.error(`  ❌ FAIL  ${msg}${detail ? "\n         " + detail : ""}`);
  failed++;
}
function section(title) {
  console.log(`\n${"─".repeat(60)}\n🧪 ${title}\n${"─".repeat(60)}`);
}

/** Sign in via Auth emulator, return idToken */
async function signIn(email, password) {
  const res = await fetch(
    `${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`signIn failed for ${email}: ${JSON.stringify(data)}`);
  return data.idToken;
}

/** Call a callable Cloud Function via the emulator REST endpoint */
async function callFn(fnName, data, idToken) {
  const url = `${FUNCTIONS_HOST}/${PROJECT_ID}/us-central1/${fnName}`;
  const res  = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });
  const json = await res.json();
  if (json.error) {
    const err = new Error(json.error.message || JSON.stringify(json.error));
    err.code   = json.error.status;
    err.detail = json.error;
    throw err;
  }
  return json.result;
}

/** Read a Firestore document */
async function getDoc(path) {
  const ref  = db.doc(path);
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
}

/** Query bookingRequests */
async function queryRequests(filters = {}) {
  let q = db.collection("bookingRequests");
  for (const [field, value] of Object.entries(filters)) {
    q = q.where(field, "==", value);
  }
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Tokens ─────────────────────────────────────────────────────────────────
let tutee1Token, tutee2Token, tutorToken;

async function getTokens() {
  console.log("\n🔑 Signing in test users…");
  [tutee1Token, tutee2Token, tutorToken] = await Promise.all([
    signIn("tutee1@lincoln.edu", "Test1234!"),
    signIn("tutee2@lincoln.edu", "Test1234!"),
    signIn("tutor1@lincoln.edu", "Test1234!"),
  ]);
  console.log("   tutee1, tutee2, tutor1 tokens acquired ✓");
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1 — Tutee1 submits a booking request
// ═══════════════════════════════════════════════════════════════════════════
async function test1_submitRequest() {
  section("TEST 1 — Tutee1 submits a booking request for Monday slot");
  try {
    const result = await callFn("requestBooking", {
      tutorId:       "user-tutor-001",
      slotId:        "slot-recurring-mon",
      subject:       "Mathematics",
      scheduledDate: "2026-03-23",   // Next Monday
    }, tutee1Token);

    if (result?.requestId) {
      pass(`requestId returned: ${result.requestId}`);
      global.req1Id = result.requestId;
    } else {
      fail("No requestId in response", JSON.stringify(result));
    }

    // Verify doc in Firestore
    const doc = await getDoc(`bookingRequests/${global.req1Id}`);
    if (!doc) { fail("bookingRequest doc not created"); return; }

    doc.status === "pending"            ? pass("status === 'pending'")           : fail("status wrong: " + doc.status);
    doc.tuteeId === "user-tutee-001"    ? pass("tuteeId correct")                : fail("tuteeId wrong: " + doc.tuteeId);
    doc.tutorId === "user-tutor-001"    ? pass("tutorId correct")                : fail("tutorId wrong: " + doc.tutorId);
    doc.slotId  === "slot-recurring-mon"? pass("slotId correct")                 : fail("slotId wrong: " + doc.slotId);
    doc.scheduledDate === "2026-03-23"  ? pass("scheduledDate correct")          : fail("scheduledDate wrong: " + doc.scheduledDate);
    doc.subject === "Mathematics"       ? pass("subject correct")                : fail("subject wrong: " + doc.subject);
    doc.day === "Monday"                ? pass("day correct (Monday)")           : fail("day wrong: " + doc.day);
    doc.schoolDomain === "lincoln.edu"  ? pass("schoolDomain correct")           : fail("schoolDomain wrong: " + doc.schoolDomain);
  } catch (err) {
    fail("requestBooking threw: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2 — Tutee2 submits a request for the SAME slot+date (race condition)
// ═══════════════════════════════════════════════════════════════════════════
async function test2_concurrentRequest() {
  section("TEST 2 — Tutee2 requests same slot (both pending simultaneously)");
  try {
    const result = await callFn("requestBooking", {
      tutorId:       "user-tutor-001",
      slotId:        "slot-recurring-mon",
      subject:       "Mathematics",
      scheduledDate: "2026-03-23",
    }, tutee2Token);

    if (result?.requestId) {
      pass(`Tutee2 request created: ${result.requestId}`);
      global.req2Id = result.requestId;
    } else {
      fail("No requestId for tutee2");
    }

    // Both should be pending
    const pending = await queryRequests({ slotId: "slot-recurring-mon", scheduledDate: "2026-03-23", status: "pending" });
    pending.length === 2
      ? pass(`Both requests pending simultaneously (count: ${pending.length})`)
      : fail(`Expected 2 pending requests, got ${pending.length}`);
  } catch (err) {
    fail("tutee2 requestBooking threw: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3 — Duplicate request blocked
// ═══════════════════════════════════════════════════════════════════════════
async function test3_duplicateBlocked() {
  section("TEST 3 — Duplicate request from tutee1 is blocked");
  try {
    await callFn("requestBooking", {
      tutorId:       "user-tutor-001",
      slotId:        "slot-recurring-mon",
      subject:       "Mathematics",
      scheduledDate: "2026-03-23",
    }, tutee1Token);
    fail("Should have been rejected as duplicate");
  } catch (err) {
    err.message.includes("already") || err.code === "ALREADY_EXISTS"
      ? pass(`Duplicate blocked correctly: "${err.message}"`)
      : fail("Wrong error for duplicate: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4 — Tutor accepts Tutee1's request → session created, Tutee2 auto-rejected
// ═══════════════════════════════════════════════════════════════════════════
async function test4_acceptRequest() {
  section("TEST 4 — Tutor accepts Tutee1's request");
  try {
    const result = await callFn("respondToBooking", {
      requestId: global.req1Id,
      action:    "accept",
    }, tutorToken);

    // result should have sessionId
    if (result?.sessionId) {
      pass(`Session created: ${result.sessionId}`);
      global.sessionId = result.sessionId;
    } else {
      fail("No sessionId returned", JSON.stringify(result));
    }

    // Verify req1 is now accepted
    const req1 = await getDoc(`bookingRequests/${global.req1Id}`);
    req1.status === "accepted"  ? pass("req1 status === 'accepted'")  : fail("req1 status wrong: " + req1?.status);
    req1.sessionId === global.sessionId ? pass("req1.sessionId matches") : fail("req1.sessionId mismatch");

    // Verify req2 (tutee2) is auto-rejected
    const req2 = await getDoc(`bookingRequests/${global.req2Id}`);
    req2.status === "rejected"              ? pass("req2 auto-rejected (status='rejected')")        : fail("req2 not auto-rejected: " + req2?.status);
    req2.rejectionReason === "slot_taken"   ? pass("req2.rejectionReason === 'slot_taken'")         : fail("rejectionReason wrong: " + req2?.rejectionReason);

    // Verify session document
    const session = await getDoc(`sessions/${global.sessionId}`);
    session                             ? pass("Session doc exists")                             : fail("Session doc missing");
    session?.tuteeId === "user-tutee-001" ? pass("session.tuteeId = tutee1")                   : fail("session.tuteeId wrong: " + session?.tuteeId);
    session?.tutorId === "user-tutor-001" ? pass("session.tutorId = tutor1")                   : fail("session.tutorId wrong: " + session?.tutorId);
    session?.status  === "upcoming"       ? pass("session.status = 'upcoming'")                : fail("session.status wrong: " + session?.status);
    session?.subject === "Mathematics"    ? pass("session.subject = 'Mathematics'")            : fail("session.subject wrong: " + session?.subject);

    // Verify slot is marked booked for that date
    const slot = await getDoc(`users/user-tutor-001/availability/slot-recurring-mon`);
    slot?.bookedDates?.["2026-03-23"] === "user-tutee-001"
      ? pass("slot.bookedDates['2026-03-23'] = tutee1 ✓")
      : fail("slot not marked booked: " + JSON.stringify(slot?.bookedDates));
  } catch (err) {
    fail("respondToBooking (accept) threw: " + err.message + " | " + JSON.stringify(err.detail || ""));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5 — Cannot re-request an already-booked slot
// ═══════════════════════════════════════════════════════════════════════════
async function test5_cannotRequestBookedSlot() {
  section("TEST 5 — Tutee2 cannot request already-booked slot");
  try {
    await callFn("requestBooking", {
      tutorId:       "user-tutor-001",
      slotId:        "slot-recurring-mon",
      subject:       "Mathematics",
      scheduledDate: "2026-03-23",
    }, tutee2Token);
    fail("Should have been rejected — slot already booked");
  } catch (err) {
    err.message.includes("booked") || err.message.includes("already") || err.code === "ALREADY_EXISTS"
      ? pass(`Booked slot correctly blocked: "${err.message}"`)
      : fail("Wrong error for booked slot: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6 — Tutor manually rejects a pending request
// ═══════════════════════════════════════════════════════════════════════════
async function test6_manualReject() {
  section("TEST 6 — Tutor manually rejects a different pending request");

  // First: tutee1 requests the Tuesday slot
  let newReqId;
  try {
    const r = await callFn("requestBooking", {
      tutorId:       "user-tutor-001",
      slotId:        "slot-recurring-tue",
      subject:       "Calculus",
      scheduledDate: "2026-03-24",
    }, tutee1Token);
    newReqId = r.requestId;
    pass(`Tuesday request created: ${newReqId}`);
  } catch (err) {
    fail("Could not create Tuesday request: " + err.message);
    return;
  }

  // Tutor rejects it
  try {
    const result = await callFn("respondToBooking", {
      requestId: newReqId,
      action:    "reject",
    }, tutorToken);
    result?.success ? pass("reject returned success:true") : fail("No success in reject response: " + JSON.stringify(result));

    const req = await getDoc(`bookingRequests/${newReqId}`);
    req.status === "rejected"               ? pass("status === 'rejected'")                         : fail("status wrong: " + req?.status);
    req.rejectionReason === "tutor_declined"? pass("rejectionReason === 'tutor_declined'")          : fail("rejectionReason wrong: " + req?.rejectionReason);

    // Slot should NOT be booked
    const slot = await getDoc(`users/user-tutor-001/availability/slot-recurring-tue`);
    !slot?.bookedDates?.["2026-03-24"]
      ? pass("Slot remains unbooked after rejection")
      : fail("Slot was incorrectly marked booked");
  } catch (err) {
    fail("respondToBooking (reject) threw: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7 — Tutee cancels their own pending request
// ═══════════════════════════════════════════════════════════════════════════
async function test7_tuteeCancel() {
  section("TEST 7 — Tutee cancels their own pending request");

  // tutee2 requests Wednesday one-off slot
  let cancelReqId;
  try {
    const r = await callFn("requestBooking", {
      tutorId:       "user-tutor-001",
      slotId:        "slot-oneoff-wed",
      subject:       "Algebra",
      scheduledDate: "2026-03-18",
    }, tutee2Token);
    cancelReqId = r.requestId;
    pass(`Wed request created: ${cancelReqId}`);
  } catch (err) {
    fail("Could not create Wed request: " + err.message);
    return;
  }

  // tutee2 cancels it
  try {
    const result = await callFn("cancelBookingRequest", {
      requestId: cancelReqId,
    }, tutee2Token);
    result?.success ? pass("cancel returned success:true") : fail("No success in cancel response");

    const req = await getDoc(`bookingRequests/${cancelReqId}`);
    req.status === "cancelled"? pass("status === 'cancelled'") : fail("status wrong: " + req?.status);
  } catch (err) {
    fail("cancelBookingRequest threw: " + err.message);
  }

  // tutee1 cannot cancel tutee2's request
  try {
    await callFn("cancelBookingRequest", { requestId: cancelReqId }, tutee1Token);
    fail("tutee1 should not be able to cancel tutee2's request");
  } catch (err) {
    err.message.toLowerCase().includes("permission") || err.message.toLowerCase().includes("not your") || err.message.toLowerCase().includes("only cancel your own")
      ? pass(`Cross-user cancel blocked: "${err.message}"`)
      : fail("Wrong error for cross-cancel: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8 — Cannot accept an already-accepted request (double-accept guard)
// ═══════════════════════════════════════════════════════════════════════════
async function test8_doubleAcceptGuard() {
  section("TEST 8 — Double-accept guard (idempotency)");
  try {
    await callFn("respondToBooking", {
      requestId: global.req1Id,
      action:    "accept",
    }, tutorToken);
    fail("Should have rejected second accept");
  } catch (err) {
    (err.message.includes("already") || err.message.includes("not pending") || err.code === "FAILED_PRECONDITION")
      ? pass(`Double-accept blocked: "${err.message}"`)
      : fail("Wrong error for double-accept: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
(async () => {
  console.log("\n🚀  Booking Request Queue — Emulator Integration Tests");
  console.log("   Emulators: Auth :9099 | Functions :5001 | Firestore :8080\n");

  try {
    await getTokens();
    await test1_submitRequest();
    await test2_concurrentRequest();
    await test3_duplicateBlocked();
    await test4_acceptRequest();
    await test5_cannotRequestBookedSlot();
    await test6_manualReject();
    await test7_tuteeCancel();
    await test8_doubleAcceptGuard();
  } catch (err) {
    console.error("\n💥 Unhandled test error:", err);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`   Results: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
