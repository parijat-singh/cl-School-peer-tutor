// src/pages/TuteeBooking.tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useSchool } from "@/lib/school-context";
import { SchoolBanner } from "@/components/shared/SchoolBanner";
import { CalendarGrid, type CalendarDot } from "@/components/shared/CalendarGrid";
import { searchTutors, getMySessions, getMyBookingRequests } from "@/lib/api-queries";
import { requestBooking, cancelBookingRequest, cancelSession, submitRating, updateUserProfile, recommendTutors } from "@/lib/api-functions";
import {
  Button, Input, Select, Modal, Toast, Badge, StarRating, Divider,
} from "@/components/shared/ui";
import type { TutorCard as TutorCardType, AvailabilitySlot, SessionDoc, GradeLevel } from "@/lib/types";
import { DAYS_OF_WEEK } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

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
  Search, Star, Clock, Video, Calendar, ChevronRight, Filter, User,
  Repeat, CalendarDays, Sparkles, ArrowUpDown,
} from "lucide-react";
import { format } from "date-fns";

const DEFAULT_SUBJECTS = [
  "Algebra","Geometry","Pre-Calculus","Calculus","Statistics",
  "Biology","Chemistry","Physics","Earth Science",
  "English","History","Spanish","French","Computer Science","Economics",
];

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

/** Get available dates for a slot (filtering out booked and cancelled) */
function getAvailableDates(slot: AvailabilitySlot): string[] {
  if (!slot.recurring) {
    // One-off: just return the date if not booked and in the future
    const today = new Date().toISOString().split("T")[0];
    if (slot.booked || !slot.date || slot.date < today) return [];
    return [slot.date];
  }
  // Recurring: next 4 weeks minus cancelled/booked
  const dates = getUpcomingDatesForDay(slot.day);
  const cancelled = new Set(slot.cancelledDates ?? []);
  const booked = slot.bookedDates ?? {};
  return dates.filter((d) => !cancelled.has(d) && !booked[d]);
}

type SortMode = "recommended" | "rating" | "availability";

/**
 * Returns DEFAULT_SUBJECTS entries that closely match the user's raw input.
 * Priority: exact → subject-contains-query → query-contains-subject → word-overlap.
 */
function findClosestSubjects(input: string): string[] {
  const q = input.trim().toLowerCase();
  if (!q) return [];

  const exact = DEFAULT_SUBJECTS.filter((s) => s.toLowerCase() === q);
  if (exact.length) return exact;

  // "sat" → "SAT Prep", "calc" → "Calculus" / "Pre-Calculus"
  const subMatch = DEFAULT_SUBJECTS.filter((s) => s.toLowerCase().includes(q));
  if (subMatch.length) return subMatch;

  // user typed "calculus ab" → matches "Calculus"
  const revMatch = DEFAULT_SUBJECTS.filter((s) => q.includes(s.toLowerCase()));
  if (revMatch.length) return revMatch;

  // word-level overlap: any query word starts-with or is started-by a subject word
  const qWords = q.split(/\s+/).filter(Boolean);
  return DEFAULT_SUBJECTS.filter((s) => {
    const sWords = s.toLowerCase().split(/\s+/);
    return qWords.some((qw) => sWords.some((sw) => sw.startsWith(qw) || qw.startsWith(sw)));
  });
}

/** True if any of a tutor's subjects is a case-insensitive partial match for the query */
function tutorMatchesSubject(subjects: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return subjects.some((s) => {
    const sl = s.toLowerCase();
    return sl === q || sl.includes(q) || q.includes(sl);
  });
}

