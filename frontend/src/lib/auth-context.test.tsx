import { describe, it, expect, vi } from "vitest";

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
}));

vi.mock("./firebase", () => ({
  auth: { currentUser: null },
  db: {},
}));

vi.mock("./firestore", () => ({
  getUserDoc: vi.fn().mockResolvedValue(null),
}));

vi.mock("./cognito-auth", () => ({
  cognitoSignUp: vi.fn(),
  cognitoConfirmSignUp: vi.fn(),
  cognitoSignIn: vi.fn(),
  cognitoSignOut: vi.fn(),
  cognitoRefreshTokens: vi.fn(),
  cognitoForgotPassword: vi.fn(),
  cognitoConfirmForgotPassword: vi.fn(),
  cognitoResendConfirmationCode: vi.fn(),
  decodeIdToken: vi.fn(),
}));

vi.mock("./callable", () => ({
  callFunction: vi.fn(),
}));

import { extractDomain } from "./auth-context";

describe("extractDomain", () => {
  it("extracts domain from valid email", () => {
    expect(extractDomain("user@school.edu")).toBe("school.edu");
  });

  it("lowercases the domain", () => {
    expect(extractDomain("user@School.EDU")).toBe("school.edu");
  });

  it("returns null for email without @", () => {
    expect(extractDomain("invalid-email")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractDomain("")).toBeNull();
  });
});
