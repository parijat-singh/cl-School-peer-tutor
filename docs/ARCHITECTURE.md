# Architecture — PeerTutor

## Purpose

Document the system design, AWS service boundaries, runtime model, and key architectural decisions for the PeerTutor platform.

---

## System Overview

PeerTutor is a multi-tenant web application where each school is a fully isolated tenant. The frontend is a React SPA delivered via CloudFront. The backend is a set of AWS Lambda functions fronted by API Gateway v2. Authentication is handled by AWS Cognito. Data is stored in DynamoDB.

```
Browser
  │
  ├── CloudFront + S3 (React SPA)
  │
  └── API Gateway v2 (HTTP API)
        │
        ├── JWT Authorizer (Cognito)
        │
        ├── Lambda: pt-auth
        ├── Lambda: pt-bookings
        ├── Lambda: pt-schools
        ├── Lambda: pt-reviews
        ├── Lambda: pt-misc
        └── Lambda: pt-scheduled  ← EventBridge (no API Gateway)
              │
              ├── DynamoDB (11 tables)
              ├── Cognito Admin API
              ├── SES / SMTP (email)
              ├── Google Calendar API (Meet links)
              ├── Anthropic API (AI recommendations)
              └── S3 (school logos)
```

---

## Services

### Frontend

| Property | Value |
|----------|-------|
| Framework | React 18.3 + Vite (ES modules) |
| Language | TypeScript 5.4 (strict) |
| Styling | TailwindCSS 3.4 |
| Routing | React Router v6 (lazy-loaded routes) |
| Auth SDK | AWS SDK v3 `@aws-sdk/client-cognito-identity-provider` |
| API client | Custom fetch wrapper (`src/lib/api.ts`) |
| Error tracking | Sentry |
| Testing | Vitest + React Testing Library (80% coverage gate) |
| Hosting | S3 + CloudFront (OAC, optional custom domain + ACM) |

### Backend (Lambda)

| Property | Value |
|----------|-------|
| Runtime | Node.js 22 |
| Language | TypeScript (compiled to JS via esbuild) |
| API surface | HTTP API (API Gateway v2) |
| Auth | JWT authorizer validates Cognito ID token on every request |
| DB client | AWS SDK v3 `@aws-sdk/lib-dynamodb` (DocumentClient) |
| Email | Nodemailer → SMTP (Outlook default) |
| Meet links | Google Calendar API (3-retry exponential backoff) |
| AI | Anthropic Claude API (tutor recommendations) |
| Error tracking | Sentry |
| Testing | Vitest + `aws-sdk-client-mock` (80% coverage gate) |

### Auth — AWS Cognito

| Property | Value |
|----------|-------|
| User Pool | `us-east-1_QUDvlqnZV` |
| Client | `54l8t1isgh15adc38k0d9clh4d` |
| Custom attributes | `custom:role`, `custom:schoolDomain`, `custom:status` |
| Token storage | ID + access tokens in memory; refresh token only in `localStorage` |
| Token lifetime | ID/access: 1 hour; refresh: 30 days |
| Validation | API Gateway JWT authorizer (signature + audience) |

### Database — DynamoDB

- 11 tables, all on-demand billing (`PAY_PER_REQUEST`)
- Point-in-time recovery (PITR) enabled on all tables
- Multi-tenancy enforced via `schoolDomain` GSI on every user-scoped table
- See `DATA_MODEL.md` for full schema

### Infrastructure as Code — Terraform

All AWS resources are managed in `infra/terraform/`. Key files:

| File | Manages |
|------|---------|
| `main.tf` | S3, CloudFront, OAC, root IAM |
| `cognito.tf` | User Pool, App Client |
| `dynamodb.tf` | All 11 DynamoDB tables |
| `lambda.tf` | 6 Lambda functions + IAM execution role |
| `api-gateway.tf` | HTTP API, JWT authorizer, routes |
| `eventbridge.tf` | Scheduled rules (15-min reminders, daily cleanup) |
| `s3-logos.tf` | School logo bucket |
| `acm.tf` | Optional ACM cert + Route53 validation |
| `waf.tf` | Optional CloudFront WAF (managed rules) |

