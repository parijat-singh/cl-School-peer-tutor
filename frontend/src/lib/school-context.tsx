// src/lib/school-context.tsx
// Provides the current user's school doc to all authenticated pages via React context.
// Uses polling instead of Firestore onSnapshot.

import React, { createContext, useContext } from "react";
import { useAuth } from "./auth-context";
import { getSchoolDoc } from "./api-queries";
import { usePoll } from "./use-poll";
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
  const domain = currentUser?.schoolDomain;

  const { data: school, loading } = usePoll(
    () => (domain ? getSchoolDoc(domain) : Promise.resolve(null)),
    [domain],
    { intervalMs: 60_000, enabled: !!domain },
  );

  return (
    <SchoolContext.Provider value={{ school, loading }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool(): SchoolContextValue {
  return useContext(SchoolContext);
}
