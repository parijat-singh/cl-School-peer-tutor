// src/components/shared/Layout.tsx
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useSchool } from "@/lib/school-context";
import { useState } from "react";
import type React from "react";
import { LogOut, BookOpen, LayoutDashboard, Shield, Search, Menu, X, GraduationCap } from "lucide-react";

export function Layout() {
  const { currentUser, logOut } = useAuth();
  const { school } = useSchool();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logOut();
    navigate("/");
  };

  type NavLink = { to: string; label: string; Icon: React.ElementType; state?: Record<string, unknown> };
  const navLinks: NavLink[] = currentUser
    ? currentUser.role === "superadmin"
      ? [{ to: "/superadmin", label: "Super Admin", Icon: Shield }]
      : currentUser.role === "schooladmin"
      ? [{ to: "/admin", label: "Admin Panel", Icon: Shield }]
      : currentUser.role === "teacher"
      ? [{ to: "/teacher", label: "Teacher Home", Icon: LayoutDashboard }]
      : currentUser.role === "tutee"
      ? [{ to: "/find", label: "Find Tutors", Icon: Search, state: { tab: "search" } }]
      : currentUser.role === "tutor"
      ? [{ to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard }]
      : [
          { to: "/dashboard", label: "Tutor Dashboard", Icon: LayoutDashboard },
          { to: "/find",      label: "Find Tutors",     Icon: Search, state: { tab: "search" } },
        ]
    : [];

  return (
    <div className="min-h-screen bg-gray-50 font-body">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo — school branded when logged in */}
            <NavLink to="/" className="flex items-center gap-2.5">
              {currentUser && school?.logoUrl ? (
                <img
                  src={school.logoUrl}
                  alt={`${school.name} logo`}
                  className="h-7 w-auto object-contain"
                />
              ) : currentUser && school ? (
                <div
                  className="w-7 h-7 rounded flex items-center justify-center"
                  style={{ backgroundColor: school.brandColor || "#0055FF" }}
                >
                  <GraduationCap className="w-4 h-4 text-white" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded bg-brand-500 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
              )}
              <span className="font-display text-lg text-gray-900">
                {currentUser && school ? school.name : "PeerTutor"}
              </span>
            </NavLink>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(({ to, label, Icon, state }) => (
                <NavLink
                  key={to}
                  to={to}
                  state={state}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-brand-50 text-brand-600"
                        : "text-gray-600 hover:bg-gray-100"
                    }`
                  }
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </NavLink>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {currentUser ? (
                <>
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-sm font-medium text-gray-900">{currentUser.name}</span>
                    <span className="text-xs text-gray-500 capitalize">{currentUser.role}</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                    <span className="text-brand-600 text-sm font-semibold">
                      {currentUser.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                    title="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <NavLink
                    to="/contact"
                    className={({ isActive }) =>
                      `hidden sm:inline-flex px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                        isActive ? "bg-brand-50 text-brand-600" : "text-gray-600 hover:bg-gray-100"
                      }`
                    }
                  >
                    Contact
                  </NavLink>
                  <NavLink
                    to="/auth"
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 hover:border-gray-400 transition-colors"
                  >
                    Sign in
                  </NavLink>
                  <NavLink
                    to="/auth?mode=signup"
                    className="px-3 py-1.5 text-sm bg-brand-500 text-white rounded hover:bg-brand-600 transition-colors"
                  >
                    Get started
                  </NavLink>
                </div>
              )}

              {/* Mobile menu toggle */}
              <button
                className="md:hidden p-1.5 text-gray-500"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 px-4 py-3 flex flex-col gap-1">
            {navLinks.map(({ to, label, Icon, state }) => (
              <NavLink
                key={to}
                to={to}
                state={state}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded text-sm font-medium ${
                    isActive ? "bg-brand-50 text-brand-600" : "text-gray-600"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
            {!currentUser && (
              <NavLink
                to="/contact"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded text-sm font-medium ${
                    isActive ? "bg-brand-50 text-brand-600" : "text-gray-600"
                  }`
                }
              >
                Contact
              </NavLink>
            )}
          </div>
        )}
      </nav>

      {/* Page content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-3">
          {/* Links row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center">
                <BookOpen className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-display font-semibold text-gray-700">School PeerTutor</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <NavLink to="/contact" className="hover:text-brand-500 transition-colors">
                Contact Us
              </NavLink>
              <a href="mailto:admin@schoolpeertutor.com" className="hover:text-brand-500 transition-colors">
                admin@schoolpeertutor.com
              </a>
            </div>
          </div>

          {/* Copyright row */}
          <div className="border-t border-gray-100 pt-3 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} School PeerTutor. All rights reserved.
            </p>
            <p className="text-xs text-gray-400 text-center sm:text-right max-w-md">
              The design, concept, branding, and software of this platform are protected by copyright.
              Unauthorized reproduction, distribution, or imitation is strictly prohibited.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
