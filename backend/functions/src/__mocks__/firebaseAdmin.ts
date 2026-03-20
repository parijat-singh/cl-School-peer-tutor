// Mock Firestore
import { vi } from "vitest";

// Helper to create chainable Firestore doc/collection refs
export function createMockFirestore() {
  const mockData = new Map<string, any>();
  const mockCollections = new Map<string, any[]>();

  const mockDocRef = (path: string) => ({
    id: path.split("/").pop() || "auto-id",
    path,
    get: vi.fn().mockResolvedValue({
      exists: mockData.has(path),
      data: () => mockData.get(path),
      id: path.split("/").pop() || "auto-id",
      ref: mockDocRef(path),
    }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    collection: (name: string) => mockCollectionRef(`${path}/${name}`),
  });

  const mockCollectionRef = (path: string) => ({
    doc: (id?: string) => mockDocRef(`${path}/${id || "auto-id"}`),
    add: vi.fn().mockResolvedValue({ id: "auto-id" }),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
  });

  const mockBatch = () => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  });

  const mockTransaction = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const firestore = {
    collection: (name: string) => mockCollectionRef(name),
    doc: (path: string) => mockDocRef(path),
    batch: vi.fn(() => mockBatch()),
    runTransaction: vi.fn(async (fn: (txn: any) => Promise<any>) => fn(mockTransaction)),
    _mockData: mockData,
    _mockTransaction: mockTransaction,
    _mockBatch: mockBatch,
  };

  return firestore;
}

// Mock Auth
export function createMockAuth() {
  return {
    getUser: vi.fn().mockResolvedValue({ uid: "user-1", email: "test@school.edu", customClaims: {} }),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn().mockResolvedValue(undefined),
  };
}

// Mock FieldValue
export const mockFieldValue = {
  serverTimestamp: vi.fn(() => ({ _type: "serverTimestamp" })),
  increment: vi.fn((n: number) => ({ _type: "increment", value: n })),
  delete: vi.fn(() => ({ _type: "delete" })),
};

// Mock Timestamp
export const mockTimestamp = {
  fromDate: vi.fn((d: Date) => ({
    toDate: () => d,
    toMillis: () => d.getTime(),
    _type: "timestamp",
  })),
  now: vi.fn(() => ({
    toDate: () => new Date(),
    toMillis: () => Date.now(),
    _type: "timestamp",
  })),
};

// Create a mock callable request
export function mockRequest(overrides: {
  auth?: { uid: string; token?: Record<string, any> } | null;
  data?: Record<string, any>;
} = {}) {
  return {
    auth: overrides.auth === null ? undefined : {
      uid: overrides.auth?.uid || "user-1",
      token: {
        role: "tutee",
        schoolDomain: "school.edu",
        status: "active",
        email: "test@school.edu",
        ...overrides.auth?.token,
      },
      ...overrides.auth,
    },
    data: overrides.data || {},
  };
}
