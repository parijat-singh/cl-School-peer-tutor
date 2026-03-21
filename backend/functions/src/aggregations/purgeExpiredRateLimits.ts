// functions/src/aggregations/purgeExpiredRateLimits.ts
// Runs daily — deletes expired rate-limit documents to prevent unbounded growth.

import * as functions from "firebase-functions/v2/scheduler";
import { logger }       from "firebase-functions/v2";
import { db } from "../lib/admin";
import { captureError } from "../lib/sentry";

export const purgeExpiredRateLimits = functions.onSchedule(
  { schedule: "every 24 hours", region: "us-central1" },
  async () => {
    const now = new Date();
    const snapshot = await db
      .collection("rateLimits")
      .where("resetAt", "<", now)
      .limit(500)
      .get();

    if (snapshot.empty) {
      logger.info("No expired rate-limit docs to purge.");
      return;
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    try {
      await batch.commit();
      logger.info(`Purged ${snapshot.size} expired rate-limit docs.`);
    } catch (err) {
      captureError(err, { function: "purgeExpiredRateLimits", action: "batchDelete" });
    }
  }
);
