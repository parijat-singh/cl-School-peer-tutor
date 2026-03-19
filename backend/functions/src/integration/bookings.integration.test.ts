/**
 * Integration tests for booking callables against Firebase emulators.
 * Run after emulators are started and seeded: bash scripts/seed-emulator.sh
 *
 * Run: npm run test:integration (from backend/functions)
 * Or in CI: after "Seed test data" in the e2e job.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  signIn,
  callFunction,
  getFirestoreDoc,
  getNextMonday,
  emulatorsReachable,
} from "./emulator-client";

const TUTEE_EMAIL = "tutee1@lincoln.edu";
const TUTEE_PASS = "Test1234!";
const TUTOR_EMAIL = "tutor1@lincoln.edu";
const TUTOR_PASS = "Test1234!";
const TUTOR_ID = "user-tutor-001";
const TUTEE_ID = "user-tutee-001";
const SLOT_ID = "slot-001";
const SUBJECT = "Algebra";

describe("Bookings integration (emulators)", () => {
  let tuteeToken: string;
  let tutorToken: string;
  let nextMonday: string;
  let createdRequestId: string | null = null;

  beforeAll(async () => {
    const ok = await emulatorsReachable();
    if (!ok) {
      throw new Error(
        "Emulators not reachable. Start with: firebase emulators:start --only auth,firestore,functions then run scripts/seed-emulator.sh"
      );
    }
    nextMonday = getNextMonday();
    tuteeToken = await signIn(TUTEE_EMAIL, TUTEE_PASS);
    tutorToken = await signIn(TUTOR_EMAIL, TUTOR_PASS);
  });

  it("requestBooking returns requestId and creates pending booking request", async () => {
    const { result, error } = await callFunction<{ requestId: string }>("requestBooking", {
      tutorId: TUTOR_ID,
      slotId: SLOT_ID,
      scheduledDate: nextMonday,
      subject: SUBJECT,
    }, tuteeToken);

    expect(error).toBeUndefined();
    expect(result?.requestId).toBeDefined();
    expect(typeof result?.requestId).toBe("string");

    const req = await getFirestoreDoc(`bookingRequests/${result!.requestId}`);
    expect(req).not.toBeNull();
    expect(req?.status).toBe("pending");
    expect(req?.tuteeId).toBe(TUTEE_ID);
    expect(req?.tutorId).toBe(TUTOR_ID);
    expect(req?.slotId).toBe(SLOT_ID);
    expect(req?.scheduledDate).toBe(nextMonday);

    createdRequestId = result!.requestId;
  });

  it("requestBooking without auth returns unauthenticated error", async () => {
    const { result, error } = await callFunction("requestBooking", {
      tutorId: TUTOR_ID,
      slotId: SLOT_ID,
      scheduledDate: nextMonday,
      subject: SUBJECT,
    }, "");

    expect(result).toBeUndefined();
    expect(error?.message).toBeDefined();
    expect(String(error?.message).toLowerCase()).toMatch(/sign in|unauthenticated/);
  });

  it("requestBooking with invalid scheduledDate returns invalid-argument", async () => {
    const { result, error } = await callFunction("requestBooking", {
      tutorId: TUTOR_ID,
      slotId: SLOT_ID,
      scheduledDate: "not-a-date",
      subject: SUBJECT,
    }, tuteeToken);

    expect(result).toBeUndefined();
    expect(error?.message).toBeDefined();
  });

  it("cancelBookingRequest cancels own pending request", async () => {
    expect(createdRequestId).not.toBeNull();
    expect(typeof createdRequestId).toBe("string");
    const requestId = createdRequestId!;

    const { result: cancelResult, error } = await callFunction<{ success: boolean }>(
      "cancelBookingRequest",
      { requestId },
      tuteeToken
    );

    expect(error).toBeUndefined();
    expect(cancelResult?.success).toBe(true);

    const req = await getFirestoreDoc(`bookingRequests/${requestId}`);
    expect(req?.status).toBe("cancelled");

    createdRequestId = null;
  });

  it("cancelBookingRequest as non-owner returns permission-denied", async () => {
    const { result: reqResult } = await callFunction<{ requestId: string }>("requestBooking", {
      tutorId: TUTOR_ID,
      slotId: SLOT_ID,
      scheduledDate: nextMonday,
      subject: SUBJECT,
    }, tuteeToken);
    const requestId = reqResult!.requestId;

    const { result, error } = await callFunction("cancelBookingRequest", { requestId }, tutorToken);

    expect(result).toBeUndefined();
    expect(error?.message).toBeDefined();
    expect(String(error?.message).toLowerCase()).toMatch(/own|cancel|permission/);

    // Clean up: cancel as tutee so next test can create a fresh request for same slot/date
    await callFunction("cancelBookingRequest", { requestId }, tuteeToken);
  });

  it("respondToBooking accept creates session and updates request", async () => {
    const { result: reqResult } = await callFunction<{ requestId: string }>("requestBooking", {
      tutorId: TUTOR_ID,
      slotId: SLOT_ID,
      scheduledDate: nextMonday,
      subject: SUBJECT,
    }, tuteeToken);
    const requestId = reqResult!.requestId;

    const { result: acceptResult, error } = await callFunction<{ sessionId: string }>(
      "respondToBooking",
      { requestId, action: "accept" },
      tutorToken
    );

    expect(error).toBeUndefined();
    expect(acceptResult?.sessionId).toBeDefined();

    const req = await getFirestoreDoc(`bookingRequests/${requestId}`);
    expect(req?.status).toBe("accepted");
    expect(req?.sessionId).toBe(acceptResult!.sessionId);

    const session = await getFirestoreDoc(`sessions/${acceptResult!.sessionId}`);
    expect(session?.status).toBe("upcoming");
    expect(session?.tutorId).toBe(TUTOR_ID);
    expect(session?.tuteeId).toBe(TUTEE_ID);
  });

  it("respondToBooking without auth returns unauthenticated error", async () => {
    const { result, error } = await callFunction("respondToBooking", {
      requestId: "any-id",
      action: "accept",
    }, "");

    expect(result).toBeUndefined();
    expect(error?.message).toBeDefined();
    expect(String(error?.message).toLowerCase()).toMatch(/sign in|unauthenticated/);
  });

  it("respondToBooking reject updates request status", async () => {
    // Use slot-001 with a different (unbooked) recurring date to avoid conflict
    // with the accepted request created earlier in this suite.
    const addDaysToIsoDate = (isoDate: string, days: number): string => {
      const d = new Date(isoDate + "T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const anotherMonday = addDaysToIsoDate(nextMonday, 7);

    const { result: reqResult } = await callFunction<{ requestId: string }>("requestBooking", {
      tutorId: TUTOR_ID,
      slotId: SLOT_ID,
      scheduledDate: anotherMonday,
      subject: SUBJECT,
    }, tuteeToken);
    const requestId = reqResult!.requestId;

    const { result, error } = await callFunction("respondToBooking", {
      requestId,
      action: "reject",
      rejectionReason: "Not available that day",
    }, tutorToken);

    expect(error).toBeUndefined();

    const req = await getFirestoreDoc(`bookingRequests/${requestId}`);
    expect(req?.status).toBe("rejected");
  });
});
