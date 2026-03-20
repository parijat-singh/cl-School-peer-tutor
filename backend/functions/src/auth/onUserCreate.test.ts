import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockUserGet, mockUserUpdate, mockSchoolGet, mockSetCustomUserClaims } = vi.hoisted(() => ({
  mockUserGet: vi.fn(),
  mockUserUpdate: vi.fn().mockResolvedValue(undefined),
  mockSchoolGet: vi.fn(),
  mockSetCustomUserClaims: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase-functions/v1", () => ({
  auth: { user: () => ({ onCreate: vi.fn((handler: any) => handler) }) },
}));

vi.mock("../lib/admin", () => ({
  auth: { setCustomUserClaims: mockSetCustomUserClaims },
  db: {
    collection: (name: string) => ({
      doc: () => ({
        get: name === "users" ? mockUserGet : mockSchoolGet,
        update: mockUserUpdate,
      }),
    }),
  },
}));

import { onUserCreate } from "./onUserCreate";
const handler = onUserCreate as any;

describe("onUserCreate", () => {
  beforeEach(() => {
    mockUserGet.mockReset();
    mockUserUpdate.mockReset().mockResolvedValue(undefined);
    mockSchoolGet.mockReset();
    mockSetCustomUserClaims.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("returns early when user has no email", async () => {
    const promise = handler({ uid: "u1" });
    vi.advanceTimersByTime(2100);
    await promise;
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("returns early when user doc not found", async () => {
    mockUserGet.mockResolvedValue({ exists: false });
    const promise = handler({ uid: "u1", email: "test@school.edu" });
    vi.advanceTimersByTime(2100);
    await promise;
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("sets superadmin claims for superadmin user", async () => {
    mockUserGet.mockResolvedValue({
      exists: true,
      data: () => ({ role: "superadmin", status: "active" }),
    });
    const promise = handler({ uid: "u1", email: "admin@school.edu" });
    vi.advanceTimersByTime(2100);
    await promise;
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u1", expect.objectContaining({
      role: "superadmin",
    }));
  });

  it("marks user pending if school not approved", async () => {
    mockUserGet.mockResolvedValue({
      exists: true,
      data: () => ({ role: "tutee", status: "pending" }),
    });
    mockSchoolGet.mockResolvedValue({ exists: true, data: () => ({ approved: false }) });
    const promise = handler({ uid: "u1", email: "test@bad.edu" });
    vi.advanceTimersByTime(2100);
    await promise;
    expect(mockUserUpdate).toHaveBeenCalledWith({ status: "pending" });
  });

  it("sets claims for approved school user", async () => {
    mockUserGet.mockResolvedValue({
      exists: true,
      data: () => ({ role: "tutee", status: "active" }),
    });
    mockSchoolGet.mockResolvedValue({ exists: true, data: () => ({ approved: true }) });
    const promise = handler({ uid: "u1", email: "test@school.edu" });
    vi.advanceTimersByTime(2100);
    await promise;
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("u1", expect.objectContaining({
      role: "tutee",
      schoolDomain: "school.edu",
    }));
  });
});
