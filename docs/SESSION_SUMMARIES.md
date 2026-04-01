# Session Summaries — PeerTutor

## Purpose

Compact log of working sessions with key decisions, changes made, open questions, and recommended next steps. Append new entries; do not edit past entries.

---

### 2026-03-31 — Project Onboarding, Login Fix & Local Dev Bootstrap

- **Session Goal:** Switch working context to cl-School-peer-tutor, get local dev running, fix broken login, and run end-to-end validation
- **Key Decisions:**
  - Confirmed project has fully migrated from Firebase to AWS (Cognito + DynamoDB + Lambda). README was outdated.
  - Local dev uses production Cognito pool for auth and production Lambda for API. No local backend server by default.
  - `VITE_API_URL` should always point to the production API Gateway URL in local dev — not `localhost:3001`
- **Changes Made:**
  - Updated `.env` with real Cognito pool ID, client ID, and API Gateway URL (fetched from AWS)
  - Fixed `docker-compose.yml` to read `VITE_API_URL` from env var instead of hardcoded `localhost:3001`
  - Created `frontend/.dockerignore` to exclude `node_modules` from Docker build context (fixed 10-min build times)
  - Created `e2e-test.mjs` — 17 Playwright browser tests covering all major user flows; all passing
  - Created `seed-testbed.mjs` — seeds 95 users across 5 schools with availability slots and sessions
  - Created `testbed-accounts.csv` — full account listing (gitignored)
  - Fixed seed script: super admin `schoolDomain` changed from `null` to `"peertutor.app"` (DynamoDB GSI type constraint)
  - Fixed CI: resolved high-severity `picomatch` (frontend) and `path-to-regexp` (Lambda) CVEs via `npm audit fix`
  - Created `docs/` directory with full project documentation (this session)
- **Open Questions:**
  - Teacher role (`TeacherHome.tsx`) is partially implemented — scope and requirements unclear
  - `dataconnect/` directory contains Google Cloud SQL / PostgreSQL config — unclear if actively used or legacy
  - Firebase project (`peertutor-prod`) was deleted this session — confirm all Firebase references in codebase are cleaned up
- **Next Recommended Step:** Clean up remaining dead Firebase references (`scripts/migrate-firestore-to-dynamodb.ts`, `backend/functions/` directory, Firebase vars in `.env.production`) and remove from codebase
- **References:**
  - `ARCHITECTURE.md` — system design
  - `SETUP.md` — local dev bootstrap
  - `DEFECT_LOG.md` DEF-001 through DEF-008 — all bugs found and fixed this session

---

### 2026-03-31 — Firebase Audit & Project Deletion

- **Session Goal:** Determine if any runtime Firebase dependency still exists; enable safe deletion of the Firebase project
- **Key Decisions:**
  - Firebase is fully removed from runtime code. No Firebase SDK in any `package.json`. No active imports in production source files.
  - The only Firebase import is in `scripts/migrate-firestore-to-dynamodb.ts` — a one-time migration utility, not production code
  - Firebase API key in `.env.production` was rotated and Firebase project was deleted by user
- **Changes Made:**
  - User manually deleted `[REDACTED — rotated and invalidated]` API key via Firebase console
  - User manually deleted `peertutor-prod` Firebase project
- **Open Questions:**
  - `.env.production` still contains stale Firebase variable declarations — these should be removed
  - `scripts/migrate-firestore-to-dynamodb.ts` is dead code now that Firebase is deleted — safe to remove
  - `backend/functions/` directory appears empty — can be deleted
- **Next Recommended Step:** Remove dead Firebase artifacts from codebase (migration script, functions directory, stale `.env.production` vars)
- **References:**
  - `SECURITY_PRIVACY.md` — credential management
  - `DEFECT_LOG.md` AC-001, AC-002 — accepted constraints

---

### 2026-03-31 — DynamoDB Field Mapping Bug Fix (DEF-009)

- **Session Goal:** Investigate and fix broken "Add Slot" functionality on the Tutor Dashboard, then audit the entire codebase for the same class of bug
- **Key Decisions:**
  - Root cause was a systematic mismatch: DynamoDB stores entities with named primary key attributes (`slotId`, `sessionId`, etc.) but the frontend types all expect a generic `id` field. The fix is a one-line `.map()` transform in each GET handler — no schema changes needed.
  - Fix applied in GET handlers only (the write side is unaffected). DynamoDB key attribute is kept alongside `id` for backward compatibility.
  - All six affected handlers fixed in a single pass. New unit tests added for each to prevent regression.
  - Backend `.env` and `backend/lambdas/.env` are gitignored — local dev env files are not committed.
