// src/pages/SuperAdminDashboard.tsx
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { subscribeAllSchools, subscribeAllSuperAdmins, usersCol } from "@/lib/firestore";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  Button, Input, Select, Modal, Toast, Badge, Divider,
} from "@/components/shared/ui";
import type { SchoolDoc, SchoolStatus, UserDoc } from "@/lib/types";
import { query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Crown, CheckCircle, XCircle, Trash2,
  UserPlus, Building, Plus, RefreshCw, Pencil, Shield, KeyRound,
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

// Derive effective status from school doc (backward compat: old docs lack `status` field)
function getSchoolStatus(school: SchoolDoc): SchoolStatus {
  if (school.status) return school.status;
  return school.approved ? "approved" : "pending";
}

const statusConfig: Record<SchoolStatus, { label: string; color: "green" | "amber" | "red" }> = {
  approved: { label: "Approved", color: "green" },
  pending:  { label: "Pending",  color: "amber" },
  rejected: { label: "Rejected", color: "red" },
};

export default function SuperAdminDashboard() {
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<"schools" | "admins">("schools");

  // Data
  const [schools, setSchools]       = useState<SchoolDoc[]>([]);
  const [superAdmins, setSuperAdmins] = useState<UserDoc[]>([]);

  // Modals
  const [rejectModal, setRejectModal]   = useState<SchoolDoc | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [removeModal, setRemoveModal]   = useState<SchoolDoc | null>(null);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteModal, setPromoteModal] = useState(false);
  const [addSchoolModal, setAddSchoolModal] = useState(false);

  // Promote to School Admin modal
  const [promoteSchoolAdminModal, setPromoteSchoolAdminModal] = useState<SchoolDoc | null>(null);
  const [promoteSchoolAdminEmail, setPromoteSchoolAdminEmail] = useState("");

  // Edit School modal
  const [editModal, setEditModal] = useState<SchoolDoc | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    type: "high" as "middle" | "high" | "k12",
    adminEmail: "",
    campus: "",
    address: "",
    location: "",
  });
  const [editLoading, setEditLoading] = useState(false);

  // Add School form state
  const [newSchool, setNewSchool] = useState({
    domain: "",
    name: "",
    type: "high" as "middle" | "high" | "k12",
    adminEmail: "",
    campus: "",
    address: "",
    location: "",
  });
  const [addSchoolLoading, setAddSchoolLoading] = useState(false);

  // Filter
  const [schoolFilter, setSchoolFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Change password modal
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    const u1 = subscribeAllSchools(setSchools);
    const u2 = subscribeAllSuperAdmins(setSuperAdmins);
    return () => { u1(); u2(); };
  }, []);

  const filteredSchools = schools.filter((s) => {
    if (schoolFilter === "all") return true;
    return getSchoolStatus(s) === schoolFilter;
  });

  const pendingCount  = schools.filter((s) => getSchoolStatus(s) === "pending").length;
  const rejectedCount = schools.filter((s) => getSchoolStatus(s) === "rejected").length;

  const handleApprove = async (domain: string) => {
    try {
      const schoolDoc = schools.find((s) => s.domain === domain);
      await updateDoc(doc(db, "schools", domain), { approved: true, status: "approved" });

      // Auto-activate the designated school admin if they already have an account
      if (schoolDoc?.adminEmail) {
        const q = query(usersCol(), where("email", "==", schoolDoc.adminEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const adminUid = snap.docs[0].id;
          await updateDoc(doc(db, "users", adminUid), {
            role: "schooladmin",
            status: "active",
            schoolDomain: domain,
            updatedAt: serverTimestamp(),
          });
          await updateCustomClaims(adminUid, {
            role: "schooladmin",
            schoolDomain: domain,
            status: "active",
          });
        }
      }

      setToast({ msg: `${domain} approved`, type: "success" });
    } catch {
      setToast({ msg: "Approve failed", type: "error" });
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await updateDoc(doc(db, "schools", rejectModal.domain), { approved: false, status: "rejected" });
      setToast({ msg: `${rejectModal.domain} rejected`, type: "success" });
    } catch {
      setToast({ msg: "Reject failed", type: "error" });
    }
    setRejectModal(null);
    setRejectReason("");
  };

  const handleRemove = async () => {
    if (!removeModal) return;
    try {
      await updateDoc(doc(db, "schools", removeModal.domain), { approved: false, status: "rejected" });
      setToast({ msg: `${removeModal.domain} removed`, type: "success" });
    } catch {
      setToast({ msg: "Remove failed", type: "error" });
    }
    setRemoveModal(null);
  };

  const handleReactivate = async (domain: string) => {
    try {
      await updateDoc(doc(db, "schools", domain), { approved: true, status: "approved" });
      setToast({ msg: `${domain} reactivated`, type: "success" });
    } catch {
      setToast({ msg: "Reactivate failed", type: "error" });
    }
  };

  const openEditModal = (school: SchoolDoc) => {
    setEditForm({
      name: school.name,
      type: school.type,
      adminEmail: school.adminEmail ?? "",
      campus: school.campus ?? "",
      address: school.address ?? "",
      location: school.location ?? "",
    });
    setEditModal(school);
  };

  const handleEditSchool = async () => {
    if (!editModal) return;
    setEditLoading(true);
    try {
      await updateDoc(doc(db, "schools", editModal.domain), {
        name: editForm.name,
        type: editForm.type,
        adminEmail: editForm.adminEmail,
        campus: editForm.campus,
        address: editForm.address,
        location: editForm.location,
      });
      setToast({ msg: `${editForm.name} updated`, type: "success" });
      setEditModal(null);
    } catch {
      setToast({ msg: "Update failed", type: "error" });
    } finally {
      setEditLoading(false);
    }
  };

  const updateEditField = (field: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePromote = async () => {
    if (!promoteEmail) return;
    try {
      const q = query(usersCol(), where("email", "==", promoteEmail));
      const snap = await getDocs(q);
      if (snap.empty) {
        setToast({ msg: "User not found with that email", type: "error" });
        return;
      }
      const targetUid = snap.docs[0].id;
      await updateDoc(doc(db, "users", targetUid), {
        role: "superadmin",
        schoolDomain: null,
        grade: null,
        updatedAt: serverTimestamp(),
      });
      setToast({ msg: `${promoteEmail} promoted to Super Admin`, type: "success" });
    } catch {
      setToast({ msg: "Promote failed", type: "error" });
    }
    setPromoteModal(false);
    setPromoteEmail("");
  };

  const handlePromoteSchoolAdmin = async () => {
    if (!promoteSchoolAdminEmail || !promoteSchoolAdminModal || !currentUser) return;
    const targetDomain = promoteSchoolAdminModal.domain;
    try {
      const q = query(usersCol(), where("email", "==", promoteSchoolAdminEmail), where("schoolDomain", "==", targetDomain));
      const snap = await getDocs(q);
      if (snap.empty) {
        setToast({ msg: `No user found with that email at ${targetDomain}`, type: "error" });
        return;
      }
      const targetDoc = snap.docs[0];
      const targetUid = targetDoc.id;
      await updateDoc(doc(db, "users", targetUid), {
        role: "schooladmin",
        status: "active",
        updatedAt: serverTimestamp(),
      });
      await updateCustomClaims(targetUid, {
        role: "schooladmin",
        schoolDomain: targetDomain,
        status: "active",
      });
      await addDoc(collection(db, "adminAuditLog"), {
        adminUid: currentUser.uid,
        action: "promote_schooladmin",
        targetId: targetUid,
        schoolDomain: targetDomain,
        timestamp: serverTimestamp(),
      });
      // Also set as admin email on school doc if none exists
      if (!promoteSchoolAdminModal.adminEmail) {
        await updateDoc(doc(db, "schools", targetDomain), { adminEmail: promoteSchoolAdminEmail });
      }
      setToast({ msg: `${promoteSchoolAdminEmail} promoted to School Admin for ${targetDomain}`, type: "success" });
    } catch {
      setToast({ msg: "Promote failed", type: "error" });
    }
    setPromoteSchoolAdminModal(null);
    setPromoteSchoolAdminEmail("");
  };

  const handleAddSchool = async () => {
    const { domain, name, type, adminEmail, campus, address, location } = newSchool;
    if (!domain || !name || !type || !adminEmail || !campus || !address || !location) {
      setToast({ msg: "All fields are required", type: "error" });
      return;
    }
    setAddSchoolLoading(true);
    try {
      const domainLower = domain.toLowerCase();
      await setDoc(doc(db, "schools", domainLower), {
        domain: domainLower,
        name,
        type,
        adminEmail,
        campus,
        address,
        location,
        approved: true,
        status: "approved",
        brandColor: "#0055FF",
        logoUrl: null,
        subjects: [
          "Algebra", "Geometry", "Pre-Calculus", "Calculus", "Statistics",
          "Biology", "Chemistry", "Physics", "Earth Science",
          "English", "History", "Spanish", "French", "Computer Science", "Economics",
        ],
        createdAt: serverTimestamp(),
      });
      setToast({ msg: `${name} (${domainLower}) added successfully`, type: "success" });
      setAddSchoolModal(false);
      setNewSchool({ domain: "", name: "", type: "high", adminEmail: "", campus: "", address: "", location: "" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add school";
      setToast({ msg, type: "error" });
    } finally {
      setAddSchoolLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setNewSchool((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangePassword = async () => {
    setPwError("");
    if (pwForm.next.length < 8) { setPwError("New password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(pwForm.next)) { setPwError("Must contain an uppercase letter"); return; }
    if (!/[0-9]/.test(pwForm.next)) { setPwError("Must contain a number"); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError("Passwords do not match"); return; }

    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.email) { setPwError("No authenticated user"); return; }

    setPwLoading(true);
    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, pwForm.current);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, pwForm.next);
      setPwModal(false);
      setPwForm({ current: "", next: "", confirm: "" });
      setToast({ msg: "Password changed successfully", type: "success" });
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPwError("Current password is incorrect");
      } else if (code === "auth/too-many-requests") {
        setPwError("Too many attempts. Try again later");
      } else {
        setPwError("Failed to change password. Try signing out and back in first");
      }
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-5 h-5 text-amber-500" />
            <h1 className="font-display text-3xl text-gray-900">Super Admin</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Manage schools, domains, and administrators
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setPwForm({ current: "", next: "", confirm: "" }); setPwError(""); setPwModal(true); }}>
          <KeyRound className="w-3.5 h-3.5" /> Change Password
        </Button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([
          { key: "schools" as const, label: `Schools (${schools.length})${pendingCount > 0 ? ` · ${pendingCount} pending` : ""}` },
          { key: "admins" as const,  label: `Super Admins (${superAdmins.length})` },
        ]).map(({ key, label }) => (
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

      {/* ── Schools Tab ── */}
      {tab === "schools" && (
        <div>
          {/* Filter pills + Add School button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setSchoolFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    schoolFilter === f
                      ? "bg-brand-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {f === "all" ? "All" : f === "pending" ? `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` : f === "approved" ? "Approved" : `Rejected${rejectedCount > 0 ? ` (${rejectedCount})` : ""}`}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => setAddSchoolModal(true)}>
              <Plus className="w-3.5 h-3.5" /> Add School
            </Button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["School", "Domain", "Type", "Campus", "Location", "Admin Email", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSchools.map((school) => {
                  const st = getSchoolStatus(school);
                  const cfg = statusConfig[st];
                  return (
                    <tr key={school.domain} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-gray-400" />
                          {school.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{school.domain}</td>
                      <td className="px-4 py-3">
                        <Badge color="blue">{school.type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{school.campus ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{school.location ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{school.adminEmail ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge color={cfg.color}>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditModal(school)}
                            className="p-1.5 text-gray-400 hover:text-brand-500 transition-colors"
                            title="Edit school"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {st === "pending" && (
                            <>
                              <button
                                onClick={() => handleApprove(school.domain)}
                                className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                                title="Approve school"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setRejectModal(school)}
                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                title="Reject school"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {st === "approved" && (
                            <>
                              <button
                                onClick={() => setPromoteSchoolAdminModal(school)}
                                className="p-1.5 text-gray-400 hover:text-purple-500 transition-colors"
                                title="Promote user to School Admin"
                              >
                                <Shield className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setRemoveModal(school)}
                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                title="Remove school"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {st === "rejected" && (
                            <button
                              onClick={() => handleReactivate(school.domain)}
                              className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                              title="Reactivate school"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredSchools.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">No schools found</div>
            )}
          </div>
        </div>
      )}

      {/* ── Super Admins Tab ── */}
      {tab === "admins" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-gray-900">Super Admins</h2>
            <Button size="sm" onClick={() => setPromoteModal(true)}>
              <UserPlus className="w-3.5 h-3.5" /> Promote User
            </Button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Name", "Email", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {superAdmins.map((admin) => (
                  <tr key={admin.uid} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-500" />
                        {admin.name}
                        {admin.uid === currentUser?.uid && (
                          <span className="text-xs text-gray-400">(you)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{admin.email}</td>
                    <td className="px-4 py-3">
                      <Badge color="green">{admin.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {superAdmins.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">No super admins found</div>
            )}
          </div>
        </div>
      )}

      {/* ── Add School Modal ── */}
      <Modal open={addSchoolModal} onClose={() => setAddSchoolModal(false)} title="Add New School" maxWidth="max-w-xl">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Add a new school and authorize its email domain for sign-ups.
            Only users with an email from this domain will be able to register.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="School Name"
              placeholder="Lincoln High School"
              value={newSchool.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
            <Input
              label="Email Domain"
              placeholder="lincoln.k12.ca.us"
              hint="e.g. school.edu or school.k12.ca.us"
              value={newSchool.domain}
              onChange={(e) => updateField("domain", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="School Type"
              value={newSchool.type}
              onChange={(e) => updateField("type", e.target.value)}
              options={[
                { value: "high", label: "High School" },
                { value: "middle", label: "Middle School" },
                { value: "k12", label: "K-12" },
              ]}
            />
            <Input
              label="Admin Email"
              type="email"
              placeholder="admin@lincoln.k12.ca.us"
              hint="School admin's email address"
              value={newSchool.adminEmail}
              onChange={(e) => updateField("adminEmail", e.target.value)}
            />
          </div>

          <Input
            label="Campus Name"
            placeholder="Main Campus"
            value={newSchool.campus}
            onChange={(e) => updateField("campus", e.target.value)}
          />

          <Input
            label="Address"
            placeholder="123 School Ave, City, State 12345"
            value={newSchool.address}
            onChange={(e) => updateField("address", e.target.value)}
          />

          <Input
            label="Location"
            placeholder="City, State"
            hint="City and state for display"
            value={newSchool.location}
            onChange={(e) => updateField("location", e.target.value)}
          />

          <Divider />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddSchoolModal(false)}>Cancel</Button>
            <Button
              onClick={handleAddSchool}
              loading={addSchoolLoading}
              disabled={!newSchool.domain || !newSchool.name || !newSchool.adminEmail || !newSchool.campus || !newSchool.address || !newSchool.location}
            >
              <Plus className="w-3.5 h-3.5" /> Add School
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit School Modal ── */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={`Edit ${editModal?.name ?? "School"}`} maxWidth="max-w-xl">
        {editModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Edit details for <strong>{editModal.domain}</strong>. Domain cannot be changed.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="School Name"
                value={editForm.name}
                onChange={(e) => updateEditField("name", e.target.value)}
              />
              <Select
                label="School Type"
                value={editForm.type}
                onChange={(e) => updateEditField("type", e.target.value)}
                options={[
                  { value: "high", label: "High School" },
                  { value: "middle", label: "Middle School" },
                  { value: "k12", label: "K-12" },
                ]}
              />
            </div>

            <Input
              label="Admin Email"
              type="email"
              value={editForm.adminEmail}
              onChange={(e) => updateEditField("adminEmail", e.target.value)}
            />

            <Input
              label="Campus Name"
              value={editForm.campus}
              onChange={(e) => updateEditField("campus", e.target.value)}
            />

            <Input
              label="Address"
              value={editForm.address}
              onChange={(e) => updateEditField("address", e.target.value)}
            />

            <Input
              label="Location"
              value={editForm.location}
              onChange={(e) => updateEditField("location", e.target.value)}
            />

            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditModal(null)}>Cancel</Button>
              <Button
                onClick={handleEditSchool}
                loading={editLoading}
                disabled={!editForm.name}
              >
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Reject School Modal ── */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject School">
        {rejectModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Reject <strong>{rejectModal.name}</strong> ({rejectModal.domain})?
              Users from this domain will not be able to sign up.
            </p>
            <Input
              label="Reason"
              placeholder="Not a verified educational institution..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRejectModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleReject} disabled={!rejectReason}>
                Reject School
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Remove School Modal ── */}
      <Modal open={!!removeModal} onClose={() => setRemoveModal(null)} title="Remove School">
        {removeModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Remove <strong>{removeModal.name}</strong> ({removeModal.domain})?
              New signups from this domain will be blocked.
            </p>
            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoveModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleRemove}>
                Remove School
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Promote Super Admin Modal ── */}
      <Modal open={promoteModal} onClose={() => setPromoteModal(false)} title="Promote to Super Admin">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Enter the email of an existing user to promote to Super Admin.
            This will detach them from their school and grant cross-school access.
          </p>
          <Input
            label="User Email"
            type="email"
            placeholder="user@example.com"
            value={promoteEmail}
            onChange={(e) => setPromoteEmail(e.target.value)}
          />
          <Divider />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPromoteModal(false)}>Cancel</Button>
            <Button onClick={handlePromote} disabled={!promoteEmail}>
              Promote
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Promote School Admin Modal ── */}
      <Modal open={!!promoteSchoolAdminModal} onClose={() => { setPromoteSchoolAdminModal(null); setPromoteSchoolAdminEmail(""); }} title="Promote to School Admin">
        {promoteSchoolAdminModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Promote a user to School Admin for <strong>{promoteSchoolAdminModal.name}</strong> ({promoteSchoolAdminModal.domain}).
              Enter the email of a user registered at this school.
            </p>
            <Input
              label="User Email"
              type="email"
              placeholder={`user@${promoteSchoolAdminModal.domain}`}
              value={promoteSchoolAdminEmail}
              onChange={(e) => setPromoteSchoolAdminEmail(e.target.value)}
            />
            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setPromoteSchoolAdminModal(null); setPromoteSchoolAdminEmail(""); }}>Cancel</Button>
              <Button onClick={handlePromoteSchoolAdmin} disabled={!promoteSchoolAdminEmail}>
                Promote to School Admin
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Change Password Modal ── */}
      <Modal open={pwModal} onClose={() => setPwModal(false)} title="Change Password">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Enter your current password to verify, then set a new one.
          </p>
          <Input
            label="Current Password"
            type="password"
            placeholder="Your current password"
            value={pwForm.current}
            onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
          />
          <Input
            label="New Password"
            type="password"
            placeholder="Min 8 chars, one uppercase, one number"
            value={pwForm.next}
            onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))}
          />
          <Input
            label="Confirm New Password"
            type="password"
            placeholder="Repeat new password"
            value={pwForm.confirm}
            onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
          />
          {pwError && (
            <p className="text-sm text-red-600">{pwError}</p>
          )}
          <Divider />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPwModal(false)}>Cancel</Button>
            <Button
              onClick={handleChangePassword}
              loading={pwLoading}
              disabled={!pwForm.current || !pwForm.next || !pwForm.confirm}
            >
              <KeyRound className="w-3.5 h-3.5" /> Update Password
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
