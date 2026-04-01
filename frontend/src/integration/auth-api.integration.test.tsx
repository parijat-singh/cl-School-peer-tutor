// @vitest-environment jsdom
// Integration tests for AuthProvider + api.ts + api-queries.ts working together.
// Mocks: cognito-auth module (external Cognito SDK) + global fetch (HTTP boundary).
// Does NOT mock api.ts, api-queries.ts, or auth-context.tsx — those are under test.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { setTokenGetter } from "../lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal (unsigned) JWT with the given payload. */
function makeJwt(claims: Record<string, unknown>, expOffsetSeconds = 3600): string {
  const payload = { ...claims, exp: Math.floor(Date.now() / 1000) + expOffsetSeconds, iat: Math.floor(Date.now() / 1000) };
  const encoded = btoa(JSON.stringify(payload)).replace(/=/g, "");
  return `header.${encoded}.signature`;
}

function makeTokens(uid = "user-1", expOffsetSeconds = 3600) {
  return {
    idToken: makeJwt({ sub: uid, email: `${uid}@test.edu` }, expOffsetSeconds),
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: expOffsetSeconds,
  };
}

const USER_DOC = {
  uid: "user-1",
  name: "Alice",
  role: "tutee" as const,
  grade: "11",
  schoolDomain: "test.edu",
  status: "active" as const,
};

// Mock the entire cognito-auth module
vi.mock("../lib/cognito-auth", () => ({
  cognitoSignIn: vi.fn(),
  cognitoSignUp: vi.fn(),
  cognitoConfirmSignUp: vi.fn(),
  cognitoSignOut: vi.fn().mockResolvedValue(undefined),
  cognitoRefreshTokens: vi.fn(),
  cognitoForgotPassword: vi.fn(),
  cognitoConfirmForgotPassword: vi.fn(),
  cognitoResendConfirmationCode: vi.fn(),
  cognitoChangePassword: vi.fn(),
  decodeIdToken: vi.fn((token: string) => {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  }),
}));

