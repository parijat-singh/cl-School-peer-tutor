import { describe, it, expect } from "vitest";
import { DAYS_OF_WEEK, type DayOfWeek } from "./types";

describe("types", () => {
  describe("DAYS_OF_WEEK", () => {
    it("has 7 days", () => {
      expect(DAYS_OF_WEEK).toHaveLength(7);
    });

    it("starts with Monday and ends with Sunday", () => {
      expect(DAYS_OF_WEEK[0]).toBe("Monday");
      expect(DAYS_OF_WEEK[6]).toBe("Sunday");
    });

    it("has no duplicates", () => {
      const set = new Set(DAYS_OF_WEEK);
      expect(set.size).toBe(DAYS_OF_WEEK.length);
    });

    it("each value is a non-empty string", () => {
      DAYS_OF_WEEK.forEach((day) => {
        expect(typeof day).toBe("string");
        expect(day.length).toBeGreaterThan(0);
      });
    });
  });

  describe("DayOfWeek", () => {
    it("DAYS_OF_WEEK values are valid day names", () => {
      const valid: DayOfWeek[] = [
        "Monday", "Tuesday", "Wednesday", "Thursday",
        "Friday", "Saturday", "Sunday",
      ];
      DAYS_OF_WEEK.forEach((day) => {
        expect(valid).toContain(day);
      });
    });
  });
});
