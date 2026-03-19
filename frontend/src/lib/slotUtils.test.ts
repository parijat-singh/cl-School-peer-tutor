/**
 * Unit tests for slot availability logic (pure functions).
 */

import { describe, it, expect } from "vitest";
import { isRecurringSlotAvailable } from "./slotUtils";

const REF = "2025-03-18"; // Tuesday

describe("slotUtils (recurring availability)", () => {
  it("returns true when no cancellations or bookings", () => {
    expect(
      isRecurringSlotAvailable([], {}, "Tuesday", REF, 4)
    ).toBe(true);
  });

  it("returns false when all next occurrences are cancelled", () => {
    const cancelled = ["2025-03-18", "2025-03-25", "2025-04-01", "2025-04-08"];
    expect(
      isRecurringSlotAvailable(cancelled, {}, "Tuesday", REF, 4)
    ).toBe(false);
  });

  it("returns true when at least one Tuesday is free", () => {
    const cancelled = ["2025-03-18"];
    expect(
      isRecurringSlotAvailable(cancelled, {}, "Tuesday", REF, 4)
    ).toBe(true);
  });

  it("returns false when all next occurrences are booked", () => {
    const booked = {
      "2025-03-18": "uid1",
      "2025-03-25": "uid2",
      "2025-04-01": "uid3",
      "2025-04-08": "uid4",
    };
    expect(
      isRecurringSlotAvailable([], booked, "Tuesday", REF, 4)
    ).toBe(false);
  });
});
