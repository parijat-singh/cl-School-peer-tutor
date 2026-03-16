// src/pages/TutorDashboard.tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { SchoolBanner } from "@/components/shared/SchoolBanner";
import { CalendarGrid, type CalendarDot } from "@/components/shared/CalendarGrid";
import {
  subscribeTutorSlots, subscribeUserSessions,
  addAvailabilitySlot, removeAvailabilitySlot,
  updateAvailabilitySlot, cancelRecurringDate, uncancelRecurringDate,
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
import {
  PlusCircle, Trash2, Video, Clock, BookOpen, Star, Users, Calendar,
  Repeat, CalendarDays, X as XIcon, Edit2, LayoutList,
} from "lucide-react";
import { format, addDays } from "date-fns";

// ── Subjects list ──
const DEFAULT_SUBJECTS = [
  "Algebra","Geometry","Pre-Calculus","Calculus","Statistics",
  "Biology","Chemistry","Physics","Earth Science",
  "English","History","Spanish","French","Computer Science","Economics",
];

const slotSchema = z.object({
  slotType:  z.enum(["recurring", "specific"]),
  day:       z.string().optional(),
  date:      z.string().optional(),
  startTime: z.string().min(1, "Select start time"),
  duration:  z.enum(["30","45","60"]),
}).refine(
  (d) => d.slotType === "recurring" ? !!d.day : !!d.date,
  { message: "Select a day or date", path: ["day"] }
);

const profileSchema = z.object({
  name:  z.string().min(2, "Name must be at least 2 characters"),
  grade: z.string().optional(),
  bio:   z.string().max(280, "Max 280 characters"),
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

/** Get next N occurrences of a day-of-week starting from tomorrow */
function getUpcomingDatesForDay(day: string, weeks = 4): string[] {
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const dayIdx = dayNames.indexOf(day);
  if (dayIdx < 0) return [];
  const dates: string[] = [];
  const now = new Date();
  const diff = (dayIdx - now.getDay() + 7) % 7 || 7;
  for (let w = 0; w < weeks; w++) {
    const d = new Date(now);
    d.setDate(now.getDate() + diff + w * 7);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

/** Day-of-week from a YYYY-MM-DD string */
function dayFromDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
}

const TIME_OPTIONS = Array.from({ length: 24 }, (_, h) =>
  ["00", "30"].map((m) => {
    const label = `${String(h).padStart(2, "0")}:${m}`;
    return { value: label, label };
  })
).flat();

// Get min date for date input (tomorrow)
function getMinDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

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
  // Subjects the tutor typed in that aren't in DEFAULT_SUBJECTS
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [customInput, setCustomInput]       = useState("");

  // Calendar view state
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calYear,  setCalYear]  = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calSelected, setCalSelected] = useState<string | null>(null);

  // Manage dates modal for recurring slots
  const [manageDatesModal, setManageDatesModal] = useState<AvailabilitySlot | null>(null);

  // Edit slot modal
  const [editSlotModal, setEditSlotModal] = useState<AvailabilitySlot | null>(null);
  const [editStartTime, setEditStartTime] = useState("");
  const [editDuration, setEditDuration]   = useState("60");

  const slotForm = useForm<SlotForm>({
    resolver: zodResolver(slotSchema),
    defaultValues: { duration: "60", slotType: "recurring", startTime: "09:00" },
  });
  const profileForm = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  const slotType = slotForm.watch("slotType");

  useEffect(() => {
    if (!currentUser) return;
    const unsub1 = subscribeTutorSlots(currentUser.uid, setSlots);
    const unsub2 = subscribeUserSessions(currentUser.uid, "tutor", setSessions);
    return () => { unsub1(); unsub2(); };
  }, [currentUser]);

  const handleAddSlot = slotForm.handleSubmit(async (data) => {
    if (!currentUser) return;
    try {
      const dur = Number(data.duration) as 30 | 45 | 60;
      const isRecurring = data.slotType === "recurring";
      const day = isRecurring
        ? (data.day as (typeof DAYS_OF_WEEK)[number])
        : (dayFromDate(data.date!) as (typeof DAYS_OF_WEEK)[number]);

      await addAvailabilitySlot(currentUser.uid, {
        recurring: isRecurring,
        day,
        // Only include date for specific-date slots; omitting it avoids undefined field errors in Firestore
        ...(isRecurring ? {} : { date: data.date! }),
        startTime: data.startTime,
        endTime: addMinutes(data.startTime, dur),
        duration: dur,
        schoolDomain: currentUser.schoolDomain,
      });
      slotForm.reset({ duration: "60", slotType: "recurring", startTime: "09:00" });
      setSlotModal(false);
      setToast({ msg: isRecurring ? "Recurring slot added" : "Slot added for " + data.date, type: "success" });
    } catch {
      setToast({ msg: "Failed to add slot", type: "error" });
    }
  });

  const handleRemoveSlot = async (slotId: string) => {
    if (!currentUser) return;
    await removeAvailabilitySlot(currentUser.uid, slotId);
    setToast({ msg: "Slot removed", type: "success" });
  };

  const handleCancelDate = async (slot: AvailabilitySlot, date: string) => {
    if (!currentUser) return;
    await cancelRecurringDate(currentUser.uid, slot.id, date);
    setToast({ msg: `Cancelled ${date}`, type: "success" });
  };

  const handleUncancelDate = async (slot: AvailabilitySlot, date: string) => {
    if (!currentUser) return;
    await uncancelRecurringDate(currentUser.uid, slot.id, date);
    setToast({ msg: `Restored ${date}`, type: "success" });
  };

  const handleEditSlot = async () => {
    if (!editSlotModal || !currentUser || !editStartTime) return;
    try {
      const dur = Number(editDuration) as 30 | 45 | 60;
      await updateAvailabilitySlot(currentUser.uid, editSlotModal.id, {
        startTime: editStartTime,
        endTime: addMinutes(editStartTime, dur),
        duration: dur,
      });
      setEditSlotModal(null);
      setToast({ msg: "Slot updated", type: "success" });
    } catch {
      setToast({ msg: "Failed to update slot", type: "error" });
    }
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
        subjects: selectedSubjects,
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

  const addCustomSubject = useCallback(() => {
    const s = customInput.trim();
    if (!s) return;
    // Skip if already present (case-insensitive) in either list
    const allKnown = [...DEFAULT_SUBJECTS, ...customSubjects];
    if (allKnown.some((x) => x.toLowerCase() === s.toLowerCase())) {
      setCustomInput("");
      return;
    }
    setCustomSubjects((prev) => [...prev, s]);
    setSelectedSubjects((prev) => [...prev, s]);
    setCustomInput("");
  }, [customInput, customSubjects]);

  const removeCustomSubject = useCallback((s: string) => {
    setCustomSubjects((prev) => prev.filter((x) => x !== s));
    setSelectedSubjects((prev) => prev.filter((x) => x !== s));
  }, []);

  const upcoming  = sessions.filter((s) => s.status === "upcoming");
  const completed = sessions.filter((s) => s.status === "completed");
  const unrated   = completed.filter((s) => !s.tutorRated);

  // Separate slots into recurring and one-off
  const recurringSlots = slots.filter((s) => s.recurring);
  const oneOffSlots    = slots.filter((s) => !s.recurring);
  const today = new Date().toISOString().split("T")[0];
  const futureOneOff = oneOffSlots.filter((s) => !s.date || s.date >= today);
  const openSlots = slots.filter((s) => {
    if (s.recurring) return true; // recurring always "open" conceptually
    return !s.booked;
  });

  const avgRating = completed.length
    ? (completed.reduce((a, _) => a, 0) / completed.length).toFixed(1)
    : "—";

  /** Build event dots for the calendar from live slot + session data */
  const calendarDots = useMemo<Record<string, CalendarDot[]>>(() => {
    const result: Record<string, CalendarDot[]> = {};
    const push = (date: string, dot: CalendarDot) => {
      result[date] = [...(result[date] ?? []), dot];
    };

    // Recurring slots — expand next 8 weeks
    recurringSlots.forEach((slot) => {
      getUpcomingDatesForDay(slot.day, 8).forEach((d) => {
        const cancelled = (slot.cancelledDates ?? []).includes(d);
        if (cancelled) return;
        const booked = !!(slot.bookedDates ?? {})[d];
        push(d, { color: booked ? "blue" : "green", label: booked ? "Booked" : `${slot.startTime}–${slot.endTime}` });
      });
    });

    // One-off slots
    oneOffSlots.forEach((slot) => {
      if (!slot.date) return;
      push(slot.date, { color: slot.booked ? "blue" : "green", label: slot.booked ? "Booked" : `${slot.startTime}–${slot.endTime}` });
    });

    // Upcoming sessions (amber so they stand out from open slots)
    upcoming.forEach((session) => {
      const d = session.scheduledDate.toDate().toISOString().split("T")[0];
      push(d, { color: "amber", label: session.tuteeName });
    });

    return result;
  }, [recurringSlots, oneOffSlots, upcoming]);

  /** Navigate calendar months, clamping year correctly */
  const changeCalMonth = useCallback((dir: 1 | -1) => {
    setCalMonth((m) => {
      const next = m + dir;
      if (next < 0)  { setCalYear((y) => y - 1); return 11; }
      if (next > 11) { setCalYear((y) => y + 1); return 0; }
      return next;
    });
  }, []);

  /** Events on a given calendar day (for the detail panel) */
  const getEventsForDay = useCallback((date: string) => {
    const dow = dayFromDate(date);
    const slotEvents: Array<{ slot: AvailabilitySlot; isBooked: boolean; isCancelled: boolean }> = [];

    recurringSlots.forEach((slot) => {
      if (slot.day !== dow) return;
      const isCancelled = (slot.cancelledDates ?? []).includes(date);
      const isBooked    = !!(slot.bookedDates ?? {})[date];
      slotEvents.push({ slot, isBooked, isCancelled });
    });
    oneOffSlots.filter((s) => s.date === date).forEach((slot) => {
      slotEvents.push({ slot, isBooked: !!slot.booked, isCancelled: false });
    });

    const sessionEvents = sessions.filter(
      (s) => s.scheduledDate.toDate().toISOString().split("T")[0] === date
    );

    return { slotEvents, sessionEvents };
  }, [recurringSlots, oneOffSlots, sessions]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* School Banner */}
      <SchoolBanner variant="full" className="mb-4" />

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-gray-900">
            Hey, {currentUser?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">Tutor Dashboard</p>
        </div>
        <Button onClick={async () => {
          // Load latest subjects + bio from Firestore so the form pre-fills correctly
          const userDoc = await getUserDoc(currentUser!.uid);
          const saved: string[] = userDoc?.subjects ?? [];
          // Separate saved subjects into default-list ones and custom (user-added) ones
          const defaultSet = new Set(DEFAULT_SUBJECTS);
          setCustomSubjects(saved.filter((s) => !defaultSet.has(s)));
          setCustomInput("");
          setSelectedSubjects(saved);
          profileForm.reset({
            name: currentUser?.name ?? "",
            grade: currentUser?.grade ?? "",
            bio: userDoc?.bio ?? "",
          });
          setProfileModal(true);
        }} variant="secondary">
          <BookOpen className="w-4 h-4" /> Edit Profile
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Calendar, label: "Upcoming",    val: upcoming.length,  color: "text-brand-600" },
          { icon: Users,    label: "Completed",   val: completed.length, color: "text-green-600" },
          { icon: Clock,    label: "Open Slots",  val: openSlots.length, color: "text-amber-600" },
          { icon: Star,     label: "Avg Rating",  val: avgRating,        color: "text-yellow-500" },
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

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {([
          { key: "list"    , icon: LayoutList,  label: "List"     },
          { key: "calendar", icon: CalendarDays, label: "Calendar" },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              view === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Calendar view ── */}
      {view === "calendar" && (
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 mb-6">
          {/* Calendar panel */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-gray-900">My Schedule</h2>
              <Button size="sm" onClick={() => {
                slotForm.reset({ duration: "60", slotType: "recurring", startTime: "09:00" });
                setSlotModal(true);
              }}>
                <PlusCircle className="w-3.5 h-3.5" /> Add Slot
              </Button>
            </div>

            <CalendarGrid
              year={calYear}
              month={calMonth}
              dots={calendarDots}
              selectedDate={calSelected ?? undefined}
              onDayClick={(d) => setCalSelected(calSelected === d ? null : d)}
              onMonthChange={changeCalMonth}
              minDate={today}
            />

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 text-xs text-gray-500">
              {[
                { color: "bg-green-500", label: "Open slot" },
                { color: "bg-blue-500",  label: "Booked slot" },
                { color: "bg-amber-400", label: "Session" },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${color}`} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Day detail panel */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            {!calSelected ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16">
                <CalendarDays className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500 mb-1">Select a day</p>
                <p className="text-xs">Click any date on the calendar to see or add slots.</p>
              </div>
            ) : (() => {
              const { slotEvents, sessionEvents } = getEventsForDay(calSelected);
              const hasEvents = slotEvents.length > 0 || sessionEvents.length > 0;
              const isPastDay = calSelected < today;

              return (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-base text-gray-900">
                      {format(new Date(calSelected + "T12:00:00"), "EEEE, MMMM d")}
                    </h3>
                    {!isPastDay && (
                      <Button size="sm" onClick={() => {
                        slotForm.reset({ duration: "60", slotType: "specific", startTime: "09:00" });
                        slotForm.setValue("date", calSelected);
                        setSlotModal(true);
                      }}>
                        <PlusCircle className="w-3.5 h-3.5" /> Add Slot
                      </Button>
                    )}
                  </div>

                  {!hasEvents && (
                    <div className="text-center py-10 text-gray-400">
                      <Clock className="w-7 h-7 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No slots or sessions on this day.</p>
                      {!isPastDay && (
                        <p className="text-xs mt-1">Click "Add Slot" to add one.</p>
                      )}
                    </div>
                  )}

                  {slotEvents.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Availability Slots</p>
                      <div className="flex flex-col gap-2">
                        {slotEvents.map(({ slot, isBooked, isCancelled }) => (
                          <div key={slot.id} className={`flex items-center justify-between px-3 py-2.5 rounded border text-sm ${
                            isCancelled ? "bg-red-50 border-red-100 text-red-600 opacity-60"
                            : isBooked  ? "bg-blue-50 border-blue-100 text-blue-700"
                            : "bg-green-50 border-green-100 text-green-700"
                          }`}>
                            <div className="flex items-center gap-2">
                              {slot.recurring
                                ? <Repeat className="w-3.5 h-3.5 opacity-60" />
                                : <CalendarDays className="w-3.5 h-3.5 opacity-60" />}
                              <span className="font-medium">{slot.startTime} – {slot.endTime}</span>
                              <span className="text-xs opacity-60">({slot.duration} min)</span>
                              {isCancelled && <Badge color="red">Cancelled</Badge>}
                              {isBooked    && <Badge color="blue">Booked</Badge>}
                            </div>
                            {!isBooked && !isCancelled && (
                              <button
                                onClick={() => handleRemoveSlot(slot.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                                title="Remove slot"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sessionEvents.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sessions</p>
                      <div className="flex flex-col gap-2">
                        {sessionEvents.map((session) => (
                          <div key={session.id} className="flex items-center justify-between px-3 py-2.5 rounded border bg-amber-50 border-amber-100 text-sm text-amber-800">
                            <div className="flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 opacity-60" />
                              <span className="font-medium">{session.tuteeName}</span>
                              <Badge color="blue">{session.subject}</Badge>
                              <span className="text-xs opacity-60">{session.startTime} – {session.endTime}</span>
                            </div>
                            {session.meetLink && (
                              <a href={session.meetLink} target="_blank" rel="noopener noreferrer">
                                <Button size="sm"><Video className="w-3 h-3" /> Join</Button>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── List view ── */}
      {view === "list" && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Availability ── */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-gray-900">My Availability</h2>
            <Button size="sm" onClick={() => { slotForm.reset({ duration: "60", slotType: "recurring", startTime: "09:00" }); setSlotModal(true); }}>
              <PlusCircle className="w-3.5 h-3.5" /> Add Slot
            </Button>
          </div>

          {slots.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No availability set yet. Add your first slot.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Recurring Slots */}
              {recurringSlots.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Repeat className="w-3.5 h-3.5 text-brand-500" />
                    <span className="text-xs font-semibold text-brand-600 uppercase tracking-wide">Weekly Recurring</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {DAYS_OF_WEEK.map((day) => {
                      const daySlots = recurringSlots.filter((s) => s.day === day);
                      if (!daySlots.length) return null;
                      return daySlots.map((slot) => {
                        const booked = Object.keys(slot.bookedDates ?? {}).length;
                        const cancelled = (slot.cancelledDates ?? []).length;
                        return (
                          <div
                            key={slot.id}
                            className="flex items-center justify-between px-3 py-2 rounded text-sm border bg-brand-50 border-brand-100"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-brand-700">{slot.day}</span>
                              <span className="text-brand-600">{slot.startTime} – {slot.endTime}</span>
                              <span className="text-brand-400 text-xs">({slot.duration} min)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {booked > 0 && <Badge color="blue">{booked} booked</Badge>}
                              {cancelled > 0 && <Badge color="amber">{cancelled} off</Badge>}
                              <button
                                onClick={() => setManageDatesModal(slot)}
                                className="text-brand-400 hover:text-brand-600 transition-colors"
                                title="Manage dates"
                              >
                                <CalendarDays className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setEditSlotModal(slot); setEditStartTime(slot.startTime); setEditDuration(String(slot.duration)); }}
                                className="text-brand-400 hover:text-brand-600 transition-colors"
                                title="Edit time"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveSlot(slot.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                                title="Delete slot"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })}
                  </div>
                </div>
              )}

              {/* One-off Slots */}
              {futureOneOff.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">Specific Dates</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {futureOneOff.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).map((slot) => (
                      <div
                        key={slot.id}
                        className={`flex items-center justify-between px-3 py-2 rounded text-sm border ${
                          slot.booked
                            ? "bg-blue-50 border-blue-100 text-blue-700"
                            : "bg-green-50 border-green-100 text-green-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {slot.date ? format(new Date(slot.date + "T12:00:00"), "EEE, MMM d") : slot.day}
                          </span>
                          <span>{slot.startTime} – {slot.endTime}</span>
                          <span className="text-xs opacity-60">({slot.duration} min)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {slot.booked ? (
                            <Badge color="blue">Booked</Badge>
                          ) : (
                            <>
                              <button
                                onClick={() => { setEditSlotModal(slot); setEditStartTime(slot.startTime); setEditDuration(String(slot.duration)); }}
                                className="text-green-400 hover:text-green-600 transition-colors"
                                title="Edit time"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveSlot(slot.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
      </div>}

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
          {/* Slot type toggle */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Slot Type</p>
            <div className="flex gap-2">
              {(["recurring", "specific"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => slotForm.setValue("slotType", t)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded border text-sm font-medium transition-colors ${
                    slotType === t
                      ? "bg-brand-50 border-brand-300 text-brand-700"
                      : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {t === "recurring" ? <Repeat className="w-4 h-4" /> : <CalendarDays className="w-4 h-4" />}
                  {t === "recurring" ? "Weekly Recurring" : "Specific Date"}
                </button>
              ))}
            </div>
          </div>

          {/* Day or Date picker */}
          {slotType === "recurring" ? (
            <Select
              label="Day of Week"
              placeholder="Select day"
              options={DAYS_OF_WEEK.map((d) => ({ value: d, label: d }))}
              error={slotForm.formState.errors.day?.message}
              {...slotForm.register("day")}
            />
          ) : (
            <Input
              label="Date"
              type="date"
              min={getMinDate()}
              error={slotForm.formState.errors.day?.message}
              {...slotForm.register("date")}
            />
          )}

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

          {slotType === "recurring" && (
            <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-700">
              <Repeat className="w-3 h-3 inline mr-1" />
              This slot will repeat every week. You can cancel specific dates later.
            </div>
          )}

          <Divider />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSlotModal(false)}>Cancel</Button>
            <Button type="submit" loading={slotForm.formState.isSubmitting}>Add Slot</Button>
          </div>
        </form>
      </Modal>

      {/* ── Manage Recurring Dates Modal ── */}
      <Modal
        open={!!manageDatesModal}
        onClose={() => setManageDatesModal(null)}
        title={`Manage Dates — ${manageDatesModal?.day} ${manageDatesModal?.startTime}–${manageDatesModal?.endTime}`}
      >
        {manageDatesModal && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-500">
              Next 4 weeks of this recurring slot. Toggle dates on/off.
            </p>
            <div className="flex flex-col gap-2">
              {getUpcomingDatesForDay(manageDatesModal.day).map((dateStr) => {
                const cancelled = (manageDatesModal.cancelledDates ?? []).includes(dateStr);
                const bookedBy = (manageDatesModal.bookedDates ?? {})[dateStr];
                return (
                  <div
                    key={dateStr}
                    className={`flex items-center justify-between px-3 py-2.5 rounded border text-sm ${
                      cancelled
                        ? "bg-red-50 border-red-100 text-red-600"
                        : bookedBy
                        ? "bg-blue-50 border-blue-100 text-blue-700"
                        : "bg-green-50 border-green-100 text-green-700"
                    }`}
                  >
                    <span className="font-medium">
                      {format(new Date(dateStr + "T12:00:00"), "EEE, MMM d, yyyy")}
                    </span>
                    <div className="flex items-center gap-2">
                      {bookedBy && <Badge color="blue">Booked</Badge>}
                      {cancelled ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleUncancelDate(manageDatesModal, dateStr)}
                        >
                          Restore
                        </Button>
                      ) : !bookedBy ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCancelDate(manageDatesModal, dateStr)}
                        >
                          <XIcon className="w-3 h-3" /> Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit Slot Modal ── */}
      <Modal open={!!editSlotModal} onClose={() => setEditSlotModal(null)} title="Edit Slot Time">
        {editSlotModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500">
              {editSlotModal.recurring
                ? `Recurring: Every ${editSlotModal.day}`
                : `Date: ${editSlotModal.date ? format(new Date(editSlotModal.date + "T12:00:00"), "EEE, MMM d") : editSlotModal.day}`}
            </p>
            <Select
              label="Start Time"
              options={TIME_OPTIONS}
              value={editStartTime}
              onChange={(e) => setEditStartTime(e.target.value)}
            />
            <Select
              label="Duration"
              options={[
                { value: "30", label: "30 minutes" },
                { value: "45", label: "45 minutes" },
                { value: "60", label: "60 minutes" },
              ]}
              value={editDuration}
              onChange={(e) => setEditDuration(e.target.value)}
            />
            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditSlotModal(null)}>Cancel</Button>
              <Button onClick={handleEditSlot}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Profile Modal ── */}
      <Modal open={profileModal} onClose={() => { setProfileModal(false); setCustomSubjects([]); setCustomInput(""); }} title="Edit Profile">
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
              {/* Default subjects — toggle on/off */}
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
              {/* Custom subjects — toggle on/off, × to remove entirely */}
              {customSubjects.map((s) => {
                const active = selectedSubjects.includes(s);
                return (
                  <span
                    key={s}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors ${
                      active
                        ? "bg-brand-500 border-brand-500 text-white"
                        : "bg-white border-brand-200 text-brand-700"
                    }`}
                  >
                    <button type="button" onClick={() => toggleSubject(s)} className="focus:outline-none">
                      {s}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCustomSubject(s)}
                      title={`Remove "${s}"`}
                      className={`rounded-full hover:opacity-70 focus:outline-none ${active ? "text-white" : "text-brand-400"}`}
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
            {/* Add custom subject input */}
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSubject(); } }}
                placeholder="Add a custom subject or unit…"
                maxLength={50}
                className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={addCustomSubject}
                disabled={!customInput.trim()}
                className="px-3 py-1.5 text-xs bg-brand-50 border border-brand-200 text-brand-700 rounded hover:bg-brand-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                + Add
              </button>
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
