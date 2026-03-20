/**
 * Unit tests for callable request schemas (validation).
 */

import { describe, it, expect } from "vitest";
import { bookSessionSchema } from "./bookSession";
import { requestBookingSchema } from "./requestBooking";
import { respondToBookingSchema } from "./respondToBooking";
import { cancelBookingRequestSchema } from "./cancelBookingRequest";

describe("bookSessionSchema", () => {
  it("accepts valid input", () => {
    const result = bookSessionSchema.safeParse({
      tutorId: "t1",
      slotId: "s1",
      subject: "Math",
      scheduledDate: "2025-04-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty tutorId", () => {
    const result = bookSessionSchema.safeParse({
      tutorId: "",
      slotId: "s1",
      subject: "Math",
      scheduledDate: "2025-04-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(bookSessionSchema.safeParse({})).toMatchObject({ success: false });
    expect(bookSessionSchema.safeParse({ tutorId: "t1" })).toMatchObject({ success: false });
  });
});

describe("requestBookingSchema", () => {
  it("accepts valid YYYY-MM-DD date", () => {
    const result = requestBookingSchema.safeParse({
      tutorId: "t1",
      slotId: "s1",
      subject: "Math",
      scheduledDate: "2025-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    expect(
      requestBookingSchema.safeParse({
        tutorId: "t1",
        slotId: "s1",
        subject: "Math",
        scheduledDate: "12/31/2025",
      })
    ).toMatchObject({ success: false });
    expect(
      requestBookingSchema.safeParse({
        tutorId: "t1",
        slotId: "s1",
        subject: "Math",
        scheduledDate: "2025-4-1",
      })
    ).toMatchObject({ success: false });
  });
});

describe("respondToBookingSchema", () => {
  it("accepts accept action", () => {
    const result = respondToBookingSchema.safeParse({
      requestId: "req1",
      action: "accept",
    });
    expect(result.success).toBe(true);
  });

  it("accepts reject with optional reason", () => {
    const result = respondToBookingSchema.safeParse({
      requestId: "req1",
      action: "reject",
      rejectionReason: "No longer available",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action", () => {
    const result = respondToBookingSchema.safeParse({
      requestId: "req1",
      action: "maybe",
    });
    expect(result.success).toBe(false);
  });
});

describe("cancelBookingRequestSchema", () => {
  it("accepts valid requestId", () => {
    const result = cancelBookingRequestSchema.safeParse({ requestId: "req1" });
    expect(result.success).toBe(true);
  });

  it("rejects empty requestId", () => {
    const result = cancelBookingRequestSchema.safeParse({ requestId: "" });
    expect(result.success).toBe(false);
  });
});
