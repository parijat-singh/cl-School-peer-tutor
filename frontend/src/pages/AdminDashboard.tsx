// src/pages/AdminDashboard.tsx
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeStats, subscribeSchoolReviews, usersCol, flagReview,
} from "@/lib/firestore";
import { suspendUser, unsuspendUser, deleteReview } from "@/lib/functions";
import {
  Button, Input, Select, Modal, Toast, Badge, Divider,
} from "@/components/shared/ui";
import type { StatsDoc, ReviewDoc, UserDoc } from "@/lib/types";
import { query, where, onSnapshot } from "firebase/firestore";
import {
  Users, Star, CalendarCheck, AlertTriangle, Shield, Flag,
  CheckCircle, Ban, Trash2, Download, Palette,
} from "lucide-react";
import { format } from "date-fns";

export default function AdminDashboard() {
  const { currentUser } = useAuth();
  const domain = currentUser?.schoolDomain ?? "";

  const [stats, setStats]     = useState<StatsDoc | null>(null);
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [users, setUsers]     = useState<UserDoc[]>([]);
  const [tab, setTab]         = useState<"overview" | "users" | "reviews" | "branding">("overview");

  // Modals
  const [suspendModal, setSuspendModal]   = useState<UserDoc | null>(null);
  const [suspendDays, setSuspendDays]     = useState("7");
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteReviewModal, setDeleteReviewModal] = useState<ReviewDoc | null>(null);
  const [deleteReason, setDeleteReason]   = useState("");

  // Branding
  const [brandColor, setBrandColor] = useState("#0055FF");

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
    return () => { u1(); u2(); u3(); };
  }, [domain]);

  const handleSuspend = async () => {
    if (!suspendModal) return;
    try {
      await suspendUser({
        targetUid: suspendModal.uid,
        durationDays: suspendDays === "indefinite" ? null : Number(suspendDays),
        reason: suspendReason,
      });
      setToast({ msg: `${suspendModal.name} suspended`, type: "success" });
    } catch {
      setToast({ msg: "Suspend failed", type: "error" });
    }
    setSuspendModal(null);
    setSuspendReason("");
  };

  const handleUnsuspend = async (user: UserDoc) => {
    try {
      await unsuspendUser({ targetUid: user.uid });
      setToast({ msg: `${user.name} reinstated`, type: "success" });
    } catch {
      setToast({ msg: "Unsuspend failed", type: "error" });
    }
  };

  const handleDeleteReview = async () => {
    if (!deleteReviewModal) return;
    try {
      await deleteReview({ reviewId: deleteReviewModal.id, reason: deleteReason });
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
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-brand-500" />
          <h1 className="font-display text-3xl text-gray-900">Admin Dashboard</h1>
        </div>
        <p className="text-gray-500 text-sm">{domain} · School Administrator</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {([
          { key: "overview", label: "Overview" },
          { key: "users",    label: `Users (${users.length})` },
          { key: "reviews",  label: `Reviews${flaggedReviews.length > 0 ? ` · ${flaggedReviews.length} flagged` : ""}` },
          { key: "branding", label: "Branding" },
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
                      <Badge color={user.role === "tutor" ? "blue" : user.role === "tutee" ? "green" : "amber"}>
                        {user.role}
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
                        {user.status !== "suspended" ? (
                          <button
                            onClick={() => { setSuspendModal(user); setSuspendDays("7"); }}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="Suspend user"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUnsuspend(user)}
                            className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                            title="Reinstate user"
                          >
                            <CheckCircle className="w-4 h-4" />
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
        <div className="max-w-md">
          <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-5">
            <div>
              <h2 className="font-display text-xl text-gray-900 mb-1">School Branding</h2>
              <p className="text-sm text-gray-500">
                Customize how PeerTutor looks for your school.
              </p>
            </div>
            <Divider />
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
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                School Logo
              </label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400">
                <Palette className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Drop a PNG or SVG here</p>
                <p className="text-xs mt-1">Recommended: 200×60px</p>
              </div>
            </div>
            <Button className="w-full">Save Branding</Button>
          </div>
        </div>
      )}

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

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
