# Defect Log — PeerTutor

## Purpose

Durable record of bugs encountered, their root causes, resolutions, and prevention rules. Append new entries; never delete resolved ones.

---

### DEF-001

- **Date:** 2026-03-31
- **Area:** Local dev — Auth
- **Severity:** High
- **Status:** Resolved
- **Summary:** Login failed with "Something went wrong. Please try again." on local dev
- **Root Cause:** `.env` contained stale Firebase variables (`VITE_FIREBASE_*`). `VITE_COGNITO_CLIENT_ID` and `VITE_COGNITO_USER_POOL_ID` were empty strings. The Cognito SDK silently used `clientId: ""`, which caused every authentication request to fail with an unhandled error that mapped to the generic "Something went wrong" fallback.
- **Resolution:** Fetched real Cognito pool/client IDs from AWS (`aws cognito-idp list-user-pools`) and updated `.env`. Restarted Docker containers to force Vite to rebake the new env vars into the bundle.
- **Verification:** Signed in successfully with test credentials; no error message shown.
- **Prevention Notes:** Always restart Docker containers (not just rebuild) after editing `.env`. Vite bakes `VITE_*` variables at container start time, not at request time. A running container will not pick up `.env` changes without a full `docker-compose down && up`.
- **Related Files:** `.env`, `docker-compose.yml`, `frontend/src/lib/cognito.ts`, `frontend/src/pages/AuthPage.tsx`

---

### DEF-002

- **Date:** 2026-03-31
- **Area:** Local dev — Docker build
- **Severity:** Medium
- **Status:** Resolved
- **Summary:** Docker build for frontend took 10+ minutes on every run
- **Root Cause:** No `frontend/.dockerignore` file existed. Docker was copying the entire `node_modules` directory (300 MB+) into the build context on every `docker-compose up --build`, causing a massive context transfer before the first `RUN` instruction.
- **Resolution:** Created `frontend/.dockerignore` excluding `node_modules`, `dist`, `.git`, and `*.log`.
- **Verification:** Subsequent builds completed in under 60 seconds.
- **Prevention Notes:** Any service with a `node_modules` directory adjacent to its `Dockerfile` must have a `.dockerignore` that excludes `node_modules`. This is especially critical in monorepos where the Docker context is a large directory.
- **Related Files:** `frontend/.dockerignore`, `docker-compose.yml`

---

### DEF-003

- **Date:** 2026-03-31
- **Area:** Local dev — API
- **Severity:** High
- **Status:** Resolved
- **Summary:** All API calls from local dev returned network errors (connection refused)
- **Root Cause:** `docker-compose.yml` had `VITE_API_URL=http://localhost:3001` hardcoded. No local Express server was running on port 3001. The backend is AWS Lambda — there is no local API server by default.
- **Resolution:** Changed `docker-compose.yml` to read `VITE_API_URL=${VITE_API_URL}` from the host environment, and added `VITE_API_URL=https://dg0bm7enlc.execute-api.us-east-1.amazonaws.com` to `.env`.
- **Verification:** API calls from the local frontend reached the production Lambda functions successfully.
- **Prevention Notes:** Never hardcode `localhost` API URLs in Docker Compose for a project whose backend is a cloud service. Use env var passthrough so the URL is configurable without changing the Compose file.
- **Related Files:** `docker-compose.yml`, `.env`

---

### DEF-004

- **Date:** 2026-03-31
- **Area:** E2E tests — Playwright
- **Severity:** Medium
- **Status:** Resolved
- **Summary:** Playwright `waitForURL` callback crashed — `url.includes is not a function`
- **Root Cause:** `page.waitForURL(url => !url.includes("/auth"))` — the callback receives a `URL` object, not a string. The `URL` object does not have an `.includes()` method; calling it throws a TypeError that Playwright silently turns into a timeout.
- **Resolution:** Replaced predicate with a RegExp: `page.waitForURL(/\/(dashboard|find|onboard|tutor)/)`.
- **Verification:** Sign-in test completed without timeout; URL assertion passed correctly.
- **Prevention Notes:** Always pass a RegExp or string to `page.waitForURL`. If using a callback, access the URL string via `url.href` or `url.pathname` — never call string methods directly on the `URL` object.
- **Related Files:** `e2e-test.mjs`

---

### DEF-005

- **Date:** 2026-03-31
- **Area:** E2E tests — Playwright
- **Severity:** Low
- **Status:** Resolved
- **Summary:** Playwright couldn't find the sign-out button by text selector
- **Root Cause:** The sign-out button in `Layout.tsx` uses `title="Sign out"` with a `<LogOut>` SVG icon and no visible text. Selectors like `text("Sign out")` and `button:has-text("Log out")` found nothing.
- **Resolution:** Changed selector to `page.locator('button[title="Sign out"]')`.
- **Verification:** Sign-out test clicked the button successfully and redirected to `/auth`.
- **Prevention Notes:** When a button has no visible text (icon-only), always add a `title` or `aria-label` attribute and use that in selectors. Document icon-only interactive elements in the defect log for future test authors.
- **Related Files:** `e2e-test.mjs`, `frontend/src/components/shared/Layout.tsx`