export default function TuteeBooking() {
  const { currentUser } = useAuth();
  const { school } = useSchool();

  // Search state
  const [subject, setSubject]   = useState("");
  const [day, setDay]           = useState("");
  const [date, setDate]         = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [tutors, setTutors]     = useState<TutorCardType[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // AI recommendation state
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiPowered, setAiPowered]   = useState(false);
  const [fuzzyNote, setFuzzyNote]   = useState<string | null>(null);

  // Sessions
  const [tab, setTab]           = useState<"search" | "sessions" | "calendar">("search");

  // Switch to the tab specified in nav-link location state (e.g. Find Tutors → search)
  const location = useLocation();
  useEffect(() => {
    const locState = location.state as { tab?: string } | null;
    if (locState?.tab === "search" || locState?.tab === "calendar" || locState?.tab === "sessions") {
      setTab(locState.tab);
    }
  }, [location.key]); // location.key changes on every navigation, even same-path

  // Calendar state
  const [calYear,  setCalYear]  = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calSelected, setCalSelected] = useState<string | null>(null);
  const [calTutors,  setCalTutors]    = useState<TutorCardType[]>([]);
  const [calLoading, setCalLoading]   = useState(false);

  // Modals
  const [bookModal, setBookModal]     = useState<{ tutor: TutorCardType; slot: AvailabilitySlot } | null>(null);
  const [rateModal, setRateModal]     = useState<SessionDoc | null>(null);
  const [cancelModal, setCancelModal] = useState<SessionDoc | null>(null);
  const [bookingSubject, setBookingSubject] = useState("");
  const [bookingDate, setBookingDate] = useState("");

  // Rating
  const [stars, setStars]       = useState(0);
  const [reviewText, setReviewText] = useState("");

  // Booking in-flight guard
  const [booking, setBooking] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error" } | null>(null);

  // Poll sessions & booking requests (replaces onSnapshot subscriptions)
  const { data: polledSessions, refetch: refetchSessions } = usePoll(
    () => getMySessions("tutee"),
    [currentUser?.uid],
    { intervalMs: 30_000, enabled: !!currentUser },
  );
  const sessions = polledSessions ?? [];

  const { data: polledRequests, refetch: refetchRequests } = usePoll(
    () => getMyBookingRequests("tutee"),
    [currentUser?.uid],
    { intervalMs: 15_000, enabled: !!currentUser },
  );
  const myRequests = polledRequests ?? [];

  // Set of "${slotId}_${scheduledDate}" for all pending requests — used to block duplicate requests
  const pendingSlotDateSet = useMemo(
    () => new Set(
      myRequests
        .filter((r) => r.status === "pending" || r.status === "accepted")
        .map((r) => `${r.slotId}_${r.scheduledDate}`)
    ),
    [myRequests]
  );

  // Load all tutors when calendar tab is first opened
  useEffect(() => {
    if (tab !== "calendar" || !currentUser?.schoolDomain || calTutors.length > 0) return;
    setCalLoading(true);
    searchTutors({ schoolDomain: currentUser.schoolDomain })
      .then(setCalTutors)
      .finally(() => setCalLoading(false));
  }, [tab, currentUser?.schoolDomain, calTutors.length]);

  const changeCalMonth = useCallback((dir: 1 | -1) => {
    setCalMonth((m) => {
      const next = m + dir;
      if (next < 0)  { setCalYear((y) => y - 1); return 11; }
      if (next > 11) { setCalYear((y) => y + 1); return 0; }
      return next;
    });
  }, []);

  /** Build event dots: green = available tutor slots, blue = my sessions */
  const calendarDots = useMemo<Record<string, CalendarDot[]>>(() => {
    const result: Record<string, CalendarDot[]> = {};
    const push = (date: string, dot: CalendarDot) => {
      result[date] = [...(result[date] ?? []), dot];
    };

    // Available slots from all tutors
    calTutors.forEach((tutor) => {
      tutor.availableSlots.forEach((slot) => {
        getAvailableDates(slot).forEach((d) => {
          // Only add one green dot per tutor per day to avoid clutter
          if (!(result[d] ?? []).some((x) => x.color === "green" && x.label === tutor.name)) {
            push(d, { color: "green", label: tutor.name });
          }
        });
      });
    });

    // My booked sessions
    sessions.filter((s) => s.status === "upcoming").forEach((s) => {
      const d = s.scheduledDate.split("T")[0];
      push(d, { color: "blue", label: s.tutorName });
    });

    return result;
  }, [calTutors, sessions]);

  /** Tutors who have available slots on the selected calendar day */
  const calDayTutors = useMemo(() => {
    if (!calSelected) return [];
    return calTutors
      .map((tutor) => ({
        tutor,
        slots: tutor.availableSlots.filter((slot) =>
          getAvailableDates(slot).includes(calSelected)
        ),
      }))
      .filter(({ slots }) => slots.length > 0);
  }, [calSelected, calTutors]);

  /** My sessions on the selected calendar day */
  const calDaySessions = useMemo(() => {
    if (!calSelected) return [];
    return sessions.filter(
      (s) => s.scheduledDate.split("T")[0] === calSelected
    );
  }, [calSelected, sessions]);

  const handleSearch = async () => {
    if (!currentUser) return;
    setSearching(true);
    setHasSearched(true);
    setAiPowered(false);
    setFuzzyNote(null);

    // ── Stage 1: exact Firestore query ──────────────────────────────
    let results = await searchTutors({
      schoolDomain: currentUser.schoolDomain!,
      subject: subject || undefined,
      day: day || undefined,
      date: date || undefined,
    });

    let effectiveSubject = subject;

    // ── Stage 2: fuzzy-normalize to DEFAULT_SUBJECTS ─────────────────
    // If the user typed a subject but got 0 results, map their input to the
    // closest known subjects (e.g. "Sat" → ["SAT Prep"]) and retry.
    if (subject && results.length === 0) {
      const closest = findClosestSubjects(subject);

      if (closest.length > 0) {
        // Run parallel Firestore queries for all close matches
        const parallelResults = await Promise.all(
          closest.map((s) =>
            searchTutors({
              schoolDomain: currentUser.schoolDomain!,
              subject: s,
              day: day || undefined,
              date: date || undefined,
            })
          )
        );
        // Merge, deduplicate by uid
        const seen = new Set<string>();
        results = parallelResults.flat().filter((t) => {
          if (seen.has(t.uid)) return false;
          seen.add(t.uid);
          return true;
        });
        effectiveSubject = closest[0];
        if (results.length > 0) {
          setFuzzyNote(
            `No exact match for "${subject}" — showing results for: ${closest.join(", ")}`
          );
        }
      }

      // ── Stage 3: full-school client-side fuzzy filter ───────────────
      // Still 0 results? Fetch every tutor for the school and filter locally
      // so custom subjects (e.g. "SAT Math", "ACT Prep") are also caught.
      if (results.length === 0) {
        const allTutors = await searchTutors({
          schoolDomain: currentUser.schoolDomain!,
          day: day || undefined,
          date: date || undefined,
        });
        results = allTutors.filter((t) => tutorMatchesSubject(t.subjects, subject));
        effectiveSubject = subject;
        if (results.length > 0) {
          setFuzzyNote(
            `No exact match for "${subject}" — showing tutors with related subjects`
          );
        }
      }
    }

    // Set raw results first so user sees something immediately
    setTutors(results);
    setSearching(false);

    // ── AI recommendation in background (if more than 1 tutor) ────────
    if (results.length > 1) {
      setAiLoading(true);
      try {
        const rec = await recommendTutors({
          tutors: results.map((t) => ({
            uid: t.uid,
            name: t.name,
            grade: t.grade,
            subjects: t.subjects,
            bio: t.bio,
            avgRating: t.avgRating,
            reviewCount: t.reviewCount,
            slotCount: t.availableSlots.length,
            hasRecurringSlots: t.availableSlots.some((s) => s.recurring),
            hasDateSlots: t.availableSlots.some((s) => !s.recurring),
          })),
          searchSubject: effectiveSubject || undefined,
          searchDate: date || undefined,
          searchDay: day || undefined,
        });

        // Apply AI scores to tutor cards
        const scoreMap = new Map(rec.ranked.map((r) => [r.uid, r]));
        const enriched = results.map((t) => {
          const match = scoreMap.get(t.uid);
          return {
            ...t,
            aiScore: match?.score ?? 50,
            aiReason: match?.reason ?? undefined,
          };
        });

        setTutors(enriched);
        setAiPowered(rec.aiPowered);
      } catch (err) {
        console.warn("AI recommendation failed, using default order:", err);
      } finally {
        setAiLoading(false);
      }
    }
  };

  // Sort tutors based on selected mode, then client-side filter by name
  const sortedTutors = [...tutors]
    .sort((a, b) => {
      switch (sortMode) {
        case "recommended":
          // AI score first, fallback to rating
          return (b.aiScore ?? 0) - (a.aiScore ?? 0) || b.avgRating - a.avgRating;
        case "rating":
          return b.avgRating - a.avgRating || b.reviewCount - a.reviewCount;
        case "availability":
          return b.availableSlots.length - a.availableSlots.length;
        default:
          return 0;
      }
    })
    .filter((t) =>
      !nameFilter.trim() ||
      t.name.toLowerCase().includes(nameFilter.trim().toLowerCase())
    );

  const handleRequest = async () => {
    if (!bookModal || !currentUser || !bookingDate || booking) return;

    const key = `${bookModal.slot.id}_${bookingDate}`;
    if (pendingSlotDateSet.has(key)) {
      setToast({ msg: "You already requested this slot for that date.", type: "error" });
      setBookModal(null);
      setBookingDate("");
      return;
    }

    setBooking(true);
    try {
      await requestBooking({
        tutorId:       bookModal.tutor.uid,
        slotId:        bookModal.slot.id,
        subject:       bookingSubject || bookModal.tutor.subjects[0],
        scheduledDate: bookingDate,
      });
      setBookModal(null);
      setBookingDate("");
      setTab("sessions");
      refetchRequests();
      setToast({ msg: "Request sent! The tutor will confirm shortly.", type: "success" });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Request failed";
      setToast({ msg, type: "error" });
    } finally {
      setBooking(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await cancelBookingRequest({ requestId });
      refetchRequests();
      setToast({ msg: "Request cancelled", type: "success" });
    } catch (err: unknown) {
      setToast({ msg: (err as { message?: string })?.message ?? "Cancel failed", type: "error" });
    }
  };

  const handleCancel = async () => {
    if (!cancelModal || !currentUser) return;
    try {
      await cancelSession({ sessionId: cancelModal.id });
      refetchSessions();
      setToast({ msg: "Session cancelled", type: "success" });
    } catch {
      setToast({ msg: "Cancel failed", type: "error" });
    }
    setCancelModal(null);
  };

  const handleRate = async () => {
    if (!rateModal || stars === 0 || !currentUser) return;
    try {
      await submitRating({
        sessionId: rateModal.id,
        stars: stars as 1 | 2 | 3 | 4 | 5,
        text: reviewText || undefined,
      });
      refetchSessions();
      setRateModal(null);
      setStars(0);
      setReviewText("");
      setToast({ msg: "Rating submitted -- thanks!", type: "success" });
    } catch {
      setToast({ msg: "Failed to submit rating", type: "error" });
    }
  };

  // Profile editing
  const [profileModal, setProfileModal] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileGrade, setProfileGrade] = useState("");

  const handleSaveProfile = async () => {
    if (!currentUser || !profileName) return;
    try {
      await updateUserProfile({
        name: profileName,
        grade: profileGrade || null,
      });
      setToast({ msg: "Profile updated", type: "success" });
      setProfileModal(false);
    } catch {
      setToast({ msg: "Update failed", type: "error" });
    }
  };

  const upcoming  = sessions.filter((s) => s.status === "upcoming");
  const completed = sessions.filter((s) => s.status === "completed" && !s.tuteeRated);
  const allDone   = sessions.filter((s) => s.status === "completed");

  // Get min date for date filter (today)
  const minDate = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* School Banner */}
      <SchoolBanner variant="full" className="mb-4" />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-gray-900">Find a Tutor</h1>
          <p className="text-gray-500 text-sm mt-1">
            All tutors are from {school?.name || currentUser?.schoolDomain} and school-verified.
          </p>
        </div>
        <Button variant="secondary" onClick={() => {
          setProfileName(currentUser?.name ?? "");
          setProfileGrade(currentUser?.grade ?? "");
          setProfileModal(true);
        }}>
          <User className="w-4 h-4" /> Edit Profile
        </Button>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {([
          { key: "search",   label: "Search"      },
          { key: "calendar", label: "Calendar"     },
          { key: "sessions", label: "My Sessions"  },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors relative ${
              tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {key === "sessions" && completed.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-500 text-white text-[9px] flex items-center justify-center">
                {completed.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Search Tab ── */}
      {tab === "search" && (
        <>
          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Subject — free-text with datalist suggestions */}
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Subject</label>
                <input
                  list="subject-suggestions"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Any subject (e.g. Calculus, Latin…)"
                  className="h-9 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent w-full"
                />
                <datalist id="subject-suggestions">
                  {DEFAULT_SUBJECTS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              {/* Tutor name — client-side filter */}
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Tutor Name</label>
                <input
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Search by name…"
                  className="h-9 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent w-full"
                />
              </div>

              <Select
                label="Day"
                placeholder="Any day"
                options={DAYS_OF_WEEK.map((d) => ({ value: d, label: d }))}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="flex-1"
              />
              <Input
                label="Specific Date"
                type="date"
                min={minDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1"
              />
              <div className="flex items-end">
                <Button onClick={handleSearch} loading={searching} className="w-full sm:w-auto">
                  <Search className="w-4 h-4" /> Search
                </Button>
              </div>
            </div>
            {(subject || nameFilter || day || date) && (
              <button
                onClick={() => { setSubject(""); setNameFilter(""); setDay(""); setDate(""); setFuzzyNote(null); }}
                className="mt-2 text-xs text-brand-600 hover:text-brand-700"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Results */}
          {searching && (
            <div className="text-center py-16 text-gray-400 text-sm">Searching...</div>
          )}

          {!searching && hasSearched && sortedTutors.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-600 mb-1">
                {tutors.length > 0 && nameFilter.trim()
                  ? `No tutors named "${nameFilter.trim()}" in results`
                  : "No tutors found"}
              </p>
              <p className="text-sm">Try removing filters or check back later.</p>
            </div>
          )}

          {!searching && sortedTutors.length > 0 && (
            <>
              {/* Fuzzy / normalised search note */}
              {fuzzyNote && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <Search className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{fuzzyNote}</span>
                </div>
              )}

              {/* Sort controls + AI badge */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {sortedTutors.length}{tutors.length !== sortedTutors.length ? ` of ${tutors.length}` : ""} tutor{sortedTutors.length !== 1 ? "s" : ""} found
                    {nameFilter.trim() ? ` matching "${nameFilter.trim()}"` : ""}
                  </span>
                  {aiLoading && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 text-xs font-medium animate-pulse">
                      <Sparkles className="w-3 h-3" />
                      AI ranking...
                    </span>
                  )}
                  {!aiLoading && aiPowered && sortMode === "recommended" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 text-xs font-medium">
                      <Sparkles className="w-3 h-3" />
                      AI Recommended
                    </span>
                  )}
                  {!aiLoading && !aiPowered && tutors.some((t) => t.aiScore !== undefined) && sortMode === "recommended" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                      <ArrowUpDown className="w-3 h-3" />
                      Smart sorted
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  {([
                    { key: "recommended" as SortMode, label: "Best Match", icon: Sparkles },
                    { key: "rating" as SortMode, label: "Rating", icon: Star },
                    { key: "availability" as SortMode, label: "Slots", icon: Calendar },
                  ]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setSortMode(key)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                        sortMode === key
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sortedTutors.map((tutor, idx) => (
                  <TutorCard
                    key={tutor.uid}
                    tutor={tutor}
                    rank={sortMode === "recommended" && tutor.aiScore !== undefined ? idx + 1 : undefined}
                    showAiReason={sortMode === "recommended" && !!tutor.aiReason}
                    onBook={(slot) => {
                      const availDates = getAvailableDates(slot);
                      setBookModal({ tutor, slot });
                      setBookingSubject(tutor.subjects[0] ?? "");
                      // Pre-select first available date
                      setBookingDate(availDates[0] ?? "");
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {!hasSearched && (
            <div className="text-center py-20 text-gray-400">
              <Filter className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Set your filters above and hit Search to find tutors.</p>
            </div>
          )}
        </>
      )}

      {/* ── Calendar Tab ── */}
      {tab === "calendar" && (
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          {/* Calendar panel */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-display text-lg text-gray-900 mb-4">Tutor Availability</h2>
            {calLoading ? (
              <div className="text-center py-16 text-gray-400 text-sm">Loading tutors…</div>
            ) : (
              <>
                <CalendarGrid
                  year={calYear}
                  month={calMonth}
                  dots={calendarDots}
                  selectedDate={calSelected ?? undefined}
                  onDayClick={(d) => setCalSelected(calSelected === d ? null : d)}
                  onMonthChange={changeCalMonth}
                />
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-4 text-xs text-gray-500">
                  {[
                    { color: "bg-green-500", label: "Tutor available" },
                    { color: "bg-blue-500",  label: "My session"      },
                  ].map(({ color, label }) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${color}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Day detail panel */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            {!calSelected ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16">
                <Calendar className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500 mb-1">Pick a day</p>
                <p className="text-xs">Green dots show days when tutors are available to book.</p>
              </div>
            ) : (
              <div>
                <h3 className="font-display text-base text-gray-900 mb-4">
                  {format(new Date(calSelected + "T12:00:00"), "EEEE, MMMM d")}
                </h3>

                {/* My sessions on this day */}
                {calDaySessions.length > 0 && (
                  <div className="mb-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Your Sessions</p>
                    <div className="flex flex-col gap-2">
                      {calDaySessions.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded border bg-blue-50 border-blue-100 text-sm text-blue-800">
                          <Calendar className="w-3.5 h-3.5 opacity-60" />
                          <span className="font-medium">{s.tutorName}</span>
                          <Badge color="blue">{s.subject}</Badge>
                          <span className="text-xs opacity-60">{s.startTime}–{s.endTime}</span>
                          {s.meetLink && (() => {
                            const base = new Date(s.scheduledDate);
                            const [sh, sm2] = (s.startTime ?? "00:00").split(":").map(Number);
                            const [eh, em2] = (s.endTime   ?? "00:00").split(":").map(Number);
                            const startMs = new Date(base.getFullYear(), base.getMonth(), base.getDate(), sh, sm2).getTime();
                            const endMs   = new Date(base.getFullYear(), base.getMonth(), base.getDate(), eh, em2).getTime();
                            const n = Date.now();
                            const joinable = n >= startMs - 15 * 60 * 1000 && n <= endMs + 5 * 60 * 1000;
                            return joinable ? (
                              <a href={s.meetLink} target="_blank" rel="noopener noreferrer" className="ml-auto">
                                <Button size="sm"><Video className="w-3 h-3" /> Join</Button>
                              </a>
                            ) : null;
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available tutors on this day */}
                {calDayTutors.length === 0 && calDaySessions.length === 0 && (
                  <div className="text-center py-10 text-gray-400">
                    <Clock className="w-7 h-7 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No tutors available on this day.</p>
                  </div>
                )}

                {calDayTutors.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Available Tutors — {calDayTutors.length}
                    </p>
                    <div className="flex flex-col gap-3">
                      {calDayTutors.map(({ tutor, slots }) => (
                        <div key={tutor.uid} className="border border-gray-100 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-semibold text-sm">
                                {tutor.name.charAt(0)}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{tutor.name}</p>
                                <p className="text-xs text-gray-400">{tutor.grade}</p>
                              </div>
                            </div>
                            {tutor.avgRating > 0 && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                {tutor.avgRating.toFixed(1)}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mb-3">
                            {tutor.subjects.slice(0, 3).map((s) => (
                              <Badge key={s} color="blue">{s}</Badge>
                            ))}
                            {tutor.subjects.length > 3 && <Badge color="gray">+{tutor.subjects.length - 3}</Badge>}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {slots.map((slot) => (
                              <div key={slot.id} className="flex items-center justify-between bg-green-50 border border-green-100 rounded px-3 py-2 text-sm text-green-700">
                                <span className="font-medium">{slot.startTime}–{slot.endTime} <span className="text-xs opacity-60">({slot.duration} min)</span></span>
                                {pendingSlotDateSet.has(`${slot.id}_${calSelected}`) ? (
                                  <Badge color="amber">Requested</Badge>
                                ) : (
                                  <Button size="sm" onClick={() => {
                                    setBookModal({ tutor, slot });
                                    setBookingSubject(tutor.subjects[0] ?? "");
                                    setBookingDate(calSelected);
                                  }}>
                                    Request
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sessions Tab ── */}
      {tab === "sessions" && (
        <div className="flex flex-col gap-6">
          {completed.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-800 mb-3">
                You have {completed.length} session{completed.length > 1 ? "s" : ""} to rate
              </p>
              <div className="flex flex-wrap gap-2">
                {completed.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setRateModal(s); setStars(0); }}
                    className="px-3 py-1.5 bg-white border border-amber-200 rounded text-xs font-medium text-amber-700 hover:border-amber-400 transition-colors"
                  >
                    Rate {s.tutorName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="font-display text-xl text-gray-900 mb-3">Upcoming</h2>
            {upcoming.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-lg p-8 text-center text-gray-400 flex flex-col items-center gap-3">
                <p className="text-sm">No upcoming sessions.</p>
                <Button variant="secondary" onClick={() => setTab("search")}>
                  <Search className="w-4 h-4" /> Find a Tutor
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    role="tutee"
                    onCancel={() => setCancelModal(s)}
                  />
                ))}
              </div>
            )}
          </div>

          {allDone.length > 0 && (
            <div>
              <h2 className="font-display text-xl text-gray-900 mb-3">Past Sessions</h2>
              <div className="flex flex-col gap-2">
                {allDone.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    role="tutee"
                    onRate={() => { setRateModal(s); setStars(0); }}
                    showRate={!s.tuteeRated}
                  />
                ))}
              </div>
            </div>
          )}

          {/* My Requests */}
          {myRequests.length > 0 && (
            <div>
              <h2 className="font-display text-xl text-gray-900 mb-3">My Requests</h2>
              <div className="flex flex-col gap-2">
                {myRequests.map((req) => {
                  const isPending  = req.status === "pending";
                  const isAccepted = req.status === "accepted";
                  const isRejected = req.status === "rejected" || req.status === "cancelled";
                  return (
                    <div
                      key={req.id}
                      className={`border rounded-lg p-4 text-sm flex items-center justify-between gap-3 ${
                        isPending  ? "border-amber-200 bg-amber-50"
                        : isAccepted ? "border-green-200 bg-green-50"
                        : "border-gray-100 bg-gray-50"
                      }`}
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {req.tutorName} — {req.subject}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {format(new Date(req.scheduledDate + "T12:00:00"), "EEE, MMM d")}
                          {" · "}{req.startTime}–{req.endTime} ({req.duration} min)
                        </p>
                        {isRejected && req.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1">
                            {req.rejectionReason === "slot_taken"
                              ? "Slot was taken by another student"
                              : req.status === "cancelled"
                              ? "Request cancelled"
                              : "Declined by tutor"}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge color={isPending ? "amber" : isAccepted ? "green" : "gray"}>
                          {isPending ? "Pending" : isAccepted ? "Accepted" : req.status === "cancelled" ? "Cancelled" : "Declined"}
                        </Badge>
                        {isPending && (
                          <Button size="sm" variant="ghost" onClick={() => handleCancelRequest(req.id)}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Request Modal ── */}
      <Modal open={!!bookModal} onClose={() => { setBookModal(null); setBookingDate(""); }} title="Request a Session">
        {bookModal && (() => {
          // Exclude dates where tutee already has a confirmed session or a pending/accepted request
          const alreadyBooked = new Set(
            sessions
              .filter(
                (s) =>
                  s.status === "upcoming" &&
                  s.tutorId === bookModal.tutor.uid &&
                  s.startTime === bookModal.slot.startTime
              )
              .map((s) => s.scheduledDate.split("T")[0])
          );
          const alreadyRequested = new Set(
            myRequests
              .filter((r) => (r.status === "pending" || r.status === "accepted") && r.slotId === bookModal.slot.id)
              .map((r) => r.scheduledDate)
          );
          const availDates = getAvailableDates(bookModal.slot).filter(
            (d) => !alreadyBooked.has(d) && !alreadyRequested.has(d)
          );
          return (
            <div className="flex flex-col gap-4">
              <div className="bg-gray-50 rounded p-4 text-sm">
                <p className="font-medium text-gray-900 mb-1">Tutor: {bookModal.tutor.name}</p>
                <div className="flex items-center gap-2 text-gray-500">
                  {bookModal.slot.recurring ? (
                    <>
                      <Repeat className="w-3 h-3 text-brand-500" />
                      <span>Every {bookModal.slot.day}</span>
                    </>
                  ) : (
                    <>
                      <CalendarDays className="w-3 h-3 text-green-500" />
                      <span>{bookModal.slot.date ? format(new Date(bookModal.slot.date + "T12:00:00"), "EEE, MMM d, yyyy") : bookModal.slot.day}</span>
                    </>
                  )}
                  <span>· {bookModal.slot.startTime}--{bookModal.slot.endTime} ({bookModal.slot.duration} min)</span>
                </div>
                {/* AI recommendation reason */}
                {bookModal.tutor.aiReason && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-purple-600">
                    <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{bookModal.tutor.aiReason}</span>
                  </div>
                )}
              </div>

              {/* Date selection */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Select Date
                </p>
                {availDates.length === 0 ? (
                  <p className="text-sm text-red-500">No available dates — you may have already requested or booked this slot.</p>
                ) : availDates.length === 1 ? (
                  // Auto-select the only available date
                  <div
                    className="px-3 py-2.5 bg-green-50 border border-green-100 rounded text-sm text-green-700 font-medium cursor-default"
                    ref={(el) => { if (el && bookingDate !== availDates[0]) setBookingDate(availDates[0]); }}
                  >
                    {format(new Date(availDates[0] + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {availDates.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setBookingDate(d)}
                        className={`px-3 py-2.5 rounded border text-sm font-medium transition-colors ${
                          bookingDate === d
                            ? "bg-brand-50 border-brand-300 text-brand-700"
                            : "bg-white border-gray-200 text-gray-600 hover:border-brand-200"
                        }`}
                      >
                        {format(new Date(d + "T12:00:00"), "EEE, MMM d")}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Select
                label="Subject"
                options={bookModal.tutor.subjects.map((s) => ({ value: s, label: s }))}
                value={bookingSubject}
                onChange={(e) => setBookingSubject(e.target.value)}
              />
              <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-700">
                Your request goes to the tutor for approval. A Google Meet link will be sent to your email once accepted.
              </div>
              <Divider />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setBookModal(null)}>Cancel</Button>
                <Button
                  onClick={handleRequest}
                  loading={booking}
                  disabled={booking || !bookingDate || availDates.length === 0}
                >
                  Send Request
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Rate Modal ── */}
      <Modal open={!!rateModal} onClose={() => setRateModal(null)} title="Rate Your Session">
        {rateModal && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              How was your session with <strong>{rateModal.tutorName}</strong>?
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
              placeholder="Write a review (optional)..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRateModal(null)}>Skip</Button>
              <Button onClick={handleRate} disabled={stars === 0}>Submit Rating</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Cancel Modal ── */}
      <Modal open={!!cancelModal} onClose={() => setCancelModal(null)} title="Cancel Session">
        <p className="text-sm text-gray-600 mb-6">
          Cancel your session with <strong>{cancelModal?.tutorName}</strong>?
          The tutor will be notified and the slot will be freed.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelModal(null)}>Keep It</Button>
          <Button variant="danger" onClick={handleCancel}>Yes, Cancel</Button>
        </div>
      </Modal>

      {/* ── Profile Modal ── */}
      <Modal open={profileModal} onClose={() => setProfileModal(false)} title="Edit Profile">
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
          />
          <Select
            label="Grade"
            options={GRADES}
            value={profileGrade}
            onChange={(e) => setProfileGrade(e.target.value)}
          />
          <Divider />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setProfileModal(false)}>Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={!profileName}>Save Profile</Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function TutorCard({
  tutor, onBook, rank, showAiReason,
}: {
  tutor: TutorCardType;
  onBook: (slot: AvailabilitySlot) => void;
  rank?: number;
  showAiReason?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white border rounded-lg overflow-hidden transition-colors ${
      rank === 1 ? "border-purple-200 ring-1 ring-purple-100" : "border-gray-200 hover:border-brand-200"
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Rank badge or avatar */}
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-semibold text-sm">
                {tutor.name.charAt(0)}
              </div>
              {rank !== undefined && rank <= 3 && (
                <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  rank === 1 ? "bg-purple-500 text-white" :
                  rank === 2 ? "bg-purple-300 text-white" :
                  "bg-purple-100 text-purple-600"
                }`}>
                  {rank}
                </div>
              )}
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">{tutor.name}</p>
              <p className="text-xs text-gray-500">{tutor.grade}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {tutor.avgRating > 0 && (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span className="text-xs font-medium text-gray-700">{tutor.avgRating.toFixed(1)}</span>
                <span className="text-xs text-gray-400">({tutor.reviewCount})</span>
              </div>
            )}
            {tutor.aiScore !== undefined && (
              <div className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span className="text-[10px] font-medium text-purple-500">{tutor.aiScore}% match</span>
              </div>
            )}
          </div>
        </div>

        {/* AI recommendation reason */}
        {showAiReason && tutor.aiReason && (
          <div className="flex items-start gap-1.5 mb-3 px-2.5 py-2 bg-purple-50 rounded-md">
            <Sparkles className="w-3 h-3 text-purple-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-purple-700 leading-relaxed">{tutor.aiReason}</p>
          </div>
        )}

        {/* Subjects */}
        <div className="flex flex-wrap gap-1 mb-3">
          {tutor.subjects.slice(0, 4).map((s) => (
            <Badge key={s} color="blue">{s}</Badge>
          ))}
          {tutor.subjects.length > 4 && (
            <Badge color="gray">+{tutor.subjects.length - 4}</Badge>
          )}
        </div>

        {tutor.bio && (
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">{tutor.bio}</p>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
        >
          {tutor.availableSlots.length} open slot{tutor.availableSlots.length !== 1 ? "s" : ""}
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      </div>

      {/* Slots list */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 flex flex-col gap-2">
          {tutor.availableSlots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
            >
              <div className="text-xs text-gray-700 flex items-center gap-1.5">
                {slot.recurring ? (
                  <Repeat className="w-3 h-3 text-brand-400" />
                ) : (
                  <CalendarDays className="w-3 h-3 text-green-400" />
                )}
                <span className="font-medium">
                  {slot.recurring
                    ? `Every ${slot.day}`
                    : (slot.date ? format(new Date(slot.date + "T12:00:00"), "EEE, MMM d") : slot.day)}
                </span>
                {" · "}{slot.startTime}--{slot.endTime}{" "}
                <span className="text-gray-400">({slot.duration} min)</span>
              </div>
              <Button size="sm" onClick={() => onBook(slot)}>Request</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session, role, onCancel, onRate, showRate,
}: {
  session: SessionDoc;
  role: "tutor" | "tutee";
  onCancel?: () => void;
  onRate?: () => void;
  showRate?: boolean;
}) {
  const other = role === "tutee" ? session.tutorName : session.tuteeName;
  const isUpcoming = session.status === "upcoming";

  // Re-evaluate every 30 s so the Join button appears automatically
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Show Join only within 15 mins before start and up to 5 mins after end
  const canJoin = useMemo(() => {
    if (!session.meetLink || !isUpcoming) return false;
    const base = new Date(session.scheduledDate);
    const [sh, sm] = (session.startTime ?? "00:00").split(":").map(Number);
    const [eh, em] = (session.endTime   ?? "00:00").split(":").map(Number);
    const startMs = new Date(base.getFullYear(), base.getMonth(), base.getDate(), sh, sm).getTime();
    const endMs   = new Date(base.getFullYear(), base.getMonth(), base.getDate(), eh, em).getTime();
    return now >= startMs - 15 * 60 * 1000 && now <= endMs + 5 * 60 * 1000;
  }, [now, session, isUpcoming]);

  // How many minutes until the Join window opens (for tooltip / disabled hint)
  const minsUntilJoin = useMemo(() => {
    if (!session.meetLink || !isUpcoming) return null;
    const base = new Date(session.scheduledDate);
    const [sh, sm] = (session.startTime ?? "00:00").split(":").map(Number);
    const startMs = new Date(base.getFullYear(), base.getMonth(), base.getDate(), sh, sm).getTime();
    const diff = Math.ceil((startMs - 15 * 60 * 1000 - now) / 60_000);
    return diff > 0 ? diff : null;
  }, [now, session, isUpcoming]);

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="font-medium text-gray-900 text-sm">{other}</p>
          <Badge color={isUpcoming ? "green" : "gray"}>
            {isUpcoming ? "Upcoming" : "Completed"}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {format(new Date(session.scheduledDate), "EEE, MMM d")}
          </span>
          <span>{session.startTime}--{session.endTime}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {session.duration} min
          </span>
          <Badge color="blue">{session.subject}</Badge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isUpcoming && session.meetLink && (
          canJoin ? (
            <a href={session.meetLink} target="_blank" rel="noopener noreferrer">
              <Button size="sm"><Video className="w-3 h-3" /> Join</Button>
            </a>
          ) : minsUntilJoin !== null ? (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              Join in {minsUntilJoin} min
            </span>
          ) : null
        )}
        {isUpcoming && onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
        {!isUpcoming && showRate && onRate && (
          <Button size="sm" variant="secondary" onClick={onRate}>
            <Star className="w-3 h-3" /> Rate
          </Button>
        )}
      </div>
    </div>
  );
}
