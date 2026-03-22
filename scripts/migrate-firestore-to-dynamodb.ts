#!/usr/bin/env npx tsx
/**
 * Migrate all data from Firestore to DynamoDB.
 *
 * Prerequisites:
 *   1. Firebase Admin SDK credentials (GOOGLE_APPLICATION_CREDENTIALS env var or default)
 *   2. AWS credentials configured for the target region
 *   3. DynamoDB tables already created via Terraform
 *
 * Usage:
 *   npx tsx scripts/migrate-firestore-to-dynamodb.ts
 *   npx tsx scripts/migrate-firestore-to-dynamodb.ts --dry-run   # Preview without writing
 *
 * The script reads all Firestore collections and writes to the corresponding
 * DynamoDB tables. It handles:
 *   - Timestamp → ISO string conversion
 *   - Subcollection flattening (users/{uid}/availability → availability-slots table)
 *   - Batch writes in chunks of 25 (DynamoDB limit)
 *   - Idempotent — safe to re-run (overwrites existing items)
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  DynamoDBClient,
  BatchWriteItemCommand,
  type WriteRequest,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

// ── Config ──────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
const PREFIX = process.env.TABLE_PREFIX ?? "peertutor";

const TABLES = {
  users:               `${PREFIX}-users`,
  "availability-slots": `${PREFIX}-availability-slots`,
  sessions:            `${PREFIX}-sessions`,
  "booking-requests":  `${PREFIX}-booking-requests`,
  reviews:             `${PREFIX}-reviews`,
  schools:             `${PREFIX}-schools`,
  stats:               `${PREFIX}-stats`,
  "email-verifications": `${PREFIX}-email-verifications`,
  "rate-limits":       `${PREFIX}-rate-limits`,
  "admin-audit-log":   `${PREFIX}-admin-audit-log`,
  "contact-submissions": `${PREFIX}-contact-submissions`,
} as const;

// ── Initialize services ─────────────────────────────────────────

import { readFileSync } from "fs";

if (getApps().length === 0) {
  // Support both inline JSON and file path for credentials
  let credJson: Record<string, unknown>;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    credJson = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credJson = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  } else {
    throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS (file path) or GOOGLE_APPLICATION_CREDENTIALS_JSON (inline)");
  }
  initializeApp({ credential: cert(credJson as Parameters<typeof cert>[0]) });
}
const firestore = getFirestore();
const dynamodb = new DynamoDBClient({ region: AWS_REGION });

// ── Helpers ─────────────────────────────────────────────────────

function convertValue(val: unknown): unknown {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return val.map(convertValue);
  if (val !== null && typeof val === "object") {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, convertValue(v)]),
    );
  }
  return val;
}

function convertDoc(doc: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    converted[key] = convertValue(value);
  }
  return converted;
}

async function batchWriteToDynamo(tableName: string, items: Record<string, unknown>[]): Promise<number> {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would write ${items.length} items to ${tableName}`);
    return items.length;
  }

  let written = 0;
  // DynamoDB BatchWriteItem limit is 25 items per request
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    const requests: WriteRequest[] = batch.map((item) => ({
      PutRequest: { Item: marshall(item, { removeUndefinedValues: true }) },
    }));

    let unprocessed = requests;
    let retries = 0;

    while (unprocessed.length > 0 && retries < 5) {
      const result = await dynamodb.send(
        new BatchWriteItemCommand({
          RequestItems: { [tableName]: unprocessed },
        }),
      );

      const failed = result.UnprocessedItems?.[tableName] ?? [];
      written += unprocessed.length - failed.length;
      unprocessed = failed;

      if (unprocessed.length > 0) {
        retries++;
        const delay = Math.min(1000 * Math.pow(2, retries), 10000);
        console.log(`  Retrying ${unprocessed.length} unprocessed items (attempt ${retries})...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (unprocessed.length > 0) {
      console.error(`  ERROR: ${unprocessed.length} items failed after 5 retries in ${tableName}`);
    }
  }

  return written;
}

// ── Collection migration functions ──────────────────────────────

async function migrateCollection(
  collectionName: string,
  tableName: string,
  transform?: (doc: Record<string, unknown>, docId: string) => Record<string, unknown>,
): Promise<number> {
  console.log(`\nMigrating ${collectionName} → ${tableName}...`);
  const snapshot = await firestore.collection(collectionName).get();
  console.log(`  Found ${snapshot.size} documents`);

  const items: Record<string, unknown>[] = [];
  for (const doc of snapshot.docs) {
    const converted = convertDoc(doc);
    if (!converted) continue;

    const item = transform ? transform(converted, doc.id) : converted;
    items.push(item);
  }

  const written = await batchWriteToDynamo(tableName, items);
  console.log(`  ✓ Migrated ${written} items`);
  return written;
}

async function migrateAvailabilitySlots(): Promise<number> {
  console.log("\nMigrating users/*/availability → availability-slots...");
  const tableName = TABLES["availability-slots"];

  const usersSnapshot = await firestore.collection("users").get();
  const items: Record<string, unknown>[] = [];

  for (const userDoc of usersSnapshot.docs) {
    const slotsSnapshot = await firestore
      .collection("users")
      .doc(userDoc.id)
      .collection("availability")
      .get();

    for (const slotDoc of slotsSnapshot.docs) {
      const converted = convertDoc(slotDoc);
      if (!converted) continue;

      items.push({
        ...converted,
        tutorId: userDoc.id,
        slotId: slotDoc.id,
      });
    }
  }

  console.log(`  Found ${items.length} availability slots across ${usersSnapshot.size} users`);
  const written = await batchWriteToDynamo(tableName, items);
  console.log(`  ✓ Migrated ${written} availability slots`);
  return written;
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║  PeerTutor: Firestore → DynamoDB Migration       ║");
  console.log(`║  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE (writing to DynamoDB)"}        ║`);
  console.log(`║  Region: ${AWS_REGION}                                ║`);
  console.log(`║  Table prefix: ${PREFIX}                          ║`);
  console.log("╚═══════════════════════════════════════════════════╝");

  const totals: Record<string, number> = {};

  // 1. Schools (no transform needed — domain is already the PK)
  totals.schools = await migrateCollection("schools", TABLES.schools, (doc, id) => ({
    ...doc,
    domain: doc.domain ?? id,
  }));

  // 2. Users (uid is the PK)
  totals.users = await migrateCollection("users", TABLES.users, (doc, id) => ({
    ...doc,
    uid: doc.uid ?? id,
  }));

  // 3. Availability slots (subcollection → flat table)
  totals.availabilitySlots = await migrateAvailabilitySlots();

  // 4. Sessions
  totals.sessions = await migrateCollection("sessions", TABLES.sessions, (doc, id) => ({
    ...doc,
    sessionId: doc.sessionId ?? id,
  }));

  // 5. Booking requests
  totals.bookingRequests = await migrateCollection("bookingRequests", TABLES["booking-requests"], (doc, id) => ({
    ...doc,
    requestId: doc.requestId ?? id,
  }));

  // 6. Reviews
  totals.reviews = await migrateCollection("reviews", TABLES.reviews, (doc, id) => ({
    ...doc,
    reviewId: doc.reviewId ?? id,
  }));

  // 7. Stats (schoolDomain is the PK)
  totals.stats = await migrateCollection("stats", TABLES.stats, (doc, id) => ({
    ...doc,
    schoolDomain: doc.schoolDomain ?? id,
  }));

  // 8. Admin audit log
  totals.auditLog = await migrateCollection("adminAuditLog", TABLES["admin-audit-log"], (doc, id) => ({
    ...doc,
    // Composite sort key: timestamp#logId
    logId: doc.logId ?? id,
  }));

  // 9. Contact submissions
  totals.contactSubmissions = await migrateCollection("contactSubmissions", TABLES["contact-submissions"], (doc, id) => ({
    ...doc,
    submissionId: doc.submissionId ?? id,
  }));

  // 10. Email verifications (likely empty in production — TTL cleans them)
  totals.emailVerifications = await migrateCollection("emailVerifications", TABLES["email-verifications"], (doc, id) => ({
    ...doc,
    uid: doc.uid ?? id,
  }));

  // 11. Rate limits (likely empty — TTL cleans them)
  totals.rateLimits = await migrateCollection("rateLimits", TABLES["rate-limits"], (doc, id) => ({
    ...doc,
    key: doc.key ?? id,
  }));

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("  Migration Summary");
  console.log("════════════════════════════════════════");
  for (const [name, count] of Object.entries(totals)) {
    console.log(`  ${name}: ${count} items`);
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(`\n  Total: ${total} items migrated`);
  if (DRY_RUN) console.log("  (DRY RUN — no data was written)");
  console.log("════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