---

### DEF-006

- **Date:** 2026-03-31
- **Area:** E2E tests — Playwright
- **Severity:** Low
- **Status:** Resolved
- **Summary:** Error div selector `[class*="error"]` found no elements
- **Root Cause:** `AuthPage.tsx` renders auth errors in a `<div>` styled with Tailwind utility classes (`bg-red-50 border border-red-200`), not a class name containing "error". The selector `[class*="error"]` matched nothing.
- **Resolution:** Changed selector to `div.bg-red-50`.
- **Verification:** Invalid-credentials test detected the error div and correctly classified the sign-in as failed.
- **Prevention Notes:** For Tailwind-based projects, selectors should target Tailwind classes or use `data-testid` attributes. Avoid class name substring selectors that assume BEM or semantic class naming.
- **Related Files:** `e2e-test.mjs`, `frontend/src/pages/AuthPage.tsx`

---

### DEF-007

- **Date:** 2026-03-31
- **Area:** Seed script — DynamoDB
- **Severity:** Medium
- **Status:** Resolved
- **Summary:** Seed script failed with `ValidationException: Type mismatch for Index Key schoolDomain Expected: S Actual: NULL`
- **Root Cause:** The super admin user was created with `schoolDomain: null` in DynamoDB. The `SchoolDomainIndex` GSI on `peertutor-users` requires `schoolDomain` to be a String — a null value violates the index key type constraint.
- **Resolution:** Changed the super admin record to use `schoolDomain: "peertutor.app"` instead of `null`. Also updated the Cognito `createCognitoUser` call to pass `"peertutor.app"` instead of `null`.
- **Verification:** Seed script completed successfully — 95 users, 125 slots, 120 sessions created.
- **Prevention Notes:** DynamoDB GSI hash or range keys cannot be null. Any attribute used as a GSI key must always be a non-null String (or Number/Binary per the key type). Use a sentinel value like `"none"` or the platform domain for records that don't belong to a school.
- **Related Files:** `seed-testbed.mjs`

---

### DEF-008

- **Date:** 2026-03-31
- **Area:** CI — npm audit
- **Severity:** High
- **Status:** Resolved
- **Summary:** CI `Scan: Dependencies` job failed — high-severity CVEs in frontend and Lambda
- **Root Cause (frontend):** `picomatch ≤2.3.1` had a high-severity ReDoS vulnerability (GHSA-3v7f-55p6-f55p / GHSA-c2c7-rcm5-vvqj).
- **Root Cause (Lambda):** `path-to-regexp` had high-severity ReDoS vulnerabilities (GHSA-j3q9-mxjg-w52f / GHSA-27v5-c462-wpq7).
- **Resolution:** Ran `npm audit fix` in both `frontend/` and `backend/lambdas/`. Updated `picomatch` and `path-to-regexp` to patched versions.
- **Verification:** `npm audit --audit-level=high` exits with code 0 in both directories.
- **Prevention Notes:** Run `npm audit fix` in all package directories before pushing if dependencies have been updated. The remaining moderate CVEs (esbuild/vite chain, nodemailer) require `--force` major version bumps and are accepted exceptions — do not auto-fix them without a test cycle.
- **Related Files:** `frontend/package-lock.json`, `backend/lambdas/package-lock.json`

---

### DEF-009

- **Date:** 2026-03-31
- **Area:** Backend API — DynamoDB field mapping
- **Severity:** High
- **Status:** Resolved
- **Summary:** Adding, editing, and deleting availability slots appeared to do nothing after submission; booking requests could not be accepted/declined; sessions could not be cancelled or rated; audit log entries had no usable ID.
- **Root Cause:** Every "list" handler returned raw DynamoDB `Items` directly via `json({ ... result.Items ... })`. DynamoDB stores each entity using a named primary key attribute (`slotId`, `sessionId`, `requestId`, `reviewId`, `timestampLogId`), but the frontend TypeScript types all expect a generic `id` field. Because no mapping existed, every `item.id` in the frontend was `undefined`. Operations that used `id` for API calls (delete, update, accept/decline, cancel, flag) silently called routes like `DELETE /availability/undefined`, which either 404'd or matched the wrong item.
- **Resolution:** Added a `.map((item) => ({ ...item, id: item.<keyField> }))` transform in every affected GET handler before returning the response. The DynamoDB key attribute is preserved alongside the new `id` field for backward compatibility.
- **Affected Handlers (all fixed):**
  - `availability-crud.ts` → `getTutorSlots`: `slotId` → `id`
  - `get-my-sessions.ts` → `getMySessions`: `sessionId` → `id`
  - `get-my-booking-requests.ts` → `getMyBookingRequests`: `requestId` → `id`
  - `get-tutor-reviews.ts` → `getTutorReviews`: `reviewId` → `id`
  - `get-school-reviews.ts` → `getSchoolReviews`: `reviewId` → `id`
  - `get-audit-log.ts` → `getAuditLog`: `timestampLogId` → `id`
