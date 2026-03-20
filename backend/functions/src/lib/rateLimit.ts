import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";

/**
 * Firestore-backed per-UID rate limiter.
 *
 * This works across cold starts and multiple instances (unlike in-memory Maps).
 * Data model:
 *   rateLimits/{key} => { count: number, resetAt: Timestamp }
 */
export async function checkAndConsumeRateLimit(params: {
  key: string;           // e.g. `bookSession:${uid}`
  limit: number;         // max hits per window
  windowMs: number;      // window size
}): Promise<boolean> {
  const now = Date.now();
  const ref = db.collection("rateLimits").doc(params.key);

  return await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const data = snap.exists ? snap.data() as { count?: number; resetAt?: { toMillis?: () => number } } : {};

    const resetAtMs = data.resetAt?.toMillis ? data.resetAt.toMillis() : 0;
    const isExpired = !resetAtMs || now > resetAtMs;

    if (isExpired) {
      txn.set(ref, {
        count: 1,
        resetAt: new Date(now + params.windowMs),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    }

    const count = typeof data.count === "number" ? data.count : 0;
    if (count >= params.limit) return false;

    txn.set(ref, {
      count: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

