# Product Requirements — PeerTutor

## Purpose

Define the complete production feature scope, user flows, and delivery phases for the PeerTutor platform.

---

## Production Scope

### P0 — Core (Must Ship)

| Feature | Owner | Status |
|---------|-------|--------|
| School registration + superadmin approval | superadmin | Done |
| Cognito sign-up / sign-in / sign-out | all | Done |
| Email OTP verification at signup | all | Done |
| Role selection and onboarding | tutor, tutee | Done |
| Tutor availability management (recurring + one-off) | tutor | Done |
| Slot cancellation (individual date on recurring) | tutor | Done |
| Direct booking (atomic, double-booking-safe) | tutee | Done |
| Request → approve/reject booking flow | tutor, tutee | Done |
| Google Meet link provisioned on booking | system | Done |
| Booking confirmation email + `.ics` attachment | system | Done |
| Session cancellation (frees slot) | tutor, tutee | Done |
| Post-session bidirectional ratings (1–5 + text) | tutor, tutee | Done |
| Tutor profile page (subjects, bio, rating, reviews) | public | Done |
| Tutor search + filter (subject, availability, rating) | tutee | Done |
| School admin dashboard (users, reviews, branding) | schooladmin | Done |
| User suspension / unsuspend | schooladmin | Done |
| Immutable admin audit log | schooladmin | Done |
| School branding (name, colour, logo) | schooladmin | Done |
| Session reminders (24h + 15 min) | system | Done |
| Rating request emails | system | Done |
| Per-school multi-tenancy enforcement | system | Done |

### P1 — Enhanced

| Feature | Owner | Status |
|---------|-------|--------|
| AI tutor recommendations (Anthropic Claude) | tutee | Done |
| Review flagging (users) + admin deletion | schooladmin | Done |
| Stats dashboard (monthly sessions, avg rating) | schooladmin | Done |
| School logo upload (presigned S3) | schooladmin | Done |
| Super admin dashboard (school list, approval) | superadmin | Done |
| Contact form with email notification | public | Done |
| Rate-limiting (DynamoDB sliding window) | system | Done |

### P2 — Planned / Partial

| Feature | Owner | Status |
|---------|-------|--------|
| Teacher dashboard (read-only sessions view) | teacher | Partial |
| Promoted admin management | schooladmin | Partial |
| Recaptcha on sign-up | public | Planned |
| WAF on CloudFront | ops | Optional (Terraform flag) |

---

## User Flows

### 1. School Registration

```
School admin → /auth (sign up as schooladmin)
  → POST /auth/initialize-user (creates school + user)
  → superadmin reviews in /superadmin dashboard
  → POST /schools/approve
  → School becomes active; admin can invite tutors/tutees
```

### 2. Tutor Sign-Up & Onboarding

```
Student → /auth?mode=signup (role: tutor)
  → Cognito email verification (6-digit OTP)
  → /onboard → select subjects, bio
  → POST /auth/initialize-user (creates user doc in DynamoDB)
  → /dashboard (availability management)
```

### 3. Tutee Books a Session

```
Tutee → /find (search tutors by subject)
  → Filter by availability, rating
  → Select tutor → view /tutor/{uid}
  → Choose available slot
  → POST /bookings/book-session (atomic TransactWrite)
  → Email confirmation + Google Meet link + .ics
  → Session appears in /find (status: upcoming)
```

### 4. Request Flow (Alternative to Direct Book)

```
Tutee → POST /bookings/request (requests a slot)
  → Tutor sees pending request on dashboard
  → Tutor → POST /bookings/respond (accept | reject)
  → On accept: session created, Meet link provisioned
  → Email sent to both parties
```

### 5. Post-Session Rating

```
System (EventBridge) → detects completed session
  → POST rate request emails to tutor + tutee with deep link
  → User clicks link → /rate/{sessionId}
  → Submits 1–5 stars + comment
  → POST /reviews/submit
  → Tutor avgRating updated atomically
```

### 6. Admin Suspends a User

```
Admin → AdminDashboard → Users tab → select user
  → POST /auth/admin-suspend-user
  → Lambda: updates Cognito (disable user) + DynamoDB (status: suspended)
  → Entry written to admin-audit-log (immutable)
  → Suspended user's existing tokens immediately invalidated via Cognito global sign-out
```

---

## Subjects

Each school configures its own subject list at registration. Common subjects include:

- Mathematics (Algebra, Calculus, Geometry, Statistics)
- Sciences (Biology, Chemistry, Physics)
- Languages (English, Spanish, French)
- Humanities (History, Geography, Economics, Psychology)
- Technical (Computer Science, Art, Music)

---

## Notifications (Email)

| Trigger | Recipients | Content |
|---------|-----------|---------|
| Booking confirmed | tutor + tutee | Meet link, date/time, .ics |
| Booking cancelled | tutor + tutee | Slot freed, reason |
| Booking request received | tutor | Accept/reject link |
| Request accepted | tutee | Meet link, date/time |
| Request rejected | tutee | Rejection notice |
| Session reminder | tutor + tutee | 24h before + 15 min before |
| Session completed | tutor + tutee | Rate-session deep link |
| Contact form submitted | admin email | Form content |

---

## Non-Functional Requirements

| # | Requirement |
|---|------------|
| NFR-01 | Sessions: DynamoDB TransactWrite guarantees at-most-one booking per slot per date |
| NFR-02 | API response time: p99 < 2s for all read endpoints under normal load |
| NFR-03 | Frontend bundle: < 500KB gzipped initial load |
| NFR-04 | Zero cross-school data leakage (architectural guarantee, not just application logic) |
| NFR-05 | 80% test coverage minimum (CI gate enforced) |
| NFR-06 | Google Meet provisioning: up to 3 retries with exponential backoff; fallback graceful (meetLinkStatus: pending) |
| NFR-07 | Rate limit: 10 booking actions per user per minute; 30 requests per minute at Nginx |

---

## Related Docs

- `PROJECT_CHARTER.md` — mission, roles, constraints
- `ARCHITECTURE.md` — how features are implemented
- `DATA_MODEL.md` — data structures backing these flows
