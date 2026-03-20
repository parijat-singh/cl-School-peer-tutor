import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockOnSnapshot = vi.fn();
const mockAddDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockUploadBytes = vi.fn();
const mockGetDownloadURL = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: any, ...path: string[]) => ({ path: path.join("/") })),
  doc: vi.fn((_db: any, ...path: string[]) => ({ path: path.join("/") })),
  query: vi.fn((_col: any, ...constraints: any[]) => ({ constraints })),
  where: vi.fn((field: string, op: string, value: any) => ({ field, op, value })),
  orderBy: vi.fn((field: string, dir?: string) => ({ field, dir })),
  limit: vi.fn((n: number) => ({ limit: n })),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  deleteDoc: (...args: any[]) => mockDeleteDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({
    data: { ranked: [], aiPowered: false },
  })),
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: (...args: any[]) => mockUploadBytes(...args),
  getDownloadURL: (...args: any[]) => mockGetDownloadURL(...args),
}));

vi.mock("./firebase", () => ({
  db: {},
  storage: {},
  fns: {},
}));

import {
  getUserDoc,
  getSchoolDoc,
  flagReview,
  addAvailabilitySlot,
  removeAvailabilitySlot,
  cancelRecurringDate,
  uncancelRecurringDate,
  getTutorReviews,
  uploadSchoolLogo,
  updateSchoolProfile,
  searchTutors,
  subscribeUser,
  subscribeTutorSlots,
  subscribeUserSessions,
  subscribeTutorRequests,
  subscribeTuteeRequests,
  subscribeSchoolReviews,
  subscribeStats,
  subscribeAllSchools,
  subscribeAllSuperAdmins,
  updateAvailabilitySlot,
  getRecommendedTutors,
} from "./firestore";

