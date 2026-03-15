// src/pages/TutorDashboard.tsx
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeTutorSlots, subscribeUserSessions,
  addAvailabilitySlot, removeAvailabilitySlot,
  getUserDoc,
} from "@/lib/firestore";
import {
  Button, Input, Select, Textarea, Modal, Toast, Badge, StarRating, Divider,
} from "@/components/shared/ui";
import { doc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AvailabilitySlot, SessionDoc, GradeLevel } from "@/lib/types";
import { DAYS_OF_WEEK } from "@/lib/types";

const GRADES: { value: GradeLevel; label: string }[] = [
  { value: "6th",  label: "6th Grade"  },
  { value: "7th",  label: "7th Grade"  },
  { value: "8th",  label: "8th Grade"  },
  { value: "9th",  label: "9th Grade"  },
  { value: "10th", label: "10th Grade" },
  { value: "11th", label: "11th Grade" },
  { value: "12th", label: "12th Grade" },
];
import { PlusCircle, Trash2, Video, Clock, BookOpen, Star, Users, Calendar } from "lucide-react";
import { format } from "date-fns";

// ── Subjects list (school admin manages this; using defaults here) ──
const DEFAULT_SUBJECTS = [
  "Algebra","Geometry","Pre-Calculus","Calculus","Statistics",
  "Biology","Chemistry","Physics","Earth Science",
  "English","History","Spanish","French","Computer Science","Economics",
];

const slotSchema = z.object({
  day:       z.string().min(1, "Select a day"),
  startTime: z.string().min(1, "Select start time"),
  duration:  z.enum(["30","45","60"]),
});

const profileSchema = z.object({
  name:     z.string().min(2, "Name must be at least 2 characters"),
  grade:    z.string().optional(),
  subjects: z.array(z.string()).min(1, "Select at least one subject"),
  bio:      z.string().max(280, "Max 280 characters"),
});

type SlotForm    = z.infer<typeof slotSchema>;
type ProfileForm = z.infer<typeof profileSchema>;

// ── Helper: compute end time ─────────────────────────────────────
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const TIME_OPTIONS = Array.from({ length: 24 }, (_, h) =>
  ["00", "30"].map((m) => {
    const label = `${String(h).padStart(2, "0")}:${m}`;
    return { value: label, label };
  })
).flat();