---

## Lambda Handler Groups

| Lambda | Routes | Purpose |
|--------|--------|---------|
| `pt-auth` | `/auth/*`, `/users/*` | User initialization, OTP, suspend, role promotion |
| `pt-bookings` | `/bookings/*`, `/sessions/*`, `/booking-requests/*` | Book, request, respond, cancel sessions |
| `pt-schools` | `/schools/*`, `/stats/*`, `/audit-log/*` | School CRUD, tutor search, availability, admin actions |
| `pt-reviews` | `/reviews/*`, `/tutors/*/reviews` | Submit, flag, delete reviews |
| `pt-misc` | `/recommendations/*`, `/contact/*` | AI tutor recommendations, contact form |
| `pt-scheduled` | EventBridge only | Reminders, rating prompts, stats aggregation, cleanup |

Each Lambda is compiled to a single JS file by esbuild and deployed as a zip to S3, then updated via `aws lambda update-function-code`.

---

## Multi-Tenancy Model

School isolation is enforced at two independent layers:

1. **JWT layer** — every Cognito ID token contains `custom:schoolDomain`. The Lambda `getAuth(event)` helper extracts this claim and passes it to all DB operations. A token for `lincoln.edu` can never pass a `schoolDomain=jefferson.edu` check.

2. **DynamoDB layer** — all user-scoped tables have a `SchoolDomainIndex` GSI. Queries are always filtered by `schoolDomain`. A query that omits `schoolDomain` would return no results (not wrong results).

Superadmins bypass school-scoped queries only in designated superadmin endpoints (`/schools/approve`, `/users/superadmins`, etc.).

---

## Booking Atomicity

The `book-session` Lambda uses a DynamoDB `TransactWrite` that atomically:
1. Updates `availability-slots` — sets `booked: true`, `bookedBy: tuteeId`
2. Creates the `sessions` record

If either operation fails (e.g., slot already booked by concurrent request), the entire transaction is rolled back. This prevents double-booking without application-level locking.

---

## Google Meet Provisioning

On booking confirmation:
1. Lambda calls Google Calendar API to create an event with Meet conference
2. If the call fails, it retries up to 3 times with exponential backoff
3. Session is created regardless, with `meetLinkStatus: "pending"` if all retries fail
4. A background job can re-attempt failed Meet link provisioning

---

## Scheduled Tasks (EventBridge)

| Rule | Schedule | Handler |
|------|----------|---------|
| Session reminders | Every 15 min | `send-session-reminders.ts` |
| Rating prompts | Daily 9 AM UTC | `trigger-rating-prompts.ts` |
| Stats aggregation | Daily 3 AM UTC | `update-school-stats.ts` |
| Session cleanup | Daily 3 AM UTC | `purge-old-sessions.ts` |

---

## Local Development

Docker Compose runs three services locally:

| Service | Port | Purpose |
|---------|------|---------|
| `frontend` | 5173 | Vite dev server (React) |
| `dynamodb-local` | 8000 | Local DynamoDB (in-memory) |
| `nginx` | 80/443 | Reverse proxy |

The backend Lambdas can be run locally via `backend/lambdas/src/local-server.ts` — an Express server that mocks API Gateway routing and dispatches to the same handler functions.

See `SETUP.md` for full bootstrap instructions.

---

## Environment Strategy

| Environment | Branch | Cognito Pool | DynamoDB | CloudFront |
|-------------|--------|-------------|----------|------------|
| Production | `master` | Shared prod pool | Prod tables | prod distribution |
| Staging | `develop` | Separate pool (optional) | Staging tables | staging distribution |
| Local | N/A | Prod Cognito (auth only) | DynamoDB Local | None |

---

## Related Docs

- `DATA_MODEL.md` — DynamoDB table schemas and document shapes
- `SECURITY_PRIVACY.md` — token handling, multi-tenancy enforcement, audit
- `SETUP.md` — local dev bootstrap
- `CICD_OVERVIEW.md` — how code gets deployed
