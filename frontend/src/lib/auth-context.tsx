// src/lib/auth-context.tsx
// Auth context — Cognito only (Firebase auth removed in Phase 2).

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { getUserDoc } from "./api-queries";
import { setTokenGetter } from "./api";
import { initializeUser } from "./api-functions";
import type { AuthUser, UserRole, GradeLevel } from "./types";
import {
  cognitoSignUp,
  cognitoConfirmSignUp,
  cognitoSignIn,
  cognitoSignOut,
  cognitoRefreshTokens,
  cognitoForgotPassword,
  cognitoConfirmForgotPassword,
  cognitoResendConfirmationCode,
  cognitoChangePassword,
  decodeIdToken,
  type CognitoTokens,
} from "./cognito-auth";

const REFRESH_TOKEN_KEY = "pt_refresh_token";

interface AuthContextValue {
  currentUser: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<void>;
  confirmSignUp: (email: string, code: string, signUpData: SignUpData) => Promise<void>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmResetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  getIdToken: () => Promise<string>;
}

interface SignUpParams {
  email: string;
  password: string;
  name: string;
  grade: GradeLevel | null;
  role: UserRole;
}

interface SignUpData {
  name: string;
  role: UserRole;
  schoolDomain: string;
  grade?: GradeLevel | null;
  subjects?: string[];
}

export function extractDomain(email: string): string | null {
  const domain = email.split("@")[1];
  return domain ? domain.toLowerCase() : null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Cognito tokens stored in memory (not localStorage) for security
  const tokensRef = useRef<CognitoTokens | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wire up the API client's token getter
  const getIdToken = useCallback(async (): Promise<string> => {
    if (!tokensRef.current) throw new Error("Not authenticated");
    // Check if token is about to expire (within 60s)
    const decoded = decodeIdToken(tokensRef.current.idToken);
    if (decoded.exp * 1000 - Date.now() < 60_000) {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (refreshToken) {
        const refreshed = await cognitoRefreshTokens(refreshToken);
        tokensRef.current = { ...refreshed, refreshToken };
      }
    }
    return tokensRef.current.idToken;
  }, []);

  // Register token getter with api.ts (once)
  useEffect(() => {
    setTokenGetter(getIdToken);
  }, [getIdToken]);

  // Schedule token refresh 5 minutes before expiry
  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const refreshMs = Math.max((expiresIn - 300) * 1000, 30_000);
    refreshTimerRef.current = setTimeout(async () => {
      const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefresh) return;
      try {
        const refreshed = await cognitoRefreshTokens(storedRefresh);
        tokensRef.current = { ...refreshed, refreshToken: storedRefresh };
        scheduleRefresh(refreshed.expiresIn);
      } catch {
        setCurrentUser(null);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }, refreshMs);
  }, []);

  // Initialize: restore Cognito session from refresh token
  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefresh) {
        setLoading(false);
        return;
      }

      try {
        const refreshed = await cognitoRefreshTokens(storedRefresh);
        if (cancelled) return;
        tokensRef.current = { ...refreshed, refreshToken: storedRefresh };

        const decoded = decodeIdToken(refreshed.idToken);
        const userDoc = await getUserDoc(decoded.sub);
        if (cancelled) return;

        if (userDoc) {
          setCurrentUser({
            uid: decoded.sub,
            email: decoded.email,
            name: userDoc.name,
            role: userDoc.role,
            grade: userDoc.grade,
            schoolDomain: userDoc.schoolDomain,
            status: userDoc.status,
          });
          scheduleRefresh(refreshed.expiresIn);
        }
      } catch {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }

      if (!cancelled) setLoading(false);
    };

    initAuth();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh]);

  const signIn = async (email: string, password: string) => {
    const tokens = await cognitoSignIn(email, password);
    tokensRef.current = tokens;
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);

    const decoded = decodeIdToken(tokens.idToken);
    const userDoc = await getUserDoc(decoded.sub);
    if (userDoc) {
      setCurrentUser({
        uid: decoded.sub,
        email: decoded.email,
        name: userDoc.name,
        role: userDoc.role,
        grade: userDoc.grade,
        schoolDomain: userDoc.schoolDomain,
        status: userDoc.status,
      });
      scheduleRefresh(tokens.expiresIn);
    }
  };

  const signUp = async ({ email, password }: SignUpParams) => {
    await cognitoSignUp(email, password);
  };

  const confirmSignUp = async (email: string, code: string, signUpData: SignUpData) => {
    await cognitoConfirmSignUp(email, code);
    // If we already have tokens (from sign-in after confirm), initialize the user
    const tokens = tokensRef.current;
    if (tokens) {
      await initializeUser({
        name: signUpData.name,
        role: signUpData.role,
        schoolDomain: signUpData.schoolDomain,
        grade: signUpData.grade ?? undefined,
        subjects: signUpData.subjects ?? [],
      });
    }
  };

  const logOut = async () => {
    if (tokensRef.current) {
      await cognitoSignOut(tokensRef.current.accessToken);
      tokensRef.current = null;
    }
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setCurrentUser(null);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  };

  const resetPassword = async (email: string) => {
    await cognitoForgotPassword(email);
  };

  const confirmResetPassword = async (email: string, code: string, newPassword: string) => {
    await cognitoConfirmForgotPassword(email, code, newPassword);
  };

  const resendCode = async (email: string) => {
    await cognitoResendConfirmationCode(email);
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    if (!tokensRef.current) throw new Error("Not authenticated");
    await cognitoChangePassword(tokensRef.current.accessToken, oldPassword, newPassword);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        signIn,
        signUp,
        confirmSignUp,
        logOut,
        resetPassword,
        confirmResetPassword,
        resendCode,
        changePassword,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
