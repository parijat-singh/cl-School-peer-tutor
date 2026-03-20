// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import * as Sentry from "@sentry/react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { SchoolProvider } from "@/lib/school-context";
import { Layout } from "@/components/shared/Layout";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";

// Lazy-loaded pages for code splitting
const LandingPage     = lazy(() => import("@/pages/LandingPage"));
const AuthPage        = lazy(() => import("@/pages/AuthPage"));
const TutorDashboard  = lazy(() => import("@/pages/TutorDashboard"));
const TuteeBooking    = lazy(() => import("@/pages/TuteeBooking"));
const TutorProfile    = lazy(() => import("@/pages/TutorProfile"));
const AdminDashboard  = lazy(() => import("@/pages/AdminDashboard"));
const RateSession     = lazy(() => import("@/pages/RateSession"));
const OnboardRole     = lazy(() => import("@/pages/OnboardRole"));
const SuperAdminDashboard = lazy(() => import("@/pages/SuperAdminDashboard"));
const TeacherHome     = lazy(() => import("@/pages/TeacherHome"));
const ContactPage     = lazy(() => import("@/pages/ContactPage"));
const NotFound        = lazy(() => import("@/pages/NotFound"));

function AppRoutes() {
  const { currentUser, loading } = useAuth();

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route
            path="auth"
            element={currentUser ? <Navigate to="/dashboard" replace /> : <AuthPage />}
          />

          {/* Onboarding — after signup, before dashboard */}
          <Route
            path="onboard"
            element={
              <ProtectedRoute>
                <OnboardRole />
              </ProtectedRoute>
            }
          />

          {/* Tutor routes */}
          <Route
            path="dashboard"
            element={
              <ProtectedRoute roles={["tutor", "both"]}>
                <TutorDashboard />
              </ProtectedRoute>
            }
          />

          {/* Tutee routes */}
          <Route
            path="find"
            element={
              <ProtectedRoute roles={["tutee", "both"]}>
                <TuteeBooking />
              </ProtectedRoute>
            }
          />
          <Route
            path="tutor/:tutorId"
            element={
              <ProtectedRoute>
                <TutorProfile />
              </ProtectedRoute>
            }
          />

          {/* Rating page — deep linked from email */}
          <Route
            path="rate/:sessionId"
            element={
              <ProtectedRoute>
                <RateSession />
              </ProtectedRoute>
            }
          />

          {/* School Admin */}
          <Route
            path="admin"
            element={
              <ProtectedRoute roles={["schooladmin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Super Admin */}
          <Route
            path="superadmin"
            element={
              <ProtectedRoute roles={["superadmin"]}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Teacher */}
          <Route
            path="teacher"
            element={
              <ProtectedRoute roles={["teacher"]}>
                <TeacherHome />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

// ── Global error fallback ─────────────────────────────────────
function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-gray-600 mb-6">
          An unexpected error occurred. Our team has been notified and is working on a fix.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <BrowserRouter>
        <AuthProvider>
          <SchoolProvider>
            <AppRoutes />
          </SchoolProvider>
        </AuthProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  );
}
