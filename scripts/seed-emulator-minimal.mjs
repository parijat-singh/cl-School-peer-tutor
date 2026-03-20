#!/usr/bin/env node
/**
 * Minimal emulator seeding for local integration tests.
 *
 * Creates ONLY the documents/accounts required by:
 * - backend/functions/src/integration/bookings.integration.test.ts
 * - frontend/src/integration/firebase-emulator.integration.test.ts
 *
 * Assumes Firebase emulators are already running on:
 * - Auth:        http://localhost:9099
 * - Firestore:  http://localhost:8090
 */

const PROJECT_ID = "peertutor-dev";

const FIRESTORE_REST_BASE = `http://localhost:8090/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_ADMIN_BASE = `http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`;

const FIRESTORE_CLEAR = `http://localhost:8090/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_CLEAR = `http://localhost:9099/emulator/v1/projects/${PROJECT_ID}/accounts`;

function asFirestoreFields(obj) {
  // Convenience: convert a plain "value"-like object into Firestore REST "fields" where needed.
  // We intentionally keep this minimal: only types we need are supported.
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) fields[k] = { nullValue: null };
    else if (typeof v === "string") fields[k] = { stringValue: v };
    else if (typeof v === "boolean") fields[k] = { booleanValue: v };
    else if (typeof v === "number" && Number.isInteger(v)) fields[k] = { integerValue: String(v) };
    else if (typeof v === "number") fields[k] = { doubleValue: String(v) };
    else throw new Error(`Unsupported field type for ${k}: ${typeof v}`);
  }
  return fields;
}

async function clearAll() {
  // Firestore
  await fetch(FIRESTORE_CLEAR, {
    method: "DELETE",
    headers: { Authorization: "Bearer owner" },
  }).catch(() => {});

  // Auth
  await fetch(AUTH_CLEAR, {
    method: "DELETE",
    headers: { Authorization: "Bearer owner" },
  }).catch(() => {});
}

async function patchDoc(docPath, fields) {
  const url = `${FIRESTORE_REST_BASE}/${docPath}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer owner",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Failed PATCH ${docPath}: ${res.status} ${t}`);
  }
}

async function createAuthUser({ email, password, localId, displayName }) {
  const res = await fetch(`${AUTH_ADMIN_BASE}/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer owner",
    },
    body: JSON.stringify({
      email,
      password,
      localId,
      displayName,
      emailVerified: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Failed create auth user ${email}: ${res.status} ${t}`);
  }
}

async function main() {
  // Quick connectivity check
  const [authOk, fsOk] = await Promise.all([
    fetch("http://localhost:9099/", { method: "GET" }).then((r) => r.ok).catch(() => false),
    fetch("http://localhost:8090/", { method: "GET" }).then((r) => r.ok).catch(() => false),
  ]);
  if (!authOk || !fsOk) {
    throw new Error(
      "Emulators not reachable. Start Firebase emulators first (Auth + Firestore)."
    );
  }

  console.log("Clearing emulator data...");
  await clearAll();

  const SCHOOL_DOMAIN = "lincoln.edu";
  const TUTOR_ID = "user-tutor-001";
  const TUTEE_ID = "user-tutee-001";

  console.log("Seeding Firestore docs...");
  await patchDoc(`schools/${SCHOOL_DOMAIN}`, asFirestoreFields({
    domain: SCHOOL_DOMAIN,
    name: "Lincoln High School",
    approved: true,
    status: "approved",
  }));

  await patchDoc(`users/${TUTOR_ID}`, asFirestoreFields({
    uid: TUTOR_ID,
    name: "Marcus Johnson",
    email: "tutor1@lincoln.edu",
    role: "tutor",
    schoolDomain: SCHOOL_DOMAIN,
    status: "active",
  }));

  await patchDoc(`users/${TUTEE_ID}`, asFirestoreFields({
    uid: TUTEE_ID,
    name: "Alex Kim",
    email: "tutee1@lincoln.edu",
    role: "tutee",
    schoolDomain: SCHOOL_DOMAIN,
    status: "active",
  }));

  // Availability slot: slot-001 recurring Monday 15:00-16:00, unbooked.
  await patchDoc(`users/${TUTOR_ID}/availability/slot-001`, {
    id: { stringValue: "slot-001" },
    recurring: { booleanValue: true },
    day: { stringValue: "Monday" },
    startTime: { stringValue: "15:00" },
    endTime: { stringValue: "16:00" },
    duration: { integerValue: "60" },
    booked: { booleanValue: false },
    bookedDates: { mapValue: { fields: {} } },
    cancelledDates: { arrayValue: { values: [] } },
    schoolDomain: { stringValue: SCHOOL_DOMAIN },
  });

  console.log("Seeding Auth users...");
  await createAuthUser({
    email: "tutor1@lincoln.edu",
    password: "Test1234!",
    localId: TUTOR_ID,
    displayName: "Marcus Johnson",
  });
  await createAuthUser({
    email: "tutee1@lincoln.edu",
    password: "Test1234!",
    localId: TUTEE_ID,
    displayName: "Alex Kim",
  });

  console.log("Minimal seed complete ✅");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

