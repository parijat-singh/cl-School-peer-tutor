/**
 * Pure helpers for slot availability. Used by searchTutors and unit tests.
 */

/**
 * For a recurring slot on a given weekday, returns true if at least one occurrence
 * in the next `weeksAhead` weeks is available (not cancelled and not booked).
 */
export function isRecurringSlotAvailable(
  cancelledDates: string[],
  bookedDates: Record<string, string>,
  day: string,
  referenceDate: string,
  weeksAhead: number = 4
): boolean {
  const cancelled = new Set(cancelledDates ?? []);
  // Parse as local noon to avoid UTC midnight shifting weekday
  const ref = new Date(referenceDate + "T12:00:00");
  for (let w = 0; w < weeksAhead; w++) {
    const d = new Date(ref);
    d.setDate(d.getDate() + w * 7);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dayNum = String(d.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${dayNum}`;
    const dayName = d.toLocaleDateString("en-GB", { weekday: "long" });
    if (dayName !== day) continue;
    if (cancelled.has(dateStr)) continue;
    if (bookedDates[dateStr]) continue;
    return true;
  }
  return false;
}