- **Changes Made:**
  - `backend/lambdas/src/handlers/schools/availability-crud.ts` — `getTutorSlots`: map `slotId` → `id`
  - `backend/lambdas/src/handlers/bookings/get-my-sessions.ts` — `getMySessions`: map `sessionId` → `id`
  - `backend/lambdas/src/handlers/bookings/get-my-booking-requests.ts` — `getMyBookingRequests`: map `requestId` → `id`
  - `backend/lambdas/src/handlers/reviews/get-tutor-reviews.ts` — `getTutorReviews`: map `reviewId` → `id`
  - `backend/lambdas/src/handlers/reviews/get-school-reviews.ts` — `getSchoolReviews`: map `reviewId` → `id`
  - `backend/lambdas/src/handlers/schools/get-audit-log.ts` — `getAuditLog`: map `timestampLogId` → `id`
  - Added test files: `availability-crud.test.ts`, `get-my-sessions.test.ts`, `get-my-booking-requests.test.ts`, `get-reviews.test.ts`, `get-audit-log.test.ts`
  - Test suite grew from 88 → 105 passing tests across 14 test files
- **Open Questions:**
  - No single DynamoDB primary key naming convention is enforced. Consider standardising all entity key attributes to `id` at the schema level (would require a data migration).
  - A shared `mapId(keyField)` utility or eslint rule would catch future instances of this pattern automatically.
  - The Lambda functions have not been redeployed to production yet — the fix is committed but needs a `terraform apply` / Lambda publish to go live.
- **Next Recommended Step:** Deploy the Lambda changes to production (`cd infra/terraform && terraform apply` or trigger the CI deploy pipeline). Verify with a real browser session on the production URL that Add Slot, accept/decline requests, and cancel session all work correctly.
- **References:**
  - `DEFECT_LOG.md` DEF-009 — full root cause and fix details
  - `backend/lambdas/src/handlers/` — all affected handler files
  - `backend/lambdas/src/handlers/**/*.test.ts` — new regression tests

---

### 2026-04-01 — API Gateway Route Coverage Audit & Regression Tests

- **Session Goal:** Fix "Failed to add slot" error for `tutor1.lincoln@lincoln.edu`, then audit for all routes of the same class and add automated tests to prevent regression
- **Key Decisions:**
  - Root cause was entirely in infrastructure (Terraform), not application code. API Gateway returned 404 before Lambda was ever invoked — making the bug invisible in Lambda logs.
  - Audit strategy: cross-reference every route registered in every Lambda `index.ts` against every route declared in `api-gateway.tf`, applying all three API Gateway v2 matching rules (exact, `{proxy+}`, `{param}`).
  - Test design: dynamic parsing (no hardcoded route lists) so the test stays in sync automatically as routes are added.
  - Tests placed in `backend/lambdas/src/handlers/` — auto-discovered by Vitest, no config changes needed.
- **Changes Made:**
  - `infra/terraform/api-gateway.tf` — 6 route gaps fixed:
    - Added `POST /availability/{proxy+}`, `DELETE /availability/{proxy+}`, `PATCH /availability/{proxy+}`
    - Replaced `GET /schools/{domain}` (exact) with `GET /schools/{proxy+}` (covers all sub-paths)
    - Added `GET /stats/{proxy+}` and `GET /audit-log/{proxy+}` under `schools` handler
    - Removed stale `misc` handler entries for stats and audit-log
  - `backend/lambdas/src/handlers/api-gateway-coverage.test.ts` — new file; 28 tests:
    - Per-handler `describe` blocks (auth, bookings, schools, reviews, misc)
    - Full cross-handler orphan check
    - 16 unit tests for the `isRouteReachable()` matching logic
  - Test suite grew from 105 → 133 passing tests across 15 files
  - Branch `claude/loving-borg` pushed to GitHub
  - `docs/DEFECT_LOG.md` — DEF-010 added
- **Open Questions:**
  - `terraform apply` has not been run yet — the API Gateway route fixes are committed but not yet live in AWS. The original "Failed to add slot" error will persist in production until apply is run.
- **Next Recommended Step:** Run `cd infra/terraform && terraform apply` to deploy the API Gateway changes. Verify with a real browser session (or `curl` with a live JWT) that `POST /availability/add` returns 200 for `tutor1.lincoln@lincoln.edu`.
- **References:**
  - `DEFECT_LOG.md` DEF-010 — full root cause and fix details
  - `infra/terraform/api-gateway.tf` — route configuration
  - `backend/lambdas/src/handlers/api-gateway-coverage.test.ts` — regression test suite
  - Branch: `claude/loving-borg`

---

### Template for Future Sessions

```
### YYYY-MM-DD — [Short Title]

- **Session Goal:** One-line objective
- **Key Decisions:**
  - Decision 1
  - Decision 2
- **Changes Made:**
  - File or feature changed
  - File or feature changed
- **Open Questions:**
  - Question 1
  - Question 2
- **Next Recommended Step:** Single clear next action
- **References:**
  - Relevant docs or file paths
```
