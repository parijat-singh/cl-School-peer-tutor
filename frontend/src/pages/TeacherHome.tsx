// src/pages/TeacherHome.tsx
import { useAuth } from "@/lib/auth-context";
import { Shield, Clock } from "lucide-react";

export default function TeacherHome() {
  const { currentUser } = useAuth();
  const domain = currentUser?.schoolDomain ?? "";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
      <div className="bg-white rounded-lg border border-gray-200 p-10">
        <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-5">
          <Shield className="w-7 h-7 text-brand-500" />
        </div>
        <h1 className="font-display text-2xl text-gray-900 mb-2">
          Welcome, {currentUser?.name}
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Teacher account at <strong>{domain}</strong>
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-left">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 mb-1">
                Awaiting admin privileges
              </p>
              <p className="text-sm text-amber-700">
                Your school's primary administrator can promote you to School Admin,
                giving you access to the admin dashboard to manage students, reviews,
                and school settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
