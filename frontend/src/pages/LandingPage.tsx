// src/pages/LandingPage.tsx
import { Link } from "react-router-dom";
import { BookOpen, Shield, Zap, BarChart2, Calendar, Star } from "lucide-react";

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-navy-DEFAULT text-white py-24 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-brand-500 text-white text-xs font-semibold px-3 py-1 rounded-full mb-6 tracking-wide uppercase">
            School-Verified
          </span>
          <h1 className="font-display text-5xl md:text-6xl mb-6 leading-tight">
            Peer tutoring<br />that actually works.
          </h1>
          <p className="text-blue-200 text-lg mb-8 max-w-xl mx-auto">
            Find a tutor from your school in under 3 minutes. Every session verified, booked, and tracked.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/auth?mode=signup"
              className="px-7 py-3.5 bg-brand-500 text-white rounded font-medium hover:bg-brand-600 transition-colors"
            >
              Get started free
            </Link>
            <Link
              to="/auth"
              className="px-7 py-3.5 border border-blue-700 text-blue-200 rounded font-medium hover:border-blue-400 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <div className="bg-navy-mid py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 px-6 text-center">
          {[
            { n: "10K+",  l: "Students" },
            { n: "20+",   l: "Schools" },
            { n: "99.9%", l: "Uptime" },
            { n: "4.8★",  l: "Avg Rating" },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-display text-3xl text-white">{s.n}</div>
              <div className="text-blue-300 text-sm">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-4xl text-center text-gray-900 mb-14">
            Everything you need. Nothing you don't.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { Icon: Shield,   title: "School-Verified Auth",  body: "Every user authenticates with their school email. Zero cross-school data leakage. FERPA & COPPA compliant." },
              { Icon: Zap,      title: "Instant Booking",       body: "Atomic transactions prevent double-booking. Book a tutor slot in 3 clicks. No back-and-forth emails." },
              { Icon: Calendar, title: "Auto-Scheduled",        body: "Google Meet link and calendar invite sent within 30 seconds of every confirmed booking." },
              { Icon: Star,     title: "Bidirectional Ratings", body: "Both tutor and tutee rate each session. Aggregate scores surface quality automatically." },
              { Icon: BarChart2,title: "Admin Analytics",       body: "Schools get real-time visibility into participation, quality, and engagement for the first time." },
              { Icon: BookOpen, title: "Subject Management",    body: "Admins curate an approved subject list. Tutors self-declare expertise within those subjects." },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-brand-500" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-brand-500 text-white text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="font-display text-4xl mb-4">Ready to start tutoring?</h2>
          <p className="text-blue-100 mb-8">Join your school's peer tutoring network today.</p>
          <Link
            to="/auth?mode=signup"
            className="inline-block px-8 py-4 bg-white text-brand-600 font-semibold rounded hover:bg-blue-50 transition-colors"
          >
            Create your account
          </Link>
        </div>
      </section>
    </div>
  );
}
