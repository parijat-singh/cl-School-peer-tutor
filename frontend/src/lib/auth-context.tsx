// src/lib/auth-context.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, db } from "./firebase";
import { getUserDoc } from "./firestore";
import type { AuthUser, UserRole, GradeLevel } from "./types";

interface AuthContextValue {
  currentUser: AuthUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<void>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendVerificationOtp: () => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
}

interface SignUpParams {
  email: string;
  password: string;
  name: string;
  grade: GradeLevel | null;
  role: UserRole;
}

// Basic email domain extractor — actual authorization is enforced by Firestore
// (superadmin must approve the school domain before anyone can sign up with it)
export function extractDomain(email: string): string | null {
  const domain = email.split("@")[1];
  return domain ? domain.toLowerCase() : null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const userDoc = await getUserDoc(fbUser.uid);
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
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged above will populate currentUser
  };

  const signUp = async ({ email, password, name, grade, role }: SignUpParams) => {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) {
      throw new Error("Enter a valid email address.");
    }

    // Check domain is registered and approved in Firestore
    const schoolSnap = await getDoc(doc(db, "schools", domain));
    if (!schoolSnap.exists()) {
      throw new Error("Your school is not registered on PeerTutor yet. Ask your school administrator to register.");
    }
    const schoolData = schoolSnap.data();
    const isApproved = schoolData.status === "approved" || (schoolData.approved === true && !schoolData.status);
    if (!isApproved) {
      throw new Error("Your school's registration is still pending approval. Please try again later.");
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const { uid } = credential.user;

    // If this email is the designated school admin, auto-activate with schooladmin role
    const isSchoolAdmin =
      schoolData.adminEmail != null &&
      schoolData.adminEmail.toLowerCase() === email.toLowerCase();

    // Write user document — Cloud Function will also set custom claims
    await setDoc(doc(db, "users", uid), {
      name,
      email,
      grade: isSchoolAdmin ? null : grade,
      role: isSchoolAdmin ? "schooladmin" : role,
      schoolDomain: domain,
      status: isSchoolAdmin ? "active" : "pending",
      subjects: [],
      bio: "",
      avgRating: 0,
      reviewCount: 0,
      isActive: !isSchoolAdmin && (role === "tutor" || role === "both"),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const logOut = async () => {
    await signOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const sendVerificationOtp = async () => {
    const fns = getFunctions();
    const fn  = httpsCallable(fns, "sendVerificationOtp");
    await fn();
  };

  const verifyOtp = async (otp: string) => {
    const fns = getFunctions();
    const fn  = httpsCallable(fns, "verifyEmailOtp");
    await fn({ otp });
    // Force token refresh so custom claims (status: active) take effect immediately
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
      const userDoc = await getUserDoc(auth.currentUser.uid);
      if (userDoc) {
        setCurrentUser({
          uid:          auth.currentUser.uid,
          email:        auth.currentUser.email!,
          name:         userDoc.name,
          role:         userDoc.role,
          grade:        userDoc.grade,
          schoolDomain: userDoc.schoolDomain,
          status:       userDoc.status,
        });
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, firebaseUser, loading, signIn, signUp, logOut, resetPassword, sendVerificationOtp, verifyOtp }}
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
