// src/pages/TutorProfile.tsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getUserDoc, getTutorReviews, getTutorSlots } from "@/lib/api-queries";
import { Button, Badge, StarRating } from "@/components/shared/ui";
import type { UserDoc, ReviewDoc, AvailabilitySlot } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { Star } from "lucide-react";
import { format } from "date-fns";

export default function TutorProfile() {
  const { tutorId } = useParams<{ tutorId: string }>();
  const { currentUser } = useAuth();

  const [tutor, setTutor]     = useState<UserDoc | null>(null);
  const [error, setError]     = useState("");
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [slots, setSlots]     = useState<AvailabilitySlot[]>([]);

  useEffect(() => {
    if (!tutorId) return;
    getUserDoc(tutorId).then((doc) => {
      if (doc) setTutor(doc);
      else setError("Tutor not found.");
    }).catch(() => setError("Failed to load tutor profile."));
    if (currentUser?.schoolDomain) {
      getTutorReviews(tutorId).then(setReviews).catch(() => {});
    }
    getTutorSlots(tutorId).then((s) =>
      setSlots(s.filter((sl) => !sl.booked))
    ).catch(() => {});
  }, [tutorId, currentUser]);

  if (error) return <div className="text-center py-20 text-red-500 text-sm">{error}</div>;
  if (!tutor) return <div className="text-center py-20 text-gray-400">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-start gap-5 mb-8">
        <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-display text-2xl flex-shrink-0">
          {tutor.name.charAt(0)}
        </div>
        <div>
          <h1 className="font-display text-3xl text-gray-900">{tutor.name}</h1>
          <p className="text-gray-500 text-sm mb-2">{tutor.grade} · {tutor.schoolDomain}</p>
          <div className="flex items-center gap-2">
            {(tutor.avgRating ?? 0) > 0 && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-sm font-medium">{tutor.avgRating?.toFixed(1)}</span>
                <span className="text-sm text-gray-400">({tutor.reviewCount} reviews)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subjects */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {(tutor.subjects ?? []).map((s) => (
          <Badge key={s} color="blue">{s}</Badge>
        ))}
      </div>

      {tutor.bio && (
        <p className="text-gray-600 text-sm leading-relaxed mb-8">{tutor.bio}</p>
      )}

      {/* Available Slots */}
      {slots.length > 0 && (
        <div className="mb-8">
          <h2 className="font-display text-xl text-gray-900 mb-3">Available Slots</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {slots.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded px-4 py-3">
                <div className="text-sm">
                  <span className="font-medium text-gray-800">{slot.day}</span>
                  <span className="text-gray-500 ml-2">{slot.startTime}–{slot.endTime}</span>
                  <span className="text-gray-400 text-xs ml-2">({slot.duration} min)</span>
                </div>
                <Button size="sm">Book</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <div>
          <h2 className="font-display text-xl text-gray-900 mb-3">Reviews</h2>
          <div className="flex flex-col gap-3">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white border border-gray-100 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-800">{r.authorName}</span>
                  <StarRating value={r.stars} size="sm" />
                </div>
                {r.text && <p className="text-sm text-gray-600">{r.text}</p>}
                <p className="text-xs text-gray-400 mt-1">{format(new Date(r.createdAt), "MMM d, yyyy")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
