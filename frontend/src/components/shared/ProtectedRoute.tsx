// src/components/shared/ProtectedRoute.tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/lib/types";
import { LoadingSpinner } from "./LoadingSpinner";

interface Props {
  children: React.ReactNode;
  roles?: UserRole[];
}

export function ProtectedRoute({ children, roles }: Props) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner fullScreen />;

  if (!currentUser) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (currentUser.status === "pending_consent") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md text-center">
          <div className="text-4xl mb-4">✉️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Awaiting Parental Consent</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Because you indicated you are in 6th or 7th grade, we have sent a parental
            consent email to the guardian address you provided. Your account will be
            activated once they confirm.
          </p>
        </div>
      </div>
    );
  }

  if (currentUser.status === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-lg border border-red-200 p-8 max-w-md text-center">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-xl font-semibold text-red-700 mb-3">Account Suspended</h2>
          <p className="text-gray-600 text-sm">
            Your account has been suspended by your school administrator.
            Please contact your school for assistance.
          </p>
        </div>
      </div>
    );
  }

  if (roles && !roles.includes(currentUser.role)) {
    // Redirect to appropriate dashboard
    const redirect =
      currentUser.role === "admin" ? "/admin" :
      currentUser.role === "tutee" ? "/find" : "/dashboard";
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}