- **Verification:** End-to-end API test via crafted JWT confirmed `slot.id === slot.slotId` after fix. Full unit test suite (105 tests) green. New handler tests added for all six affected endpoints.
- **Prevention Notes:** When adding a new DynamoDB table, ensure the primary key attribute name matches the frontend type's `id` field, OR add an explicit mapping transform in the GET handler. A lint rule or shared `mapId(keyField)` helper function should be added to prevent regression. Alternatively, standardise all DynamoDB primary key attribute names to `id` across the schema.
- **Related Files:** `backend/lambdas/src/handlers/bookings/get-my-sessions.ts`, `get-my-booking-requests.ts`, `reviews/get-tutor-reviews.ts`, `reviews/get-school-reviews.ts`, `schools/availability-crud.ts`, `schools/get-audit-log.ts`, and their corresponding `*.test.ts` files.

---

### DEF-010

- **Date:** 2026-04-01
- **Area:** Infrastructure — API Gateway route coverage
- **Severity:** High
- **Status:** Resolved
- **Summary:** `tutor1.lincoln@lincoln.edu` received "Failed to add slot" on the Tutor Dashboard. Audit revealed six further routes silently 404'd for all users.
- **Root Cause:** Six Lambda handler routes had no matching entry in the AWS API Gateway v2 Terraform configuration (`infra/terraform/api-gateway.tf`). API Gateway returned `{"message":"Not Found"}` before the Lambda was ever invoked — the Lambda router never saw the request, so no application-level error was generated.
  - `POST /availability/{proxy+}` — entirely absent → Add Slot always failed (original bug)
  - `DELETE /availability/{proxy+}` — entirely absent → Delete Slot silently 404'd
  - `PATCH /availability/{proxy+}` — entirely absent → Edit Slot silently 404'd
  - `GET /schools/{domain}` (exact param route) — did not cover sub-paths; `GET /schools/{domain}/tutors` (tutor search) was unreachable
  - `GET /stats/{proxy+}` — was wired to the `misc` Lambda; that Lambda has no stats handler, so it returned 404 from the Lambda router
  - `GET /audit-log/{proxy+}` — same as stats: routed to wrong Lambda
- **Resolution:**
  - Replaced `GET /schools/{domain}` with `GET /schools/{proxy+}` to cover all school sub-paths
  - Added `POST /availability/{proxy+}`, `DELETE /availability/{proxy+}`, `PATCH /availability/{proxy+}`
  - Added `GET /stats/{proxy+}` and `GET /audit-log/{proxy+}` under the `schools` handler (where the implementations live)
  - Removed the two stale `misc` handler entries for stats and audit-log
- **Verification:** All 133 unit tests pass (including 28 new API Gateway coverage tests). Confirmed via `npx vitest run` in `backend/lambdas/`.
- **Prevention Notes:** Added `backend/lambdas/src/handlers/api-gateway-coverage.test.ts` — a Vitest suite that dynamically parses every Lambda handler route and every Terraform API Gateway route, then asserts full coverage using all three API Gateway v2 matching rules (exact, `{proxy+}`, `{param}`). CI will now fail if any Lambda route is added without a corresponding gateway entry.
- **Related Files:** `infra/terraform/api-gateway.tf`, `backend/lambdas/src/handlers/api-gateway-coverage.test.ts`
- **Branch:** `claude/loving-borg`

---

## Accepted Constraints

### AC-001

- **Date:** 2026-03-31
- **Area:** Security — Token revocation
- **Summary:** Cognito ID tokens remain valid for up to 1 hour after `GlobalSignOut`
- **Reason:** AWS Cognito does not support immediate ID token revocation. Only refresh tokens are revoked by `GlobalSignOut`. Existing ID tokens are valid until natural expiry.
- **Mitigation:** Short token lifetime (1 hour). Suspended users are checked in the Lambda `getAuth` helper on sensitive operations.
- **Accepted Because:** This is a platform constraint, not a bug. Reducing token lifetime below 1 hour would require significant UX changes (frequent re-auth prompts).

### AC-002

- **Date:** 2026-03-31
- **Area:** Dependencies — Moderate CVEs
- **Summary:** `esbuild ≤0.24.2`, `vite ≤6.1.6`, `nodemailer <8.0.4` have moderate CVEs
- **Reason:** Fixing requires `--force` upgrades (esbuild@0.27, vite@8, nodemailer@8) which introduce breaking changes requiring a full test cycle.
- **Mitigation:** These are dev-time tools (esbuild, vite) or SMTP wrappers with specific SMTP configurations. They are not directly exploitable in the current deployment model.
- **Accepted Because:** Risk is low; remediation cost is high. Tracked here for future upgrade planning.