// ── Component ────────────────────────────────────────────────────
export default function TutorDashboard() {
  const { currentUser } = useAuth();
  const [slots, setSlots]       = useState<AvailabilitySlot[]>([]);
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [toast, setToast]       = useState<{ msg: string; type: "success"|"error" } | null>(null);
  const [slotModal, setSlotModal]       = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [cancelModal, setCancelModal]   = useState<SessionDoc | null>(null);
  const [rateModal, setRateModal]       = useState<SessionDoc | null>(null);
  const [stars, setStars]               = useState(0);
  const [reviewText, setReviewText]     = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const slotForm = useForm<SlotForm>({ resolver: zodResolver(slotSchema), defaultValues: { duration: "60" } });
  const profileForm = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    if (!currentUser) return;
    const unsub1 = subscribeTutorSlots(currentUser.uid, setSlots);
    const unsub2 = subscribeUserSessions(currentUser.uid, "tutor", setSessions);
    return () => { unsub1(); unsub2(); };
  }, [currentUser]);

  const handleAddSlot = slotForm.handleSubmit(async (data) => {
    if (!currentUser) return;
    const dur = Number(data.duration) as 30 | 45 | 60;
    await addAvailabilitySlot(currentUser.uid, {
      day: data.day as (typeof DAYS_OF_WEEK)[number],
      startTime: data.startTime,
      endTime: addMinutes(data.startTime, dur),
      duration: dur,
      schoolDomain: currentUser.schoolDomain,
      bookedBy: undefined,
    });
    slotForm.reset();
    setSlotModal(false);
    setToast({ msg: "Slot added", type: "success" });
  });

  const handleRemoveSlot = async (slotId: string) => {
    if (!currentUser) return;
    await removeAvailabilitySlot(currentUser.uid, slotId);
    setToast({ msg: "Slot removed", type: "success" });
  };

  const handleCancelSession = async () => {
    if (!cancelModal || !currentUser) return;
    try {
      await updateDoc(doc(db, "sessions", cancelModal.id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelledBy: currentUser.uid,
      });
      // Free the slot
      if (cancelModal.slotId) {
        await updateDoc(doc(db, "users", cancelModal.tutorId, "availability", cancelModal.slotId), {
          booked: false,
          bookedBy: null,
        });
      }
      setToast({ msg: "Session cancelled", type: "success" });
    } catch {
      setToast({ msg: "Failed to cancel session", type: "error" });
    }
    setCancelModal(null);
  };

  const handleSaveProfile = profileForm.handleSubmit(async (data) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        name: data.name,
        grade: data.grade || null,
        subjects: data.subjects,
        bio: data.bio,
        updatedAt: serverTimestamp(),
      });
      setToast({ msg: "Profile updated", type: "success" });
      setProfileModal(false);
    } catch {
      setToast({ msg: "Update failed", type: "error" });
    }
  });

  const handleRateSession = async () => {
    if (!rateModal || stars === 0 || !currentUser) return;
    try {
      await addDoc(collection(db, "reviews"), {
        sessionId: rateModal.id,
        authorId: currentUser.uid,
        authorName: currentUser.name,
        targetId: rateModal.tuteeId,
        targetName: rateModal.tuteeName,
        stars: stars as 1 | 2 | 3 | 4 | 5,
        text: reviewText || null,
        flagged: false,
        schoolDomain: currentUser.schoolDomain,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "sessions", rateModal.id), {
        tutorRated: true,
      });
      setRateModal(null);
      setStars(0);
      setReviewText("");
      setToast({ msg: "Rating submitted", type: "success" });
    } catch {
      setToast({ msg: "Failed to submit rating", type: "error" });
    }
  };

  const toggleSubject = useCallback((s: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }, []);

  const upcoming  = sessions.filter((s) => s.status === "upcoming");
  const completed = sessions.filter((s) => s.status === "completed");
  const unrated   = completed.filter((s) => !s.tutorRated);
  const openSlots = slots.filter((s) => !s.booked);
  const avgRating = completed.length
    ? (completed.reduce((a, _) => a, 0) / completed.length).toFixed(1)
    : "—";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-gray-900">
            Hey, {currentUser?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">{currentUser?.schoolDomain} · Tutor Dashboard</p>
        </div>
        <Button onClick={() => {
          profileForm.reset({
            name: currentUser?.name ?? "",
            grade: currentUser?.grade ?? "",
            subjects: [],
            bio: "",
          });
          setProfileModal(true);
        }} variant="secondary">
          <BookOpen className="w-4 h-4" /> Edit Profile
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Calendar, label: "Upcoming",    val: upcoming.length,      color: "text-brand-600" },
          { icon: Users,    label: "Completed",   val: completed.length,     color: "text-green-600" },
          { icon: Clock,    label: "Open Slots",  val: openSlots.length,     color: "text-amber-600" },
          { icon: Star,     label: "Avg Rating",  val: avgRating,            color: "text-yellow-500" },
        ].map(({ icon: Icon, label, val, color }) => (
          <div key={label} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-display text-gray-900">{val}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Availability ── */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-gray-900">My Availability</h2>
            <Button size="sm" onClick={() => setSlotModal(true)}>
              <PlusCircle className="w-3.5 h-3.5" /> Add Slot
            </Button>
          </div>

          {slots.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No availability set yet. Add your first slot.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const daySlots = slots.filter((s) => s.day === day);
                if (!daySlots.length) return null;
                return (
                  <div key={day}>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{day}</div>
                    <div className="flex flex-col gap-1.5">
                      {daySlots.map((slot) => (
                        <div
                          key={slot.id}
                          className={`flex items-center justify-between px-3 py-2 rounded text-sm border ${
                            slot.booked
                              ? "bg-brand-50 border-brand-100 text-brand-700"
                              : "bg-gray-50 border-gray-100 text-gray-700"
                          }`}
                        >
                          <span>{slot.startTime} – {slot.endTime} ({slot.duration} min)</span>
                          <div className="flex items-center gap-2">
                            {slot.booked
                              ? <Badge color="blue">Booked</Badge>
                              : (
                                <button
                                  onClick={() => handleRemoveSlot(slot.id)}
                                  className="text-gray-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Upcoming Sessions ── */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-display text-xl text-gray-900 mb-4">Upcoming Sessions</h2>

          {upcoming.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Video className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No upcoming sessions yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {upcoming.map((session) => (
                <div key={session.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{session.tuteeName}</p>
                      <p className="text-xs text-gray-500">{session.subject}</p>
                    </div>
                    <Badge color="green">Upcoming</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(session.scheduledDate.toDate(), "EEE, MMM d")}
                    </span>
                    <span>{session.startTime} – {session.endTime}</span>
                    <span>{session.duration} min</span>
                  </div>
                  <div className="flex gap-2">
                    {session.meetLink && (
                      <a href={session.meetLink} target="_blank" rel="noopener noreferrer">
                        <Button size="sm">
                          <Video className="w-3 h-3" /> Join Meet
                        </Button>
                      </a>
                    )}
                    {session.meetLinkStatus === "pending" && (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Meet link generating…
                      </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setCancelModal(session)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Completed Sessions ── */}
      {completed.length > 0 && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-display text-xl text-gray-900 mb-4">Completed Sessions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {completed.map((session) => (
              <div key={session.id} className="border border-gray-100 rounded p-3 text-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{session.tuteeName}</p>
                    <p className="text-xs text-gray-500 mb-1">{session.subject} · {session.duration} min</p>
                    <p className="text-xs text-gray-400">
                      {format(session.scheduledDate.toDate(), "MMM d, yyyy")}
                    </p>
                  </div>
                  {!session.tutorRated && (
                    <Button size="sm" variant="secondary" onClick={() => { setRateModal(session); setStars(0); setReviewText(""); }}>
                      <Star className="w-3 h-3" /> Rate
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add Slot Modal ── */}
      <Modal open={slotModal} onClose={() => setSlotModal(false)} title="Add Availability Slot">
        <form onSubmit={handleAddSlot} className="flex flex-col gap-4">
          <Select
            label="Day of Week"
            placeholder="Select day"
            options={DAYS_OF_WEEK.map((d) => ({ value: d, label: d }))}
            error={slotForm.formState.errors.day?.message}
            {...slotForm.register("day")}
          />
          <Select
            label="Start Time"
            placeholder="Select time"
            options={TIME_OPTIONS}
            error={slotForm.formState.errors.startTime?.message}
            {...slotForm.register("startTime")}
          />
          <Select
            label="Duration"
            options={[
              { value: "30", label: "30 minutes" },
              { value: "45", label: "45 minutes" },
              { value: "60", label: "60 minutes" },
            ]}
            error={slotForm.formState.errors.duration?.message}
            {...slotForm.register("duration")}
          />
          <Divider />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSlotModal(false)}>Cancel</Button>
            <Button type="submit" loading={slotForm.formState.isSubmitting}>Add Slot</Button>
          </div>
        </form>
      </Modal>

      {/* ── Profile Modal ── */}
      <Modal open={profileModal} onClose={() => setProfileModal(false)} title="Edit Profile">
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <Input
            label="Name"
            error={profileForm.formState.errors.name?.message}
            {...profileForm.register("name")}
          />
          <Select
            label="Grade"
            options={GRADES}
            {...profileForm.register("grade")}
          />
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Subjects</p>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_SUBJECTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSubject(s)}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    selectedSubjects.includes(s)
                      ? "bg-brand-500 border-brand-500 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-brand-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label="Bio"
            placeholder="Tell tutees about your experience and teaching style…"
            maxChars={280}
            currentLength={profileForm.watch("bio")?.length ?? 0}
            {...profileForm.register("bio")}
          />
          <Divider />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setProfileModal(false)}>Cancel</Button>
            <Button type="submit" loading={profileForm.formState.isSubmitting}>Save Profile</Button>
          </div>
        </form>
      </Modal>

      {/* ── Cancel Confirm Modal ── */}
      <Modal open={!!cancelModal} onClose={() => setCancelModal(null)} title="Cancel Session">
        <p className="text-sm text-gray-600 mb-6">
          Are you sure you want to cancel your session with{" "}
          <strong>{cancelModal?.tuteeName}</strong> on{" "}
          {cancelModal && format(cancelModal.scheduledDate.toDate(), "EEEE, MMMM d")}?
          The tutee will be notified by email.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelModal(null)}>Keep Session</Button>
          <Button variant="danger" onClick={handleCancelSession}>Yes, Cancel</Button>
        </div>
      </Modal>

      {/* ── Rate Session Modal ── */}
      <Modal open={!!rateModal} onClose={() => setRateModal(null)} title="Rate Your Tutee">
        {rateModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              How was your session with <strong>{rateModal.tuteeName}</strong>?
            </p>
            <div className="flex flex-col items-center gap-2 py-4">
              <StarRating value={stars} onChange={setStars} size="lg" />
              {stars > 0 && (
                <p className="text-xs text-gray-500">
                  {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][stars]}
                </p>
              )}
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Write a review (optional)…"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRateModal(null)}>Skip</Button>
              <Button onClick={handleRateSession} disabled={stars === 0}>Submit Rating</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