describe("firestore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserDoc", () => {
    it("returns user data when doc exists", async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: "u1",
        data: () => ({ name: "John", email: "j@test.com" }),
      });
      const result = await getUserDoc("u1");
      expect(result).toEqual({ uid: "u1", name: "John", email: "j@test.com" });
    });

    it("returns null when doc does not exist", async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false, id: "u1" });
      const result = await getUserDoc("u1");
      expect(result).toBeNull();
    });
  });

  describe("getSchoolDoc", () => {
    it("returns school data when doc exists", async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ domain: "school.edu", name: "Test School" }),
      });
      const result = await getSchoolDoc("school.edu");
      expect(result).toEqual({ domain: "school.edu", name: "Test School" });
    });

    it("returns null when doc does not exist", async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      const result = await getSchoolDoc("unknown.edu");
      expect(result).toBeNull();
    });
  });

  describe("flagReview", () => {
    it("updates review with flagged status", async () => {
      mockUpdateDoc.mockResolvedValue(undefined);
      await flagReview("rev-1", "user-1");
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { flagged: true, flaggedBy: "user-1" }
      );
    });
  });

  describe("addAvailabilitySlot", () => {
    it("adds a one-off slot", async () => {
      mockAddDoc.mockResolvedValue({ id: "slot-1" });
      await addAvailabilitySlot("tutor-1", {
        day: "Monday",
        startTime: "10:00",
        endTime: "11:00",
        duration: 60,
        recurring: false,
        schoolDomain: "school.edu",
      } as any);
      expect(mockAddDoc).toHaveBeenCalled();
    });

    it("adds a recurring slot with bookedDates and cancelledDates", async () => {
      mockAddDoc.mockResolvedValue({ id: "slot-2" });
      await addAvailabilitySlot("tutor-1", {
        day: "Monday",
        startTime: "10:00",
        endTime: "11:00",
        duration: 60,
        recurring: true,
        schoolDomain: "school.edu",
      } as any);
      expect(mockAddDoc).toHaveBeenCalled();
      const callArg = mockAddDoc.mock.calls[0][1];
      expect(callArg).toHaveProperty("bookedDates");
      expect(callArg).toHaveProperty("cancelledDates");
    });
  });

  describe("removeAvailabilitySlot", () => {
    it("deletes the slot document", async () => {
      mockDeleteDoc.mockResolvedValue(undefined);
      await removeAvailabilitySlot("tutor-1", "slot-1");
      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });

  describe("cancelRecurringDate", () => {
    it("adds date to cancelledDates array", async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ cancelledDates: ["2024-06-01"] }),
      });
      mockUpdateDoc.mockResolvedValue(undefined);
      await cancelRecurringDate("tutor-1", "slot-1", "2024-06-08");
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { cancelledDates: ["2024-06-01", "2024-06-08"] }
      );
    });

    it("does nothing if date already cancelled", async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ cancelledDates: ["2024-06-08"] }),
      });
      await cancelRecurringDate("tutor-1", "slot-1", "2024-06-08");
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it("does nothing if slot does not exist", async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      await cancelRecurringDate("tutor-1", "slot-1", "2024-06-08");
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });
  });

  describe("uncancelRecurringDate", () => {
    it("removes date from cancelledDates array", async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ cancelledDates: ["2024-06-01", "2024-06-08"] }),
      });
      mockUpdateDoc.mockResolvedValue(undefined);
      await uncancelRecurringDate("tutor-1", "slot-1", "2024-06-08");
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { cancelledDates: ["2024-06-01"] }
      );
    });

    it("does nothing if slot does not exist", async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      await uncancelRecurringDate("tutor-1", "slot-1", "2024-06-08");
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });
  });

  describe("getTutorReviews", () => {
    it("returns reviews array", async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          { id: "r1", data: () => ({ stars: 5, text: "Great" }) },
          { id: "r2", data: () => ({ stars: 4, text: "Good" }) },
        ],
      });
      const reviews = await getTutorReviews("tutor-1", "school.edu");
      expect(reviews).toHaveLength(2);
      expect(reviews[0]).toEqual({ id: "r1", stars: 5, text: "Great" });
    });
  });

  describe("uploadSchoolLogo", () => {
    it("uploads file and returns URL", async () => {
      mockUploadBytes.mockResolvedValue({});
      mockGetDownloadURL.mockResolvedValue("https://storage.example.com/logo.png");
      mockUpdateDoc.mockResolvedValue(undefined);

      const file = new File(["img"], "logo.png", { type: "image/png" });
      const url = await uploadSchoolLogo("school.edu", file);
      expect(url).toBe("https://storage.example.com/logo.png");
      expect(mockUploadBytes).toHaveBeenCalled();
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  describe("updateSchoolProfile", () => {
    it("updates school document", async () => {
      mockUpdateDoc.mockResolvedValue(undefined);
      await updateSchoolProfile("school.edu", { name: "New Name" });
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { name: "New Name" }
      );
    });
  });

  describe("searchTutors", () => {
    it("returns empty array when no tutors found", async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });
      const result = await searchTutors({ schoolDomain: "school.edu" });
      expect(result).toEqual([]);
    });

    it("returns tutors with available one-off slots", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      mockGetDocs
        .mockResolvedValueOnce({
          // Users query
          docs: [{
            id: "t1",
            data: () => ({
              name: "Tutor1", grade: "10th", subjects: ["Math"],
              bio: "Hi", avgRating: 4.5, reviewCount: 10, isActive: true,
              schoolDomain: "school.edu", role: "tutor", status: "active",
            }),
          }],
        })
        .mockResolvedValueOnce({
          // Slots query
          docs: [{
            id: "s1",
            data: () => ({
              recurring: false, day: "Monday", date: tomorrowStr,
              startTime: "10:00", endTime: "11:00", duration: 60,
              booked: false, schoolDomain: "school.edu",
            }),
          }],
        });

      const result = await searchTutors({ schoolDomain: "school.edu" });
      expect(result).toHaveLength(1);
      expect(result[0].uid).toBe("t1");
      expect(result[0].availableSlots).toHaveLength(1);
    });

    it("filters out booked one-off slots", async () => {
      mockGetDocs
        .mockResolvedValueOnce({
          docs: [{
            id: "t1",
            data: () => ({
              name: "Tutor1", grade: "10th", subjects: ["Math"],
              avgRating: 4.5, reviewCount: 10,
              schoolDomain: "school.edu", role: "tutor", status: "active",
            }),
          }],
        })
        .mockResolvedValueOnce({
          docs: [{
            id: "s1",
            data: () => ({
              recurring: false, day: "Monday", date: "2099-01-01",
              startTime: "10:00", endTime: "11:00", duration: 60,
              booked: true, schoolDomain: "school.edu",
            }),
          }],
        });

      const result = await searchTutors({ schoolDomain: "school.edu" });
      expect(result).toEqual([]); // Tutor excluded because no available slots
    });

    it("includes recurring slots with available dates", async () => {
      mockGetDocs
        .mockResolvedValueOnce({
          docs: [{
            id: "t1",
            data: () => ({
              name: "Tutor1", grade: "10th", subjects: ["Math"],
              avgRating: 4.5, reviewCount: 10,
              schoolDomain: "school.edu", role: "tutor", status: "active",
            }),
          }],
        })
        .mockResolvedValueOnce({
          docs: [{
            id: "s1",
            data: () => ({
              recurring: true, day: "Monday",
              startTime: "10:00", endTime: "11:00", duration: 60,
              booked: false, bookedDates: {}, cancelledDates: [],
              schoolDomain: "school.edu",
            }),
          }],
        });

      const result = await searchTutors({ schoolDomain: "school.edu" });
      expect(result).toHaveLength(1);
    });

    it("filters recurring slots by specific date param", async () => {
      mockGetDocs
        .mockResolvedValueOnce({
          docs: [{
            id: "t1",
            data: () => ({
              name: "Tutor1", grade: "10th", subjects: ["Math"],
              avgRating: 4.5, reviewCount: 10,
              schoolDomain: "school.edu", role: "tutor", status: "active",
            }),
          }],
        })
        .mockResolvedValueOnce({
          docs: [{
            id: "s1",
            data: () => ({
              recurring: true, day: "Monday",
              startTime: "10:00", endTime: "11:00", duration: 60,
              booked: false, bookedDates: {}, cancelledDates: ["2099-06-15"],
              schoolDomain: "school.edu",
            }),
          }],
        });

      // Date is cancelled, should exclude
      const result = await searchTutors({ schoolDomain: "school.edu", date: "2099-06-15" });
      expect(result).toEqual([]);
    });

    it("includes recurring slot when specific date is available", async () => {
      mockGetDocs
        .mockResolvedValueOnce({
          docs: [{
            id: "t1",
            data: () => ({
              name: "Tutor1", grade: "10th", subjects: ["Math"],
              avgRating: 4.5, reviewCount: 10,
              schoolDomain: "school.edu", role: "tutor", status: "active",
            }),
          }],
        })
        .mockResolvedValueOnce({
          docs: [{
            id: "s1",
            data: () => ({
              recurring: true, day: "Monday",
              startTime: "10:00", endTime: "11:00", duration: 60,
              booked: false, bookedDates: {}, cancelledDates: [],
              schoolDomain: "school.edu",
            }),
          }],
        });

      const result = await searchTutors({ schoolDomain: "school.edu", date: "2099-06-16" });
      expect(result).toHaveLength(1);
    });

    it("excludes recurring slots when all dates booked/cancelled", async () => {
      // Create a recurring slot where all 4 weeks are cancelled
      const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const now = new Date();
      const monIdx = 1; // Monday
      const cancelled: string[] = [];
      for (let w = 0; w < 4; w++) {
        const d = new Date(now);
        const diff = (monIdx - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff + w * 7);
        cancelled.push(d.toISOString().split("T")[0]);
      }

      mockGetDocs
        .mockResolvedValueOnce({
          docs: [{
            id: "t1",
            data: () => ({
              name: "Tutor1", grade: "10th", subjects: ["Math"],
              avgRating: 4.5, reviewCount: 10,
              schoolDomain: "school.edu", role: "tutor", status: "active",
            }),
          }],
        })
        .mockResolvedValueOnce({
          docs: [{
            id: "s1",
            data: () => ({
              recurring: true, day: "Monday",
              startTime: "10:00", endTime: "11:00", duration: 60,
              booked: false, bookedDates: {}, cancelledDates: cancelled,
              schoolDomain: "school.edu",
            }),
          }],
        });

      const result = await searchTutors({ schoolDomain: "school.edu" });
      expect(result).toEqual([]);
    });

    it("filters out one-off slots with past dates", async () => {
      mockGetDocs
        .mockResolvedValueOnce({
          docs: [{
            id: "t1",
            data: () => ({
              name: "Tutor1", grade: "10th", subjects: ["Math"],
              avgRating: 4.5, reviewCount: 10,
              schoolDomain: "school.edu", role: "tutor", status: "active",
            }),
          }],
        })
        .mockResolvedValueOnce({
          docs: [{
            id: "s1",
            data: () => ({
              recurring: false, day: "Monday", date: "2020-01-01",
              startTime: "10:00", endTime: "11:00", duration: 60,
              booked: false, schoolDomain: "school.edu",
            }),
          }],
        });

      const result = await searchTutors({ schoolDomain: "school.edu" });
      expect(result).toEqual([]);
    });

    it("filters one-off slots by specific date param", async () => {
      mockGetDocs
        .mockResolvedValueOnce({
          docs: [{
            id: "t1",
            data: () => ({
              name: "Tutor1", grade: "10th", subjects: ["Math"],
              avgRating: 4.5, reviewCount: 10,
              schoolDomain: "school.edu", role: "tutor", status: "active",
            }),
          }],
        })
        .mockResolvedValueOnce({
          docs: [{
            id: "s1",
            data: () => ({
              recurring: false, day: "Monday", date: "2099-06-15",
              startTime: "10:00", endTime: "11:00", duration: 60,
              booked: false, schoolDomain: "school.edu",
            }),
          }],
        });

      // Searching for a different date
      const result = await searchTutors({ schoolDomain: "school.edu", date: "2099-06-16" });
      expect(result).toEqual([]);
    });

    it("filters by subject", async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });
      await searchTutors({ schoolDomain: "school.edu", subject: "Math" });
      // The subject constraint is added in the query
      expect(mockGetDocs).toHaveBeenCalled();
    });

    it("filters by day", async () => {
      mockGetDocs
        .mockResolvedValueOnce({
          docs: [{
            id: "t1",
            data: () => ({
              name: "Tutor1", grade: "10th", subjects: ["Math"],
              avgRating: 4.5, reviewCount: 10,
              schoolDomain: "school.edu", role: "tutor", status: "active",
            }),
          }],
        })
        .mockResolvedValueOnce({ docs: [] });

      const result = await searchTutors({ schoolDomain: "school.edu", day: "Monday" });
      expect(result).toEqual([]);
    });
  });
});

