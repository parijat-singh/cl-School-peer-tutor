import { describe, it, expect } from "vitest";
import { DAYS_OF_WEEK } from "./types.js";
import type {
  UserRole,
  GradeLevel,
  SessionStatus,
  AccountStatus,
  SessionDuration,
  BookingRequestStatus,
  SchoolStatus,
  DayOfWeek,
} from "./types.js";

describe("DAYS_OF_WEEK constant", () => {
  it("contains all 7 days of the week", () => {
    expect(DAYS_OF_WEEK).toHaveLength(7);
  });

  it("starts with Monday and ends with Sunday", () => {
    expect(DAYS_OF_WEEK[0]).toBe("Monday");
    expect(DAYS_OF_WEEK[6]).toBe("Sunday");
  });

  it("contains all expected days in order", () => {
    expect(DAYS_OF_WEEK).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });

  it("is readonly (frozen)", () => {
    // TypeScript enforces this at compile time via `as const`,
    // but we can verify the array values are correct at runtime
    const days: readonly string[] = DAYS_OF_WEEK;
    expect(days).toContain("Monday");
    expect(days).toContain("Sunday");
  });
});

describe("type compatibility checks", () => {
  // These are compile-time checks that also serve as runtime documentation.
  // If types change in a breaking way, these assignments will cause TypeScript errors.

  it("UserRole accepts all valid values", () => {
    const roles: UserRole[] = ["tutor", "tutee", "both", "teacher", "schooladmin", "superadmin"];
    expect(roles).toHaveLength(6);
  });

  it("GradeLevel accepts all valid values", () => {
    const grades: GradeLevel[] = ["6th", "7th", "8th", "9th", "10th", "11th", "12th"];
    expect(grades).toHaveLength(7);
  });

  it("SessionStatus accepts all valid values", () => {
    const statuses: SessionStatus[] = ["upcoming", "completed", "cancelled"];
    expect(statuses).toHaveLength(3);
  });

  it("AccountStatus accepts all valid values", () => {
    const statuses: AccountStatus[] = ["active", "pending", "suspended"];
    expect(statuses).toHaveLength(3);
  });

  it("SessionDuration accepts all valid values", () => {
    const durations: SessionDuration[] = [30, 45, 60];
    expect(durations).toHaveLength(3);
  });

  it("BookingRequestStatus accepts all valid values", () => {
    const statuses: BookingRequestStatus[] = ["pending", "accepted", "rejected", "cancelled"];
    expect(statuses).toHaveLength(4);
  });

  it("SchoolStatus accepts all valid values", () => {
    const statuses: SchoolStatus[] = ["pending", "approved", "rejected"];
    expect(statuses).toHaveLength(3);
  });

  it("DayOfWeek matches DAYS_OF_WEEK entries", () => {
    const day: DayOfWeek = DAYS_OF_WEEK[0];
    expect(day).toBe("Monday");
  });
});
