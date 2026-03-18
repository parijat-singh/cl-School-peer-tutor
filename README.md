# PeerTutor — School-Verified Peer Tutoring Platform

A multi-tenant, containerized, school-verified peer tutoring web platform built with React 18, Firebase, and Docker.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Docker Compose                       │
│                                                             │
│  ┌──────────────┐    ┌───────────────────┐    ┌──────────┐ │
│  │   Frontend   │    │ Firebase Emulators│    │  Nginx   │ │
│  │  React/Vite  │◄──►│ Auth·Firestore    │◄──►│  :80     │ │
│  │   :5173      │    │ Functions·Storage │    │          │ │
│  └──────────────┘    │   :4000 UI        │    └──────────┘ │
│                       │   :5001 Functions │                 │
│                       │   :8080 Firestore │                 │
│                       │   :9099 Auth      │                 │
│                       └───────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start (Docker)

### Prerequisites
- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- A Firebase project ([create one](https://console.firebase.google.com))

### 1. Clone and configure

```bash
git clone <your-repo>
cd cl-School-peer-tutor
cp .env.example .env
```

Edit `.env` with your Firebase project values.

### 2. Start all services

```bash
docker-compose up --build
```

| Service               | URL                           |
|-----------------------|-------------------------------|
| Frontend (React)      | http://localhost:5173          |
| Nginx proxy           | http://localhost:80            |
| Firebase Emulator UI  | http://localhost:4000          |
| Firestore emulator    | localhost:8080                 |
| Auth emulator         | localhost:9099                 |
| Functions emulator    | localhost:5001                 |

### 3. Seed a test school

In the Firebase Emulator UI → Firestore → add a document at `schools/test.edu`:

```json
{
  "domain":     "test.edu",
  "name":       "Test High School",
  "type":       "high",
  "approved":   true,
  "brandColor": "#0055FF",
  "subjects":   ["Algebra", "Biology", "English", "Chemistry"]
}
```

Then sign up at http://localhost:5173/auth?mode=signup using a `@test.edu` email.

---

## Project Structure

```
cl-School-peer-tutor/
├── docker-compose.yml          # Development orchestration
├── docker-compose.prod.yml     # Production overrides
├── .env.example                # Required environment variables
│
├── frontend/                   # React 18 + Vite + TypeScript
│   ├── Dockerfile              # Dev + production multi-stage
│   ├── src/
│   │   ├── App.tsx             # Router + AuthProvider
│   │   ├── lib/
│   │   │   ├── firebase.ts     # SDK init + emulator connect
│   │   │   ├── firestore.ts    # All Firestore queries
│   │   │   ├── functions.ts    # Callable function wrappers
│   │   │   ├── auth-context.tsx# Auth state + sign-in/up
│   │   │   └── types.ts        # Shared TypeScript types
│   │   ├── pages/
│   │   │   ├── LandingPage.tsx
│   │   │   ├── AuthPage.tsx    # Sign-in + Sign-up
│   │   │   ├── TutorDashboard.tsx
│   │   │   ├── TuteeBooking.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── TutorProfile.tsx
│   │   │   ├── RateSession.tsx
│   │   │   └── OnboardRole.tsx
│   │   └── components/shared/
│   │       ├── ui.tsx          # Button, Input, Modal, Toast…
│   │       ├── Layout.tsx      # Nav + Outlet
│   │       └── ProtectedRoute.tsx
│
├── backend/                    # Firebase project root
│   ├── Dockerfile              # Emulators + Functions
│   ├── firebase.json           # Emulator + deploy config
│   ├── firestore/
│   │   ├── firestore.rules     # Multi-tenant security rules
│   │   └── firestore.indexes.json
│   ├── storage/storage.rules
│   └── functions/src/
│       ├── index.ts            # All exports
│       ├── lib/
│       │   ├── admin.ts        # Firebase Admin SDK
│       │   ├── email.ts        # SendGrid wrapper
│       │   └── googleMeet.ts   # Calendar API + Meet
│       ├── bookings/bookSession.ts     # Atomic booking
│       ├── sessions/cancelSession.ts   # Cancel + free slot
│       ├── reviews/submitRating.ts     # Bidirectional ratings
│       ├── reviews/adminDeleteReview.ts
│       ├── auth/onUserCreate.ts        # Custom claims trigger
│       ├── auth/adminSuspendUser.ts    # Suspend/unsuspend
│       ├── auth/updateTutorProfile.ts
│       ├── schools/registerSchool.ts
│       ├── notifications/sendSessionReminders.ts
│       ├── notifications/triggerRatingPrompts.ts
│       ├── aggregations/updateSchoolStats.ts
│       └── aggregations/purgeOldSessions.ts
│
└── nginx/
    ├── Dockerfile
    └── nginx.conf              # Reverse proxy + rate limiting
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `FIREBASE_API_KEY` | Web API key from Firebase console |
| `FIREBASE_AUTH_DOMAIN` | `yourproject.firebaseapp.com` |
| `FIREBASE_STORAGE_BUCKET` | `yourproject.appspot.com` |
| `SENDGRID_API_KEY` | SendGrid API key for email |
| `GOOGLE_CALENDAR_CLIENT_EMAIL` | Service account email |
| `GOOGLE_CALENDAR_PRIVATE_KEY` | Service account private key |

See `.env.example` for the full list.

---

## Firebase Setup

### 1. Create a Firebase project

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (from backend/ directory)
cd backend
firebase use --add   # select your project
```

### 2. Enable services in Firebase Console

- Authentication → Email/Password provider
- Firestore → Create database (production mode, region: nam5)
- Storage → Default bucket
- Functions → (deployed via CLI)

### 3. Deploy Firestore rules + indexes

```bash
cd backend
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 4. Deploy Cloud Functions

```bash
cd backend
firebase deploy --only functions
```

---

## Production Deployment

**Frontend** is served from **AWS S3 + CloudFront** (not Firebase Hosting). The CD pipeline (GitHub Actions) builds the frontend, syncs to S3, and invalidates CloudFront. To create the AWS resources and deploy manually:

```bash
# 1. Create AWS infrastructure (one-time; see infra/terraform/README.md)
cd infra/terraform
terraform init && terraform apply

# 2. Create IAM access key for GitHub Actions, add to GitHub Secrets (S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, AWS_*).

# 3. Deploy from your machine (uses .env.production)
bash scripts/deploy.sh
```

**Firebase** (Functions, Firestore rules, Storage rules) is deployed by the same CD pipeline or via `firebase deploy --only functions,firestore:rules,storage` from `backend/`.

Firestore rules and indexes live under **`backend/firestore/`** — there are no Firestore config files at the repo root.

---

## Production checklist

**Detailed steps:** See **[docs/production-setup-guide.md](docs/production-setup-guide.md)** for step-by-step instructions (Terraform, IAM access key, GitHub Secrets, Firebase secrets).

Before going live, complete the following.

### AWS (frontend)

- [ ] Run `infra/terraform` to create S3 bucket, CloudFront distribution, and IAM user (see `infra/terraform/README.md`).
- [ ] Create IAM access key for the deploy user; add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID` to GitHub Secrets.
- [ ] (Optional) Attach custom domain and ACM certificate via Terraform variables.

### Firebase (backend)

- [ ] Create a Firebase project and enable Auth (Email/Password), Firestore, Storage, and Functions.
- [ ] From `backend/`: `firebase use <project-id>`, then deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes,storage`.
- [ ] Add GitHub Secret **`SENTRY_DSN`** (Sentry DSN) — CD injects it into functions at deploy. Do not use Secret Manager for `SENTRY_DSN` (Cloud Run overlap error).
- [ ] Optionally set other secrets via `firebase functions:secrets:set …` or Cloud Console (see `.env.production.example`).
- [ ] Generate a CI token: `firebase login:ci` and add `FIREBASE_TOKEN` to GitHub Secrets.
- [ ] Add Firebase web config to GitHub Secrets: `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` (for frontend build).

### Notifications

- [ ] Add Resend (or SMTP) and alert email to GitHub Secrets: `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SUPER_ADMIN_EMAIL`.

Once the checklist is done, pushes to `master` run CI and then CD deploys frontend (S3 + CloudFront) and Firebase (Functions + rules).

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Firestore multi-tenancy via security rules** | `schoolDomain` claim on every JWT enforced by rules — cross-school reads are architecturally impossible |
| **Atomic booking transaction** | `runTransaction` prevents double-booking with optimistic locking — no `SELECT FOR UPDATE` |
| **Cloud Functions for all writes** | Rating, booking, suspension all happen server-side — clients never write sessions or reviews directly |
| **Google Meet via Calendar API** | Server-side provisioning with 3-retry exponential backoff; graceful degradation if API fails |
| **SendGrid for email** | Reliable transactional email with template management; `.ics` calendar invites attached |
| **All grades welcome** | No age-gating — all students with a valid school email can sign up immediately |

---

## Development Scripts

```bash
# Start everything
docker-compose up --build

# Frontend only (if running Firebase emulators separately)
cd frontend && npm run dev

# Build functions and watch
cd backend/functions && npm run build:watch

# Run Firestore rules tests
cd backend && firebase emulators:exec --only firestore "npm test"

# Deploy only functions
cd backend && firebase deploy --only functions

# View function logs
firebase functions:log
```

---

## Security Notes

- All external API keys (`SENDGRID_API_KEY`, `GOOGLE_CALENDAR_PRIVATE_KEY`) live in server environment only — never in client code
- Firestore rules enforce `schoolDomain` isolation on every collection
- Firebase Auth custom claims (`role`, `schoolDomain`, `status`) are set server-side only via Cloud Functions
- Rate limiting: 10 bookings/minute per user (in-function), 30 req/minute via Nginx
- Audit log is immutable — no client delete permission on `adminAuditLog`
- Suspended users are immediately disabled in Firebase Auth (`auth.updateUser({ disabled: true })`)

---

## Open items (optional)

- [ ] Create SendGrid account and build email templates (5 templates needed)
- [ ] Create Google Cloud service account with Calendar API + domain-wide delegation
- [ ] Onboard 2 pilot schools via `registerSchool` callable + ops approval
