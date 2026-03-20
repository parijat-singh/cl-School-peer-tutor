import { describe, it, expect, vi } from "vitest";

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn((_fns: any, name: string) => {
    const fn = vi.fn();
    fn.displayName = name;
    return fn;
  }),
}));

vi.mock("./firebase", () => ({
  fns: {},
}));

import {
  bookSession,
  cancelSession,
  submitRating,
  deleteReview,
  suspendUser,
  unsuspendUser,
  exportSessions,
  registerSchool,
  addSchool,
  approveSchool,
  rejectSchool,
  removeSchool,
  promoteSuperAdmin,
  updateTutorProfile,
} from "./functions";

describe("functions", () => {
  it("exports all callable function wrappers", () => {
    expect(bookSession).toBeDefined();
    expect(cancelSession).toBeDefined();
    expect(submitRating).toBeDefined();
    expect(deleteReview).toBeDefined();
    expect(suspendUser).toBeDefined();
    expect(unsuspendUser).toBeDefined();
    expect(exportSessions).toBeDefined();
    expect(registerSchool).toBeDefined();
    expect(addSchool).toBeDefined();
    expect(approveSchool).toBeDefined();
    expect(rejectSchool).toBeDefined();
    expect(removeSchool).toBeDefined();
    expect(promoteSuperAdmin).toBeDefined();
    expect(updateTutorProfile).toBeDefined();
  });

  it("each export is a function", () => {
    const fns = [
      bookSession, cancelSession, submitRating, deleteReview,
      suspendUser, unsuspendUser, exportSessions, registerSchool,
      addSchool, approveSchool, rejectSchool, removeSchool,
      promoteSuperAdmin, updateTutorProfile,
    ];
    fns.forEach((fn) => {
      expect(typeof fn).toBe("function");
    });
  });
});
