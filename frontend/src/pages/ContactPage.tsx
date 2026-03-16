// src/pages/ContactPage.tsx
import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Mail, MessageSquare, Send, Star, CheckCircle, ChevronDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────

type Tab = "contact" | "feedback";

const CONTACT_SUBJECTS = [
  "General Inquiry",
  "Partnership / School Onboarding",
  "Pricing & Plans",
  "Technical Support",
  "Press & Media",
  "Other",
];

const FEEDBACK_CATEGORIES = [
  "App Experience",
  "Tutor Quality",
  "Booking Process",
  "Email Notifications",
  "Feature Request",
  "Bug Report",
  "Other",
];

// ── Star Rating component ─────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="focus:outline-none transition-transform hover:scale-110"
        >
          <Star
            className={`w-7 h-7 transition-colors ${
              n <= (hover || value)
                ? "text-amber-400 fill-amber-400"
                : "text-gray-300"
            }`}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm text-gray-500 self-center">
          {["", "Poor", "Fair", "Good", "Great", "Excellent"][value]}
        </span>
      )}
    </div>
  );
}

// ── Select component ──────────────────────────────────────────────

function Select({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors pr-10 ${
          value ? "text-gray-900 border-gray-300" : "text-gray-400 border-gray-300"
        }`}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function ContactPage() {
  const [tab, setTab]     = useState<Tab>("contact");
  const [sent, setSent]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Contact form state
  const [cName,    setCName]    = useState("");
  const [cEmail,   setCEmail]   = useState("");
  const [cSubject, setCSubject] = useState("");
  const [cMessage, setCMessage] = useState("");

  // Feedback form state
  const [fName,     setFName]     = useState("");
  const [fEmail,    setFEmail]    = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fRating,   setFRating]   = useState(0);
  const [fMessage,  setFMessage]  = useState("");

  const fns = getFunctions();
  const callSubmit = httpsCallable(fns, "submitContactForm");

  const handleContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!cSubject) { setError("Please select a subject."); return; }
    setLoading(true);
    try {
      await callSubmit({ type: "contact", name: cName, email: cEmail, subject: cSubject, message: cMessage });
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!fCategory) { setError("Please select a category."); return; }
    setLoading(true);
    try {
      await callSubmit({ type: "feedback", name: fName, email: fEmail, category: fCategory, rating: fRating || undefined, message: fMessage });
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ───────────────────────────────────────────────

  if (sent) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Message sent!</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            Thanks for reaching out. We've sent a confirmation to your email and will get back to you within 1–2 business days.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => { setSent(false); setTab("contact"); setCName(""); setCEmail(""); setCSubject(""); setCMessage(""); setFName(""); setFEmail(""); setFCategory(""); setFRating(0); setFMessage(""); }}
              className="px-6 py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600 transition-colors"
            >
              Send another message
            </button>
            <a
              href="/"
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:border-gray-400 transition-colors"
            >
              Back to home
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────

  const inputCls = "w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors placeholder:text-gray-400";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <div>
      {/* Hero */}
      <section className="bg-navy-DEFAULT text-white py-16 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block bg-brand-500 text-white text-xs font-semibold px-3 py-1 rounded-full mb-5 tracking-wide uppercase">
            Get in touch
          </span>
          <h1 className="font-display text-4xl md:text-5xl mb-4 leading-tight">
            We'd love to hear from you
          </h1>
          <p className="text-blue-200 text-lg max-w-lg mx-auto">
            Whether you're a school administrator, a student, or just curious — drop us a line and we'll get back to you promptly.
          </p>
        </div>
      </section>

      {/* Contact info strip */}
      <div className="bg-navy-mid py-6 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: "✉️", label: "Email us",     value: "admin@schoolpeertutor.com" },
            { icon: "⏱️", label: "Response time", value: "Within 1–2 business days" },
            { icon: "🌐", label: "Website",       value: "schoolpeertutor.com" },
          ].map((c) => (
            <div key={c.label} className="flex items-center gap-3 text-white">
              <span className="text-2xl">{c.icon}</span>
              <div>
                <p className="text-xs text-blue-300">{c.label}</p>
                <p className="text-sm font-medium">{c.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Form section */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">

          {/* Tabs */}
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 mb-8 shadow-sm">
            {([
              { key: "contact",  label: "Contact Us",       Icon: Mail },
              { key: "feedback", label: "Provide Feedback",  Icon: MessageSquare },
            ] as { key: Tab; label: string; Icon: React.ElementType }[]).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setError(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === key
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Card header */}
            <div className="bg-gradient-to-r from-navy-DEFAULT to-navy-mid px-8 py-6">
              <h2 className="text-xl font-bold text-white mb-1">
                {tab === "contact" ? "Send us a message" : "Share your feedback"}
              </h2>
              <p className="text-blue-200 text-sm">
                {tab === "contact"
                  ? "Fill out the form below and our team will respond within 1–2 business days."
                  : "Your feedback helps us improve PeerTutor for everyone. We read every submission."}
              </p>
            </div>

            {/* Form body */}
            <div className="px-8 py-8">
              {error && (
                <div className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              {tab === "contact" ? (
                <form onSubmit={handleContact} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Full name <span className="text-red-400">*</span></label>
                      <input required value={cName} onChange={(e) => setCName(e.target.value)}
                        className={inputCls} placeholder="Jane Smith" />
                    </div>
                    <div>
                      <label className={labelCls}>Email address <span className="text-red-400">*</span></label>
                      <input required type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)}
                        className={inputCls} placeholder="jane@school.edu" />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Subject <span className="text-red-400">*</span></label>
                    <Select value={cSubject} onChange={setCSubject} options={CONTACT_SUBJECTS} placeholder="What's this about?" />
                  </div>

                  <div>
                    <label className={labelCls}>Message <span className="text-red-400">*</span></label>
                    <textarea required value={cMessage} onChange={(e) => setCMessage(e.target.value)}
                      rows={5} className={`${inputCls} resize-none`}
                      placeholder="Tell us more about your inquiry..."
                      minLength={10}
                    />
                    <p className="mt-1 text-xs text-gray-400 text-right">{cMessage.length} characters</p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-brand-500 text-white rounded-lg font-semibold hover:bg-brand-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : <Send className="w-4 h-4" />}
                    {loading ? "Sending…" : "Send message"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleFeedback} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Full name <span className="text-red-400">*</span></label>
                      <input required value={fName} onChange={(e) => setFName(e.target.value)}
                        className={inputCls} placeholder="Jane Smith" />
                    </div>
                    <div>
                      <label className={labelCls}>Email address <span className="text-red-400">*</span></label>
                      <input required type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)}
                        className={inputCls} placeholder="jane@school.edu" />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Category <span className="text-red-400">*</span></label>
                    <Select value={fCategory} onChange={setFCategory} options={FEEDBACK_CATEGORIES} placeholder="What area is this about?" />
                  </div>

                  <div>
                    <label className={labelCls}>Overall rating <span className="text-gray-400 font-normal">(optional)</span></label>
                    <StarRating value={fRating} onChange={setFRating} />
                  </div>

                  <div>
                    <label className={labelCls}>Your feedback <span className="text-red-400">*</span></label>
                    <textarea required value={fMessage} onChange={(e) => setFMessage(e.target.value)}
                      rows={5} className={`${inputCls} resize-none`}
                      placeholder="Share your thoughts, ideas, or issues…"
                      minLength={10}
                    />
                    <p className="mt-1 text-xs text-gray-400 text-right">{fMessage.length} characters</p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-brand-500 text-white rounded-lg font-semibold hover:bg-brand-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : <MessageSquare className="w-4 h-4" />}
                    {loading ? "Submitting…" : "Submit feedback"}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* FAQ teaser */}
          <div className="mt-10 text-center">
            <p className="text-sm text-gray-500">
              Looking for quick answers?{" "}
              <a href="mailto:admin@schoolpeertutor.com" className="text-brand-500 font-medium hover:text-brand-600">
                Email us directly
              </a>{" "}
              at <strong>admin@schoolpeertutor.com</strong>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
