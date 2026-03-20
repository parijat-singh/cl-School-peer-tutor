import { Timestamp } from "firebase-admin/firestore";

/**
 * Parse a Firestore "date-only" string (YYYY-MM-DD) into a Timestamp.
 *
 * We intentionally use noon UTC to avoid timezone-offset "previous day"
 * issues when storing/retrieving across regions and clients.
 */
export function dateOnlyToTimestamp(dateOnly: string): Timestamp {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error(`Invalid date-only string: ${dateOnly}`);
  }
  return Timestamp.fromDate(new Date(`${dateOnly}T12:00:00.000Z`));
}

export function dateOnlyToNoonUtcDate(dateOnly: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error(`Invalid date-only string: ${dateOnly}`);
  }
  return new Date(`${dateOnly}T12:00:00.000Z`);
}

