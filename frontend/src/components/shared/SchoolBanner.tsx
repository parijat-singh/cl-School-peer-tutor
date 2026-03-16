// src/components/shared/SchoolBanner.tsx
// Reusable header banner showing school logo, name, and campus.
// Displayed at the top of every authenticated page.

import { useSchool } from "@/lib/school-context";
import { GraduationCap } from "lucide-react";

interface SchoolBannerProps {
  /** Compact = inline logo+name (for nav). Full = large banner (for page headers). */
  variant?: "compact" | "full";
  className?: string;
}

export function SchoolBanner({ variant = "full", className = "" }: SchoolBannerProps) {
  const { school, loading } = useSchool();

  if (loading || !school) return null;

  // ── Compact: inline logo + school name (for navbar) ──
  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {school.logoUrl ? (
          <img
            src={school.logoUrl}
            alt={`${school.name} logo`}
            className="h-6 w-auto object-contain"
          />
        ) : (
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ backgroundColor: school.brandColor || "#0055FF" }}
          >
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        <span className="text-sm font-medium text-gray-700 truncate max-w-[160px]">
          {school.name}
        </span>
      </div>
    );
  }

  // ── Full: large banner with logo, name, campus ──
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {school.logoUrl ? (
        <img
          src={school.logoUrl}
          alt={`${school.name} logo`}
          className="h-12 w-auto object-contain rounded"
        />
      ) : (
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: school.brandColor || "#0055FF" }}
        >
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
      )}
      <div className="min-w-0">
        <h2 className="font-display text-lg text-gray-900 truncate">{school.name}</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{school.domain}</span>
          {school.campus && (
            <>
              <span className="text-gray-300">|</span>
              <span>{school.campus}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
