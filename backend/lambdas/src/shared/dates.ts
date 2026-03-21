// Date utility helpers (Timestamp-free, uses ISO strings).

/**
 * Parse a date-only string (YYYY-MM-DD) into a noon UTC ISO string.
 * Noon UTC avoids timezone-offset "previous day" issues.
 */
export function dateOnlyToIso(dateOnly: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error(`Invalid date-only string: ${dateOnly}`);
  }
  return `${dateOnly}T12:00:00.000Z`;
}

export function dateOnlyToNoonUtcDate(dateOnly: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error(`Invalid date-only string: ${dateOnly}`);
  }
  return new Date(`${dateOnly}T12:00:00.000Z`);
}