import * as cognitoAuth from "../lib/cognito-auth";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AuthProvider, null, children);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AuthProvider + api.ts + api-queries.ts integration", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    // Reset token getter between tests
    setTokenGetter(async () => { throw new Error("Not authenticated"); });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // ── Session restore ──────────────────────────────────────────────────────

  it("restores session from localStorage refresh token on mount", async () => {
    localStorage.setItem("pt_refresh_token", "stored-refresh");
    const tokens = makeTokens("user-1");
    (cognitoAuth.cognitoRefreshTokens as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => USER_DOC,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.currentUser).not.toBeNull();
    expect(result.current.currentUser!.uid).toBe("user-1");
    expect(result.current.currentUser!.name).toBe("Alice");
    expect(result.current.currentUser!.schoolDomain).toBe("test.edu");
  });

  it("leaves currentUser null when no refresh token in localStorage", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.currentUser).toBeNull();
  });

  it("clears stored refresh token when session restore fails", async () => {
    localStorage.setItem("pt_refresh_token", "bad-token");
    (cognitoAuth.cognitoRefreshTokens as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Token expired"));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.currentUser).toBeNull();
    expect(localStorage.getItem("pt_refresh_token")).toBeNull();
  });

  it("leaves currentUser null when user doc returns 404 during restore", async () => {
    localStorage.setItem("pt_refresh_token", "stored-refresh");
    const tokens = makeTokens("user-1");
    (cognitoAuth.cognitoRefreshTokens as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "User not found." }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.currentUser).toBeNull();
  });

  // ── signIn flow ──────────────────────────────────────────────────────────

  it("signIn sets currentUser from user doc returned by API", async () => {
    const tokens = makeTokens("user-1");
    (cognitoAuth.cognitoSignIn as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => USER_DOC,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signIn("alice@test.edu", "password");
    });

    expect(result.current.currentUser).not.toBeNull();
    expect(result.current.currentUser!.role).toBe("tutee");
    expect(result.current.currentUser!.name).toBe("Alice");
  });

  it("signIn persists refresh token in localStorage", async () => {
    const tokens = makeTokens("user-1");
    (cognitoAuth.cognitoSignIn as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => USER_DOC });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signIn("alice@test.edu", "password");
    });

    expect(localStorage.getItem("pt_refresh_token")).toBe("refresh-token");
  });

  it("signIn leaves currentUser null when user doc is not found", async () => {
    const tokens = makeTokens("user-1");
    (cognitoAuth.cognitoSignIn as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "not found" }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signIn("alice@test.edu", "password");
    });

    expect(result.current.currentUser).toBeNull();
  });

  // ── getIdToken injects auth header ───────────────────────────────────────

  it("API requests include Authorization header after signIn", async () => {
    const tokens = makeTokens("user-1");
    (cognitoAuth.cognitoSignIn as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => USER_DOC });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.signIn("alice@test.edu", "password"); });

    // Reset mock to capture the next call
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ sessions: [] }) });

    // Trigger a fetch through api.ts (getIdToken should inject token)
    await act(async () => { await result.current.getIdToken(); });

    // The signIn already made a fetch call — verify that call used auth header indirectly
    // by checking a subsequent api.get call includes Bearer header
    const { api } = await import("../lib/api");
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ sessions: [] }) });
    await api.get("/sessions/mine?role=tutor");

    const [, fetchOptions] = fetchMock.mock.calls[0];
    expect((fetchOptions as RequestInit).headers).toMatchObject({
      Authorization: expect.stringMatching(/^Bearer /),
    });
  });

  // ── Token refresh ────────────────────────────────────────────────────────

  it("getIdToken refreshes token when it is about to expire", async () => {
    localStorage.setItem("pt_refresh_token", "stored-refresh");
    // Near-expired token (exp in 30 seconds — below 60s threshold)
    const nearExpiredTokens = makeTokens("user-1", 30);
    const freshTokens = makeTokens("user-1", 3600);
    (cognitoAuth.cognitoRefreshTokens as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(nearExpiredTokens) // initial restore
      .mockResolvedValueOnce(freshTokens);       // refresh call
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => USER_DOC });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.getIdToken(); });

    // cognitoRefreshTokens should be called twice: once for restore, once for refresh
    expect(cognitoAuth.cognitoRefreshTokens).toHaveBeenCalledTimes(2);
  });

  // ── logOut ───────────────────────────────────────────────────────────────

  it("logOut clears currentUser and removes refresh token", async () => {
    localStorage.setItem("pt_refresh_token", "stored-refresh");
    const tokens = makeTokens("user-1");
    (cognitoAuth.cognitoRefreshTokens as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => USER_DOC });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.currentUser).not.toBeNull());

    await act(async () => { await result.current.logOut(); });

    expect(result.current.currentUser).toBeNull();
    expect(localStorage.getItem("pt_refresh_token")).toBeNull();
  });

  it("logOut calls cognitoSignOut with access token", async () => {
    localStorage.setItem("pt_refresh_token", "stored-refresh");
    const tokens = makeTokens("user-1");
    (cognitoAuth.cognitoRefreshTokens as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => USER_DOC });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.currentUser).not.toBeNull());

    await act(async () => { await result.current.logOut(); });

    expect(cognitoAuth.cognitoSignOut).toHaveBeenCalledWith("access-token");
  });

  // ── confirmSignUp ─────────────────────────────────────────────────────────

  it("confirmSignUp calls initializeUser when tokens are available", async () => {
    // First sign in to populate tokens
    const tokens = makeTokens("user-1");
    (cognitoAuth.cognitoSignIn as ReturnType<typeof vi.fn>).mockResolvedValue(tokens);
    (cognitoAuth.cognitoConfirmSignUp as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    // getUserDoc call during signIn
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => USER_DOC });
    // initializeUser POST call
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ uid: "user-1" }) });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.signIn("alice@test.edu", "password"); });

    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ uid: "user-1" }) });

    await act(async () => {
      await result.current.confirmSignUp("alice@test.edu", "123456", {
        name: "Alice",
        role: "tutee",
        schoolDomain: "test.edu",
      });
    });

    // Should POST to /auth/initialize-user
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/initialize-user"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("confirmSignUp does NOT call initializeUser when no tokens available", async () => {
    (cognitoAuth.cognitoConfirmSignUp as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.confirmSignUp("alice@test.edu", "123456", {
        name: "Alice",
        role: "tutee",
        schoolDomain: "test.edu",
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
