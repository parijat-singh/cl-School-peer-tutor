// src/lib/auth-context.tsx
// Auth context supporting both Cognito (primary) and Firebase (legacy) auth.
// During migration, existing Firebase users continue working via Firebase auth.
// New signups go through Cognito.

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth as firebaseAuth } from "./firebase";
import { getUserDoc } from "./firestore";
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
  decodeIdToken,
  type CognitoTokens,
} from "./cognito-auth";
import { callFunction } from "./callable";

const REFRESH_TOKEN_KEY = "pt_refresh_token";
const AUTH_PROVIDER_KEY = "pt_auth_provider"; // "cognito" | "firebase"

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
  getIdToken: () => Promise<string>;
  /** Which auth provider is active for the current session */
  authProvider: "cognito" | "firebase" | null;
}

interface SignUpParams {
  email: string;
  password: string;
  name: string;
  grade: GradeLevel | null;
  role: UserRole;
}

/** Data needed after confirm to initialize the user */
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
  const [authProvider, setAuthProvider] = useState<"cognito" | "firebase" | null>(null);

  // Cognito tokens stored in memory (not localStorage) for security
  const tokensRef = useRef<CognitoTokens | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule token refresh 5 minutes before expiry
  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const refreshMs = Math.max((expiresIn - 300) * 1000, 30_000); // at least 30s
    refreshTimerRef.current = setTimeout(async () => {
      const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefresh) return;
      try {
        const refreshed = await cognitoRefreshTokens(storedRefresh);
        tokensRef.current = {
          ...refreshed,
          refreshToken: storedRefresh,
        };
        scheduleRefresh(refreshed.expiresIn);
      } catch {
        // Refresh failed — force logout
        setCurrentUser(null);
        setAuthProvider(null);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(AUTH_PROVIDER_KEY);
      }
    }, refreshMs);
  }, []);

  // Initialize: check for existing Cognito session or Firebase session
  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      const storedProvider = localStorage.getItem(AUTH_PROVIDER_KEY);
      const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);

      if (storedProvider === "cognito" && storedRefresh) {
        // Try to restore Cognito session
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
            setAuthProvider("cognito");
            scheduleRefresh(refreshed.expiresIn);
          }
        } catch {
          // Refresh token expired — clean up
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          localStorage.removeItem(AUTH_PROVIDER_KEY);
        }
      }

      // Also listen for Firebase auth (legacy users)
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
        if (cancelled) return;
        // Skip Firebase if already authenticated via Cognito
        if (tokensRef.current) {
          if (!loading) return;
          setLoading(false);
          return;
        }

        if (fbUser) {
          const userDoc = await getUserDoc(fbUser.uid);
          if (cancelled) return;
          if (userDoc) {
            setCurrentUser({
              uid: fbUser.uid,
              email: fbUser.email!,
              name: userDoc.name,
              role: userDoc.role,
              grade: userDoc.grade,
              schoolDomain: userDoc.schoolDomain,
              status: userDoc.status,
            });
            setAuthProvider("firebase");
            localStorage.setItem(AUTH_PROVIDER_KEY, "firebase");
          }
        } else if (!tokensRef.current) {
          setCurrentUser(null);
          setAuthProvider(null);
        }
        setLoading(false);
      });

      // If no Cognito session, loading state is handled by onAuthStateChanged
      if (!storedRefresh || storedProvider !== "cognito") {
        // onAuthStateChanged will set loading to false
      } else {
        if (!cancelled) setLoading(false);
      }

      return unsubscribe;
    };

    let unsubscribe: (() => void) | undefined;
    initAuth().then((unsub) => { unsubscribe = unsub; });

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh]);

  const signIn = async (email: string, password: string) => {
    // Try Cognito first
    try {
      const tokens = await cognitoSignIn(email, password);
      tokensRef.current = tokens;
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      localStorage.setItem(AUTH_PROVIDER_KEY, "cognito");

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
        setAuthProvider("cognito");
        scheduleRefresh(tokens.expiresIn);
        return;
      }
    } catch (err: unknown) {
      const cognitoErr = err as { name?: string };
      // If user doesn't exist in Cognito, fall back to Firebase
      if (cognitoErr.name === "UserNotFoundException" || cognitoErr.name === "NotAuthorizedException") {
        // Try Firebase for legacy users
      } else {
        throw err;
      }
    }

    // Fallback: Firebase auth for existing users
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    localStorage.setItem(AUTH_PROVIDER_KEY, "firebase");
    setAuthProvider("firebase");
    // onAuthStateChanged will populate currentUser
  };

  const signUp = async ({ email, password }: SignUpParams) => {
    // Cognito signup — sends verification code to email
    await cognitoSignUp(email, password);
    // Frontend should now show the verification code input
    // and then call confirmSignUp with the code
  };

  const confirmSignUp = async (email: string, code: string, signUpData: SignUpData) => {
    // Confirm the Cognito signup
    await cognitoConfirmSignUp(email, code);

    // Sign in to get tokens
    // Note: we need the password here but it was only used in signUp.
    // The frontend flow should store email temporarily and re-prompt password,
    // or we auto-sign-in by having the frontend pass the password through.
    // For now, the frontend must call signIn after confirmSignUp.

    // Call initializeUser cloud function to create Firestore doc
    const tokens = tokensRef.current;
    if (tokens) {
      await callFunction("initializeUser", {
        name: signUpData.name,
        role: signUpData.role,
        schoolDomain: signUpData.schoolDomain,
        grade: signUpData.grade ?? undefined,
        subjects: signUpData.subjects ?? [],
      }, tokens.idToken);
    }
  };

  const logOut = async () => {
    if (authProvider === "cognito" && tokensRef.current) {
      await cognitoSignOut(tokensRef.current.accessToken);
      tokensRef.current = null;
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } else {
      await firebaseSignOut(firebaseAuth);
    }
    localStorage.removeItem(AUTH_PROVIDER_KEY);
    setCurrentUser(null);
    setAuthProvider(null);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  };

  const resetPassword = async (email: string) => {
    // Try Cognito first, fall back to Firebase
    try {
      await cognitoForgotPassword(email);
    } catch {
      await sendPasswordResetEmail(firebaseAuth, email);
    }
  };

  const confirmResetPassword = async (email: string, code: string, newPassword: string) => {
    await cognitoConfirmForgotPassword(email, code, newPassword);
  };

  const resendCode = async (email: string) => {
    await cognitoResendConfirmationCode(email);
  };

  const getIdToken = async (): Promise<string> => {
    if (authProvider === "cognito" && tokensRef.current) {
      // Check if token is about to expire (within 60s)
      const decoded = decodeIdToken(tokensRef.current.idToken);
      if (decoded.exp * 1000 - Date.now() < 60_000) {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshToken) {
          const refreshed = await cognitoRefreshTokens(refreshToken);
          tokensRef.current = { ...refreshed, refreshToken };
          scheduleRefresh(refreshed.expiresIn);
        }
      }
      return tokensRef.current.idToken;
    }
    // Firebase fallback
    const fbUser = firebaseAuth.currentUser;
    if (fbUser) return fbUser.getIdToken();
    throw new Error("Not authenticated");
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
        getIdToken,
        authProvider,
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
