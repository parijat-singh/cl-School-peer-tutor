// src/lib/school-context.tsx
// Provides the current user's school doc (logo, name, campus, brandColor)
// to all authenticated pages via React context.

import React, { createContext, useContext, useEffect, useState } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth-context";
import type { SchoolDoc } from "./types";

interface SchoolContextValue {
  school: SchoolDoc | null;
  loading: boolean;
}

const SchoolContext = createContext<SchoolContextValue>({
  school: null,
  loading: true,
});

export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.schoolDomain) {
      setSchool(null);
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "schools", currentUser.schoolDomain),
      (snap) => {
        setSchool(snap.exists() ? (snap.data() as SchoolDoc) : null);
        setLoading(false);
      },
      () => {
        // On error, fail gracefully
        setSchool(null);
        setLoading(false);
      }
    );

    return unsub;
  }, [currentUser?.schoolDomain]);

  return (
    <SchoolContext.Provider value={{ school, loading }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool(): SchoolContextValue {
  return useContext(SchoolContext);
}
