// src/pages/RateSession.tsx
// Deep-linked from rating prompt email: /rate/:sessionId
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { submitRating } from "@/lib/functions";
import { Button, StarRating, Toast } from "@/components/shared/ui";
import type { SessionDoc } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

export default function RateSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionDoc | null>(null);
  const [error, setError]     = useState("");
  const [stars, setStars]     = useState(0);
  const [text, setText]       = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [toast, setToast]     = useState<{ msg: string; type: "success"|"error" } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    getDoc(doc(db, "sessions", sessionId)).then((snap) => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() } as SessionDoc);
      else setError("Session not found.");
    }).catch(() => setError("Failed to load session. Please try again."));
  }, [sessionId]);

  const alreadyRated = currentUser?.role === "tutee"
    ? session?.tuteeRated
    : session?.tutorRated;

  const handleSubmit = async () => {
    if (!sessionId || stars === 0) return;
    setLoading(true);
    try {
      await submitRating({ sessionId, stars: stars as 1|2|3|4|5, text });
      setDone(true);
      setTimeout(() => navigate("/find"), 2000);
    } catch {
      setToast({ msg: "Failed to submit rating", type: "error" });
    }
    setLoading(false);
  };

  if (error) return <div className="text-center py-20 text-red-500 text-sm">{error}</div>;
  if (!session) return <div className="text-center py-20 text-gray-400 text-sm">Loading…</div>;

  if (alreadyRated || done) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">⭐</div>
        <h2 className="font-display text-2xl text-gray-900 mb-2">Thanks for rating!</h2>
        <p className="text-gray-500 text-sm">Your feedback helps improve the platform for everyone.</p>
      </div>
    );
  }

  const otherName = currentUser?.role === "tutee" ? session.tutorName : session.tuteeName;

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <h2 className="font-display text-2xl text-gray-900 mb-1">Rate Your Session</h2>
        <p className="text-gray-500 text-sm mb-8">How was your session with <strong>{otherName}</strong>?</p>
        <div className="flex justify-center mb-6">
          <StarRating value={stars} onChange={setStars} size="lg" />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Optional written review…"
          className="w-full border border-gray-200 rounded px-3 py-2.5 text-sm resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4"
        />
        <Button className="w-full" onClick={handleSubmit} loading={loading} disabled={stars === 0}>
          Submit Rating
        </Button>
      </div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
