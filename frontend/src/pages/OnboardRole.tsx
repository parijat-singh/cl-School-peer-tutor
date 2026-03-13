// src/pages/OnboardRole.tsx
// Post-signup onboarding: confirm role, set initial subjects for tutors
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button, Badge } from "@/components/shared/ui";
import { BookOpen, Search, ArrowRight } from "lucide-react";

const DEFAULT_SUBJECTS = [
  "Algebra","Geometry","Pre-Calculus","Calculus","Statistics",
  "Biology","Chemistry","Physics","Earth Science",
  "English","History","Spanish","French","Computer Science","Economics",
];

export default function OnboardRole() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const toggle = (s: string) =>
    setSelectedSubjects((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const isTutor = currentUser?.role === "tutor" || currentUser?.role === "both";

  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-7 h-7 text-brand-500" />
        </div>
        <h1 className="font-display text-3xl text-gray-900 mb-2">
          Welcome, {currentUser?.name?.split(" ")[0]}!
        </h1>
        <p className="text-gray-500 text-sm">
          {isTutor
            ? "Select the subjects you can tutor. You can update these anytime."
            : "You're all set to find tutors at your school."}
        </p>
      </div>

      {isTutor && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">Subjects I can teach</h2>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_SUBJECTS.map((s) => (
              <button
                key={s}
                onClick={() => toggle(s)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  selectedSubjects.includes(s)
                    ? "bg-brand-500 border-brand-500 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-brand-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {selectedSubjects.length > 0 && (
            <p className="text-xs text-gray-400 mt-3">{selectedSubjects.length} selected</p>
          )}
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={() => navigate(isTutor ? "/dashboard" : "/find")}
      >
        {isTutor ? (
          <><BookOpen className="w-4 h-4" /> Go to my dashboard</>
        ) : (
          <><Search className="w-4 h-4" /> Find a tutor</>
        )}
        <ArrowRight className="w-4 h-4 ml-auto" />
      </Button>
    </div>
  );
}
