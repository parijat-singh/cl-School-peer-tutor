import { describe, it, expect, vi } from "vitest";

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    fromDate: vi.fn((d: Date) => ({ toDate: () => d, _date: d })),
  },
}));

import { dateOnlyToTimestamp, dateOnlyToNoonUtcDate } from "./dates";

describe("dateOnlyToTimestamp", () => {
  it("returns a Timestamp at noon UTC for a valid date string", () => {
    const result = dateOnlyToTimestamp("2024-06-15");
    const d = result.toDate();
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(5); // June = 5
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(12);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
  });

  it("throws on invalid date format (missing day)", () => {
    expect(() => dateOnlyToTimestamp("2024-06")).toThrow("Invalid date-only string");
  });

  it("throws on invalid date format (extra content)", () => {
    expect(() => dateOnlyToTimestamp("2024-06-15T00:00")).toThrow("Invalid date-only string");
  });

  it("throws on empty string", () => {
    expect(() => dateOnlyToTimestamp("")).toThrow("Invalid date-only string");
  });
});

describe("dateOnlyToNoonUtcDate", () => {
  it("returns a Date at noon UTC for a valid date string", () => {
    const result = dateOnlyToNoonUtcDate("2024-06-15");
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCHours()).toBe(12);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth()).toBe(5);
    expect(result.getUTCDate()).toBe(15);
  });

  it("throws on invalid format", () => {
    expect(() => dateOnlyToNoonUtcDate("not-a-date")).toThrow("Invalid date-only string");
  });
});
