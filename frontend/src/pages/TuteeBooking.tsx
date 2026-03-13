// src/pages/TuteeBooking.tsx
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { searchTutors, subscribeUserSessions } from "@/lib/firestore";
import { bookSession, cancelSession, submitRating } from "@/lib/functions";
import {
  Button, Select, Modal, Toast, Badge, StarRating, Divider,
} from "@/components/shared/ui";
import type { TutorCard, AvailabilitySlot, SessionDoc } from "@/lib/types";
import { DAYS_OF_WEEK } from "@/lib/types";
import {
  Search, Star, Clock, Video, Calendar, ChevronRight, Filter, User,
} from "lucide-react";
import { format } from "date-fns";

const DEFAULT_SUBJECTS = [
  "Algebra","Geometry","Pre-Calculus","Calculus","Statistics",
  "Biology","Chemistry","Physics","Earth Science",
  "English","History","Spanish","French","Computer Science","Economics",
];

export default function TuteeBooking() {
  const { currentUser } = useAuth();

  // Search state
  const [subject, setSubject]   = useState("");
  const [day, setDay]           = useState("");
  const [tutors, setTutors]     = useState<TutorCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [tab, setTab]           = useState<"search" | "sessions">("search");

  // Modals
  const [bookModal, setBookModal]     = useState<{ tutor: TutorCard; slot: AvailabilitySlot } | null>(null);
  const [rateModal, setRateModal]     = useState<SessionDoc | null>(null);
  const [cancelModal, setCancelModal] = useState<SessionDoc | null>(null);
  const [bookingSubject, setBookingSubject] = useState("");

  // Rating
  const [stars, setStars]       = useState(0);
  const [reviewText, setReviewText] = useState("");

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success"|"error" } | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeUserSessions(currentUser.uid, "tutee", setSessions);
    return unsub;
  }, [currentUser]);

  const handleSearch = async () => {
    if (!currentUser) return;
    setSearching(true);
    setHasSearched(true);
    const results = await searchTutors({
      schoolDomain: currentUser.schoolDomain,
      subject: subject || undefined,
      day: day || undefined,
    });
    setTutors(results);
    setSearching(false);
  };

  const handleBook = async () => {
    if (!bookModal || !currentUser) return;
    try {
      // Find the next occurrence of the day
      const today = new Date();
      const dayIndex = DAYS_OF_WEEK.indexOf(bookModal.slot.day as (typeof DAYS_OF_WEEK)[number]);
      const diff = (dayIndex - today.getDay() + 7) % 7 || 7;
      const date = new Date(today);
      date.setDate(today.getDate() + diff);

      const result = await bookSession({
        tutorId:       bookModal.tutor.uid,
        slotId:        bookModal.slot.id,
        subject:       bookingSubject || bookModal.tutor.subjects[0],
        scheduledDate: date.toISOString(),
      });

      setBookModal(null);
      setTab("sessions");
      setToast({
        msg: result.data.meetLinkStatus === "ready"
          ? "Session booked! Google Meet link sent to your email."
          : "Session booked! Meet link will be emailed shortly.",
        type: "success",
      });
    } catch (err: unknown) {
      setToast({ msg: (err as Error).message ?? "Booking failed", type: "error" });
    }
  };

  const handleCancel = async () => {
    if (!cancelModal) return;
    try {
      await cancelSession({ sessionId: cancelModal.id });
      setToast({ msg: "Session cancelled", type: "success" });
    } catch {
      setToast({ msg: "Cancel failed", type: "error" });
    }
    setCancelModal(null);
  };

  const handleRate = async () => {
    if (!rateModal || stars === 0) return;
    try {
      await submitRating({ sessionId: rateModal.id, stars: stars as 1|2|3|4|5, text: reviewText });
      setRateModal(null);
      setStars(0);
      setReviewText("");
      setToast({ msg: "Rating submitted — thanks!", type: "success" });
    } catch {
      setToast({ msg: "Failed to submit rating", type: "error" });
    }
  };

  const upcoming  = sessions.filter((s) => s.status === "upcoming");
  const completed = sessions.filter((s) => s.status === "completed" && !s.tuteeRated);
  const allDone   = sessions.filter((s) => s.status === "completed");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl text-gray-900">Find a Tutor</h1>
        <p className="text-gray-500 text-sm mt-1">
          All tutors are from {currentUser?.schoolDomain} and school-verified.
        </p>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 max-w-xs">
        {(["search", "sessions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded text-sm font-medium transition-colors relative ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "search" ? "Search" : "My Sessions"}
            {t === "sessions" && completed.length > 0 && (
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
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex flex-col sm:flex-row gap-3">
            <Select
              label="Subject"
              placeholder="Any subject"
              options={DEFAULT_SUBJECTS.map((s) => ({ value: s, label: s }))}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1"
            />
            <Select
              label="Day"
              placeholder="Any day"
              options={DAYS_OF_WEEK.map((d) => ({ value: d, label: d }))}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="flex-1"
            />
            <div className="flex items-end">
              <Button onClick={handleSearch} loading={searching} className="w-full sm:w-auto">
                <Search className="w-4 h-4" /> Search
              </Button>
            </div>
          </div>

          {/* Results */}
          {searching && (
            <div className="text-center py-16 text-gray-400 text-sm">Searching…</div>
          )}

          {!searching && hasSearched && tutors.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-600 mb-1">No tutors found</p>
              <p className="text-sm">Try removing filters or check back later.</p>
            </div>
          )}

          {!searching && tutors.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {tutors.map((tutor) => (
                <TutorCard
                  key={tutor.uid}
                  tutor={tutor}
                  onBook={(slot) => { setBookModal({ tutor, slot }); setBookingSubject(tutor.subjects[0] ?? ""); }}
                />
              ))}
            </div>
          )}

          {!hasSearched && (
            <div className="text-center py-20 text-gray-400">
              <Filter className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Set your filters above and hit Search to find tutors.</p>
            </div>
          )}
        </>
      )}

      {/* ── Sessions Tab ── */}
      {tab === "sessions" && (
        <div className="flex flex-col gap-6">
          {/* Rate prompt */}
          {completed.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-800 mb-3">
                ⭐ You have {completed.length} session{completed.length > 1 ? "s" : ""} to rate
              </p>
              <div className="flex flex-wrap gap-2">
                {completed.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setRateModal(s); setStars(0); }}
                    className="px-3 py-1.5 bg-white border border-amber-200 rounded text-xs font-medium text-amber-700 hover:border-amber-400 transition-colors"
                  >
                    Rate {s.tutorName} →
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          <div>
            <h2 className="font-display text-xl text-gray-900 mb-3">Upcoming</h2>
            {upcoming.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-lg p-8 text-center text-gray-400">
                <p className="text-sm">No upcoming sessions. Go find a tutor!</p>
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

          {/* Past */}
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
        </div>
      )}

      {/* ── Book Modal ── */}
      <Modal open={!!bookModal} onClose={() => setBookModal(null)} title="Book a Session">
        {bookModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded p-4 text-sm">
              <p className="font-medium text-gray-900 mb-1">Tutor: {bookModal.tutor.name}</p>
              <p className="text-gray-500">
                {bookModal.slot.day} · {bookModal.slot.startTime}–{bookModal.slot.endTime}
                {" "}({bookModal.slot.duration} min)
              </p>
            </div>
            <Select
              label="Subject"
              options={bookModal.tutor.subjects.map((s) => ({ value: s, label: s }))}
              value={bookingSubject}
              onChange={(e) => setBookingSubject(e.target.value)}
            />
            <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-700">
              A Google Meet link and calendar invite will be sent to your school email within 30 seconds.
            </div>
            <Divider />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBookModal(null)}>Cancel</Button>
              <Button onClick={handleBook}>Confirm Booking</Button>
            </div>
          </div>
        )}
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
              placeholder="Write a review (optional)…"
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

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function TutorCard({
  tutor, onBook,
}: {
  tutor: TutorCard;
  onBook: (slot: AvailabilitySlot) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-brand-200 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-semibold text-sm">
              {tutor.name.charAt(0)}
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">{tutor.name}</p>
              <p className="text-xs text-gray-500">{tutor.grade}</p>
            </div>
          </div>
          {tutor.avgRating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="text-xs font-medium text-gray-700">{tutor.avgRating.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({tutor.reviewCount})</span>
            </div>
          )}
        </div>

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
              <div className="text-xs text-gray-700">
                <span className="font-medium">{slot.day}</span>
                {" · "}{slot.startTime}–{slot.endTime}{" "}
                <span className="text-gray-400">({slot.duration} min)</span>
              </div>
              <Button size="sm" onClick={() => onBook(slot)}>Book</Button>
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
            {format(session.scheduledDate.toDate(), "EEE, MMM d")}
          </span>
          <span>{session.startTime}–{session.endTime}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {session.duration} min
          </span>
          <Badge color="blue">{session.subject}</Badge>
        </div>
      </div>
      <div className="flex gap-2">
        {isUpcoming && session.meetLink && (
          <a href={session.meetLink} target="_blank" rel="noopener noreferrer">
            <Button size="sm">
              <Video className="w-3 h-3" /> Join
            </Button>
          </a>
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
