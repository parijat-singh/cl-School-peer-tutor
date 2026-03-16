// src/components/shared/ProtectedRoute.tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/lib/types";
import { LoadingSpinner } from "./LoadingSpinner";
import { Clock } from "lucide-react";

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

  if (currentUser.status === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-lg border border-amber-200 p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-semibold text-amber-700 mb-3">Account Pending Approval</h2>
          <p className="text-gray-600 text-sm">
            Your account is awaiting approval from your school administrator.
            You'll be able to access the platform once approved.
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
      currentUser.role === "superadmin" ? "/superadmin" :
      currentUser.role === "schooladmin" ? "/admin" :
      currentUser.role === "teacher" ? "/teacher" :
      currentUser.role === "tutee" ? "/find" : "/dashboard";
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}
