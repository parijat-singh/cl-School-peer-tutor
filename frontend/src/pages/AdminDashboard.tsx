// src/pages/AdminDashboard.tsx
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSchool } from "@/lib/school-context";
import {
  subscribeStats, subscribeSchoolReviews, usersCol, flagReview,
  getSchoolDoc, uploadSchoolLogo, updateSchoolProfile,
} from "@/lib/firestore";
import { SchoolBanner } from "@/components/shared/SchoolBanner";
// Direct Firestore writes (Cloud Functions don't work in emulator)
import {
  Button, Input, Select, Modal, Toast, Badge, Divider,
} from "@/components/shared/ui";
import type { StatsDoc, ReviewDoc, UserDoc, SchoolDoc } from "@/lib/types";
import { query, where, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Users, Star, CalendarCheck, AlertTriangle, Shield, Flag,
  CheckCircle, Ban, Trash2, Download, UserPlus, UserMinus, UserCheck,
  Upload, GraduationCap,
} from "lucide-react";

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "peertutor-dev";
const emulatorHost = import.meta.env.VITE_EMULATOR_HOST || "localhost";

async function updateCustomClaims(uid: string, claims: Record<string, unknown>) {
  await fetch(
    `http://${emulatorHost}:9099/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer owner" },
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
    }
  );
}
import { format } from "date-fns";

export default function AdminDashboard() {
  const { currentUser } = useAuth();
  const domain = currentUser?.schoolDomain ?? "";

  const [stats, setStats]     = useState<StatsDoc | null>(null);
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [users, setUsers]     = useState<UserDoc[]>([]);
  const [tab, setTab]         = useState<"overview" | "users" | "reviews" | "branding" | "admins">("overview");

  // School doc for primary admin check
  const [schoolDoc, setSchoolDoc] = useState<SchoolDoc | null>(null);
  const isPrimaryAdmin = !!(schoolDoc && currentUser && schoolDoc.adminEmail === currentUser.email);

  // Modals
  const [suspendModal, setSuspendModal]   = useState<UserDoc | null>(null);
  const [suspendDays, setSuspendDays]     = useState("7");
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteReviewModal, setDeleteReviewModal] = useState<ReviewDoc | null>(null);
  const [deleteReason, setDeleteReason]   = useState("");

  // Admin management
  const [addAdminModal, setAddAdminModal] = useState(false);
  const [adminEmail, setAdminEmail]       = useState("");
  const [removeAdminModal, setRemoveAdminModal] = useState<UserDoc | null>(null);

  // Profile editing
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [profileName, setProfileName] = useState("");

  // Branding
  const { school } = useSchool();
  const [brandColor, setBrandColor] = useState("#0055FF");
  const [schoolName, setSchoolName] = useState("");
  const [campus, setCampus] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingBranding, setSavingBranding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync branding state when school doc loads
  useEffect(() => {
    if (school) {
      setBrandColor(school.brandColor || "#0055FF");
      setSchoolName(school.name || "");
      setCampus(school.campus || "");
      setLogoPreview(school.logoUrl || null);
    }
  }, [school]);

  // Search / filter
  const [userSearch, setUserSearch] = useState("");

  const [toast, setToast] = useState<{ msg: string; type: "success"|"error" } | null>(null);

  useEffect(() => {
    if (!domain) return;
    const u1 = subscribeStats(domain, setStats);
    const u2 = subscribeSchoolReviews(domain, setReviews);
    const q = query(usersCol(), where("schoolDomain", "==", domain));
    const u3 = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserDoc)));
    });
    // Fetch school doc for primary admin check
    getSchoolDoc(domain).then(setSchoolDoc);
    return () => { u1(); u2(); u3(); };
  }, [domain]);

  const schoolAdmins = users.filter((u) => u.role === "schooladmin");
  const nonAdminUsers = users.filter((u) => !["schooladmin", "superadmin"].includes(u.role));

  const handleAddAdmin = async () => {
    if (!adminEmail || !domain || !currentUser) return;
    const target = users.find((u) => u.email.toLowerCase() === adminEmail.toLowerCase());
    if (!target) {
      setToast({ msg: "User not found in this school", type: "error" });
      setAddAdminModal(false);
      setAdminEmail("");
      return;
    }
    if (target.role === "schooladmin") {
      setToast({ msg: "User is already a school admin", type: "error" });
      setAddAdminModal(false);
      setAdminEmail("");
      return;
    }
    try {
      await updateDoc(doc(db, "users", target.uid), {
        role: "schooladmin",
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "adminAuditLog"), {
        adminUid: currentUser.uid,
        action: "promote_schooladmin",
        targetId: target.uid,
        schoolDomain: domain,
        timestamp: serverTimestamp(),
      });
      await updateCustomClaims(target.uid, {
        role: "schooladmin",
        schoolDomain: domain,
        status: target.status,
      });
      setToast({ msg: `${target.name} promoted to school admin`, type: "success" });
    } catch {
      setToast({ msg: "Failed to promote user", type: "error" });
    }
    setAddAdminModal(false);
    setAdminEmail("");
  };

  const handleRemoveAdmin = async () => {
    if (!removeAdminModal || !currentUser || !domain) return;
    try {
      await updateDoc(doc(db, "users", removeAdminModal.uid), {
        role: "tutor",
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "adminAuditLog"), {
        adminUid: currentUser.uid,
        action: "demote_schooladmin",
        targetId: removeAdminModal.uid,
        schoolDomain: domain,
        timestamp: serverTimestamp(),
      });
      await updateCustomClaims(removeAdminModal.uid, {
        role: "tutor",
        schoolDomain: domain,
        status: removeAdminModal.status,
      });
      setToast({ msg: `${removeAdminModal.name} removed as school admin`, type: "success" });
    } catch {
      setToast({ msg: "Failed to remove admin", type: "error" });
    }
    setRemoveAdminModal(null);
  };

  const handleSaveProfile = async () => {
    if (!currentUser || !profileName) return;
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        name: profileName,
        updatedAt: serverTimestamp(),
      });
      setToast({ msg: "Profile updated", type: "success" });
      setEditProfileModal(false);
    } catch {
      setToast({ msg: "Update failed", type: "error" });
    }
  };

  const handleApproveUser = async (user: UserDoc) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        status: "active",
        updatedAt: serverTimestamp(),
      });
      await updateCustomClaims(user.uid, {
        role: user.role,
        schoolDomain: user.schoolDomain,
        status: "active",
      });
      await addDoc(collection(db, "adminAuditLog"), {
        adminUid: currentUser.uid,
        action: "approve_user",
        targetId: user.uid,
        schoolDomain: domain,
        timestamp: serverTimestamp(),
      });
      setToast({ msg: `${user.name} approved`, type: "success" });
    } catch {
      setToast({ msg: "Approve failed", type: "error" });
    }
  };

  const handleSuspend = async () => {
    if (!suspendModal || !currentUser) return;
    try {
      await updateDoc(doc(db, "users", suspendModal.uid), {
        status: "suspended",
        updatedAt: serverTimestamp(),
      });
      await updateCustomClaims(suspendModal.uid, {
        role: suspendModal.role,
        schoolDomain: suspendModal.schoolDomain,
        status: "suspended",
      });
      await addDoc(collection(db, "adminAuditLog"), {
        adminUid: currentUser.uid,
        action: "suspend_user",
        targetId: suspendModal.uid,
        reason: suspendReason,
        metadata: { durationDays: suspendDays === "indefinite" ? null : Number(suspendDays) },
        schoolDomain: domain,
        timestamp: serverTimestamp(),
      });
      setToast({ msg: `${suspendModal.name} suspended`, type: "success" });
    } catch {
      setToast({ msg: "Suspend failed", type: "error" });
    }
    setSuspendModal(null);
    setSuspendReason("");
  };

  const handleUnsuspend = async (user: UserDoc) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        status: "active",
        updatedAt: serverTimestamp(),
      });
      await updateCustomClaims(user.uid, {
        role: user.role,
        schoolDomain: user.schoolDomain,
        status: "active",
      });
      await addDoc(collection(db, "adminAuditLog"), {
        adminUid: currentUser.uid,
        action: "unsuspend_user",
        targetId: user.uid,
        schoolDomain: domain,
        timestamp: serverTimestamp(),
      });
      setToast({ msg: `${user.name} reinstated`, type: "success" });
    } catch {
      setToast({ msg: "Unsuspend failed", type: "error" });
    }
  };

  const handleDeleteReview = async () => {
    if (!deleteReviewModal || !currentUser) return;
    try {
      await deleteDoc(doc(db, "reviews", deleteReviewModal.id));
      await addDoc(collection(db, "adminAuditLog"), {
        adminUid: currentUser.uid,
        action: "delete_review",
        targetId: deleteReviewModal.id,
        reason: deleteReason,
        schoolDomain: domain,
        timestamp: serverTimestamp(),
      });
      setToast({ msg: "Review removed", type: "success" });
    } catch {
      setToast({ msg: "Delete failed", type: "error" });
    }
    setDeleteReviewModal(null);
    setDeleteReason("");
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const flaggedReviews = reviews.filter((r) => r.flagged);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* School Banner */}
      <SchoolBanner variant="full" className="mb-4" />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-brand-500" />
            <h1 className="font-display text-3xl text-gray-900">School Admin Dashboard</h1>
          </div>
          <p className="text-gray-500 text-sm">{domain} · School Administrator</p>
        </div>
        <Button variant="secondary" onClick={() => {
          setProfileName(currentUser?.name ?? "");
          setEditProfileModal(true);
        }}>
          Edit Profile
        </Button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {([
          { key: "overview", label: "Overview" },
          { key: "users",    label: `Users (${users.length})` },
          { key: "reviews",  label: `Reviews${flaggedReviews.length > 0 ? ` · ${flaggedReviews.length} flagged` : ""}` },
          { key: "branding", label: "Branding" },
          ...(isPrimaryAdmin ? [{ key: "admins" as const, label: `School Admins (${schoolAdmins.length})` }] : []),
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === key
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Users,        label: "Total Users",       val: stats?.totalUsers ?? 0,          color: "text-brand-600" },
              { icon: Shield,       label: "Active Tutors",     val: stats?.activeTutors ?? 0,        color: "text-green-600" },
              { icon: CalendarCheck,label: "Sessions This Month", val: stats?.sessionsThisMonth ?? 0, color: "text-amber-600" },
              { icon: Star,         label: "Avg Rating",        val: stats?.avgRating?.toFixed(1) ?? "—", color: "text-yellow-500" },
            ].map(({ icon: Icon, label, val, color }) => (
              <div key={label} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className={`w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center mb-3 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="font-display text-3xl text-gray-900">{val}</div>
                <div className="text-sm text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {flaggedReviews.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <p className="text-sm font-medium text-red-700">
                  {flaggedReviews.length} flagged review{flaggedReviews.length > 1 ? "s" : ""} need attention
                </p>
              </div>
              <Button size="sm" variant="danger" onClick={() => setTab("reviews")}>
                Review Now
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Users ── */}
      {tab === "users" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Input
              placeholder="Search by name or email…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button size="sm" variant="secondary">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Name", "Email", "Grade", "Role", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3 text-gray-500">{user.grade}</td>
                    <td className="px-4 py-3">
                      <Badge color={user.role === "schooladmin" ? "purple" : user.role === "teacher" ? "indigo" : user.role === "tutor" ? "blue" : user.role === "tutee" ? "green" : "amber"}>
                        {user.role === "schooladmin" ? "admin" : user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={
                        user.status === "active" ? "green" :
                        user.status === "suspended" ? "red" : "amber"
                      }>
                        {user.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {user.status === "pending" ? (
                          <button
                            onClick={() => handleApproveUser(user)}
                            className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                            title="Approve user"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        ) : user.status === "suspended" ? (
                          <button
                            onClick={() => handleUnsuspend(user)}
                            className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                            title="Reinstate user"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => { setSuspendModal(user); setSuspendDays("7"); }}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="Suspend user"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">No users found</div>
            )}
          </div>
        </div>
      )}

      {/* ── Reviews ── */}
      {tab === "reviews" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-display text-xl text-gray-900">All Reviews</h2>
            {flaggedReviews.length > 0 && (
              <Badge color="red">{flaggedReviews.length} flagged</Badge>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {reviews.map((r) => (
              <div
                key={r.id}
                className={`bg-white border rounded-lg p-4 ${r.flagged ? "border-red-200 bg-red-50" : "border-gray-100"}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-gray-900">
                        {r.authorName} → {r.targetName}
                      </p>
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={`text-xs ${i < r.stars ? "text-amber-400" : "text-gray-200"}`}>★</span>
                        ))}
                      </div>
                      {r.flagged && (
                        <Badge color="red">
                          <Flag className="w-2.5 h-2.5 inline mr-0.5" /> Flagged
                        </Badge>
                      )}
                    </div>
                    {r.text && <p className="text-sm text-gray-600">{r.text}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      {format(r.createdAt.toDate(), "MMM d, yyyy")}
                    </p>
                  </div>
                  <button
                    onClick={() => setDeleteReviewModal(r)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                    title="Delete review"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {reviews.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">No reviews yet</div>
            )}
          </div>
        </div>
      )}

      {/* ── Branding ── */}
      {tab === "branding" && (
        <div className="max-w-lg">
          <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-5">
            <div>
              <h2 className="font-display text-xl text-gray-900 mb-1">School Branding</h2>
              <p className="text-sm text-gray-500">
                Customize how PeerTutor looks for your school. Changes are visible to all students and staff.
              </p>
            </div>
            <Divider />

            {/* School Name */}
            <Input
              label="School Name"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="Lincoln High School"
            />

            {/* Campus */}
            <Input
              label="Campus / Location"
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              placeholder="Main Campus, Building A"
              hint="Shown to students alongside the school name"
            />

            <Divider />

            {/* Brand Color */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                Brand Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer border border-gray-200"
                />
                <Input
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  placeholder="#0055FF"
                  className="font-mono"
                />
              </div>
            </div>

            <Divider />

            {/* School Logo */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                School Logo
              </label>

              {/* Preview */}
              {logoPreview ? (
                <div className="mb-3 flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <img
                    src={logoPreview}
                    alt="School logo preview"
                    className="h-16 w-auto object-contain rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">
                      {logoFile ? logoFile.name : "Current logo"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {logoFile ? `${(logoFile.size / 1024).toFixed(0)} KB` : "Uploaded"}
                    </p>
                  </div>
                  <button
                    onClick={() => { setLogoPreview(school?.logoUrl || null); setLogoFile(null); }}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : null}

              {/* Upload zone */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 500 * 1024) {
                    setToast({ msg: "Logo must be under 500 KB", type: "error" });
                    return;
                  }
                  setLogoFile(file);
                  setLogoPreview(URL.createObjectURL(file));
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 hover:border-brand-300 rounded-lg p-6 text-center text-gray-400 hover:text-brand-500 transition-colors cursor-pointer"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 opacity-60" />
                <p className="text-sm font-medium">Click to upload logo</p>
                <p className="text-xs mt-1">PNG, JPG, SVG, or WebP. Max 500 KB. Recommended: 200x60px</p>
              </button>
            </div>

            {/* Live preview */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                Preview
              </label>
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 flex items-center gap-3">
                {logoPreview ? (
                  <img src={logoPreview} alt="Preview" className="h-10 w-auto object-contain rounded" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: brandColor || "#0055FF" }}
                  >
                    <GraduationCap className="w-5 h-5 text-white" />
                  </div>
                )}
                <div>
                  <p className="font-display text-base text-gray-900">{schoolName || "School Name"}</p>
                  <p className="text-xs text-gray-500">
                    {domain}
                    {campus && <> | {campus}</>}
                  </p>
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              loading={savingBranding}
              onClick={async () => {
                if (!domain) return;
                setSavingBranding(true);
                try {
                  // Upload logo if a new file was selected
                  if (logoFile) {
                    await uploadSchoolLogo(domain, logoFile);
                    setLogoFile(null);
                  }
                  // Update school profile fields
                  await updateSchoolProfile(domain, {
                    name: schoolName || undefined,
                    campus: campus || undefined,
                    brandColor: brandColor || undefined,
                  });
                  // Audit log
                  if (currentUser) {
                    await addDoc(collection(db, "adminAuditLog"), {
                      adminUid: currentUser.uid,
                      action: "update_branding",
                      targetId: domain,
                      schoolDomain: domain,
                      timestamp: serverTimestamp(),
                    });
                  }
                  setToast({ msg: "Branding saved! Changes are live.", type: "success" });
                } catch (err) {
                  console.error("Branding save failed:", err);
                  setToast({ msg: "Failed to save branding", type: "error" });
                } finally {
                  setSavingBranding(false);
                }
              }}
            >
              Save Branding
            </Button>
          </div>
        </div>
      )}

      {/* ── School Admins ── */}
      {tab === "admins" && isPrimaryAdmin && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-gray-900">School Administrators</h2>
            <Button size="sm" onClick={() => setAddAdminModal(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Add Admin
            </Button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Name", "Email", "Status", "Type", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {schoolAdmins.map((admin) => {
                  const isPrimary = admin.email === schoolDoc?.adminEmail;
                  return (
                    <tr key={admin.uid} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{admin.name}</td>
                      <td className="px-4 py-3 text-gray-500">{admin.email}</td>
                      <td className="px-4 py-3">
                        <Badge color={admin.status === "active" ? "green" : "red"}>
                          {admin.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={isPrimary ? "blue" : "gray"}>
                          {isPrimary ? "Primary" : "Added"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {!isPrimary && (
                          <button
                            onClick={() => setRemoveAdminModal(admin)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="Remove admin role"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {schoolAdmins.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">No school admins</div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Admin Modal ── */}
      <Modal open={addAdminModal} onClose={() => { setAddAdminModal(false); setAdminEmail(""); }} title="Add School Admin">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Enter the email of a user at your school to promote them to school admin.
            They will be able to manage users, reviews, and branding, but <strong>cannot add more admins</strong>.
          </p>
          <Select
            label="Select User"
            options={nonAdminUsers.map((u) => ({ value: u.email, label: `${u.name} (${u.email})` }))}
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <Divider />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setAddAdminModal(false); setAdminEmail(""); }}>Cancel</Button>
            <Button onClick={handleAddAdmin} disabled={!adminEmail}>
              Promote to Admin
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Remove Admin Modal ── */}
      <Modal open={!!removeAdminModal} onClose={() => setRemoveAdminModal(null)} title="Remove School Admin">
        {removeAdminModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Remove <strong>{removeAdminModal.name}</strong> as a school admin?
              They will be reverted to a regular tutor role.
            </p>
            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoveAdminModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleRemoveAdmin}>
                Remove Admin
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Suspend Modal ── */}
      <Modal open={!!suspendModal} onClose={() => setSuspendModal(null)} title="Suspend Account">
        {suspendModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Suspend <strong>{suspendModal.name}</strong>? This will:
            </p>
            <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
              <li>Disable their login immediately</li>
              <li>Cancel all upcoming sessions</li>
              <li>Notify affected tutors/tutees by email</li>
            </ul>
            <Select
              label="Duration"
              options={[
                { value: "1", label: "1 day" },
                { value: "3", label: "3 days" },
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
                { value: "indefinite", label: "Indefinite" },
              ]}
              value={suspendDays}
              onChange={(e) => setSuspendDays(e.target.value)}
            />
            <Input
              label="Reason (internal)"
              placeholder="Policy violation, inappropriate conduct…"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSuspendModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleSuspend} disabled={!suspendReason}>
                Suspend Account
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Review Modal ── */}
      <Modal open={!!deleteReviewModal} onClose={() => setDeleteReviewModal(null)} title="Delete Review">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Permanently remove this review? This action is logged in the audit trail.
          </p>
          <Input
            label="Reason"
            placeholder="Violates community guidelines…"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
          <Divider />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteReviewModal(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDeleteReview} disabled={!deleteReason}>
              Delete Review
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Profile Modal ── */}
      <Modal open={editProfileModal} onClose={() => setEditProfileModal(false)} title="Edit Profile">
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
          />
          <p className="text-xs text-gray-400">Email cannot be changed: {currentUser?.email}</p>
          <Divider />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditProfileModal(false)}>Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={!profileName}>Save</Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