describe("subscribeUser", () => {
  it("calls onSnapshot with user doc ref", () => {
    const cb = vi.fn();
    subscribeUser("u1", cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe("subscribeTutorSlots", () => {
  it("calls onSnapshot with availability collection", () => {
    const cb = vi.fn();
    subscribeTutorSlots("u1", cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe("subscribeUserSessions", () => {
  it("subscribes to tutor sessions", () => {
    const cb = vi.fn();
    subscribeUserSessions("u1", "tutor", cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });

  it("subscribes to tutee sessions", () => {
    const cb = vi.fn();
    mockOnSnapshot.mockClear();
    subscribeUserSessions("u1", "tutee", cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe("subscribeTutorRequests", () => {
  it("subscribes to pending requests", () => {
    const cb = vi.fn();
    subscribeTutorRequests("t1", cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe("subscribeTuteeRequests", () => {
  it("subscribes to tutee requests", () => {
    const cb = vi.fn();
    subscribeTuteeRequests("u1", cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe("subscribeSchoolReviews", () => {
  it("subscribes to school reviews", () => {
    const cb = vi.fn();
    subscribeSchoolReviews("school.edu", cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe("subscribeStats", () => {
  it("subscribes to school stats", () => {
    const cb = vi.fn();
    subscribeStats("school.edu", cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe("subscribeAllSchools", () => {
  it("subscribes to all schools", () => {
    const cb = vi.fn();
    subscribeAllSchools(cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe("subscribeAllSuperAdmins", () => {
  it("subscribes to all super admins", () => {
    const cb = vi.fn();
    subscribeAllSuperAdmins(cb);
    expect(mockOnSnapshot).toHaveBeenCalled();
  });
});

describe("updateAvailabilitySlot", () => {
  it("updates a slot", async () => {
    mockUpdateDoc.mockResolvedValue(undefined);
    await updateAvailabilitySlot("t1", "s1", { duration: 45 });
    expect(mockUpdateDoc).toHaveBeenCalled();
  });
});

describe("getRecommendedTutors", () => {
  it("calls recommend function", async () => {
    const result = await getRecommendedTutors(
      [{ uid: "t1", name: "T", grade: "10th", subjects: ["Math"], avgRating: 4, reviewCount: 5, availableSlots: [] }],
      { subject: "Math" }
    );
    expect(result).toHaveProperty("ranked");
  });
});
