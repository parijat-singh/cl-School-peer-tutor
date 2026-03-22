import { describe, it, expect } from "vitest";
import { dateOnlyToIso, dateOnlyToNoonUtcDate } from "./dates.js";

describe("dateOnlyToIso", () => {
  it("converts a valid YYYY-MM-DD string to noon UTC ISO string", () => {
    expect(dateOnlyToIso("2025-01-15")).toBe("2025-01-15T12:00:00.000Z");
  });

  it("handles leap year date", () => {
    expect(dateOnlyToIso("2024-02-29")).toBe("2024-02-29T12:00:00.000Z");
  });

  it("handles year boundaries", () => {
    expect(dateOnlyToIso("2025-12-31")).toBe("2025-12-31T12:00:00.000Z");
    expect(dateOnlyToIso("2025-01-01")).toBe("2025-01-01T12:00:00.000Z");
  });

  it("throws for empty string", () => {
    expect(() => dateOnlyToIso("")).toThrow("Invalid date-only string");
  });

  it("throws for full ISO timestamp", () => {
    expect(() => dateOnlyToIso("2025-01-15T12:00:00Z")).toThrow("Invalid date-only string");
  });

  it("throws for MM-DD-YYYY format", () => {
    expect(() => dateOnlyToIso("01-15-2025")).toThrow("Invalid date-only string");
  });

  it("throws for date with slashes", () => {
    expect(() => dateOnlyToIso("2025/01/15")).toThrow("Invalid date-only string");
  });

  it("throws for partial date", () => {
    expect(() => dateOnlyToIso("2025-01")).toThrow("Invalid date-only string");
  });
});

describe("dateOnlyToNoonUtcDate", () => {
  it("returns a Date object at noon UTC", () => {
    const d = dateOnlyToNoonUtcDate("2025-06-15");
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCHours()).toBe(12);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(5); // June is 5 (zero-indexed)
    expect(d.getUTCDate()).toBe(15);
  });

  it("returns correct ISO string from the Date", () => {
    const d = dateOnlyToNoonUtcDate("2025-03-01");
    expect(d.toISOString()).toBe("2025-03-01T12:00:00.000Z");
  });

  it("throws for invalid format", () => {
    expect(() => dateOnlyToNoonUtcDate("not-a-date")).toThrow("Invalid date-only string");
  });

  it("throws for empty string", () => {
    expect(() => dateOnlyToNoonUtcDate("")).toThrow("Invalid date-only string");
  });
});
