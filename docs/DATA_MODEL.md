# Data Model — PeerTutor

## Purpose

Document all DynamoDB tables, their key schema, global secondary indexes (GSIs), TTL fields, and canonical document shapes.

---

## Overview

| Table | Hash Key | Range Key | GSIs | TTL Field |
|-------|----------|-----------|------|-----------|
| `peertutor-users` | `uid` | — | `SchoolDomainIndex`, `EmailIndex` | — |
| `peertutor-availability-slots` | `tutorId` | `slotId` | `SchoolDomainIndex` | — |
| `peertutor-sessions` | `sessionId` | — | `TutorIndex`, `TuteeIndex`, `SchoolDomainIndex` | — |
| `peertutor-booking-requests` | `requestId` | — | `TutorIndex`, `TuteeIndex` | — |
| `peertutor-reviews` | `reviewId` | — | `TutorIndex`, `SchoolDomainIndex` | — |
| `peertutor-schools` | `domain` | — | — | — |
| `peertutor-stats` | `schoolDomain` | — | — | — |
| `peertutor-email-verifications` | `uid` | — | — | `expiresAt` |
| `peertutor-rate-limits` | `key` | — | — | `expiresAt` |
| `peertutor-admin-audit-log` | `schoolDomain` | `timestampLogId` | — | — |
| `peertutor-contact-submissions` | `submissionId` | — | — | `expiresAt` |

All tables use `PAY_PER_REQUEST` billing and have point-in-time recovery (PITR) enabled.

---

## Tables

### peertutor-users

Stores all user accounts regardless of role.

| Attribute | Type | Notes |
|-----------|------|-------|
| `uid` | String | PK — Cognito sub (UUID) |
| `name` | String | Display name |
| `email` | String | School email address |
| `role` | String | `tutor` \| `tutee` \| `both` \| `schooladmin` \| `teacher` \| `superadmin` |
| `schoolDomain` | String | e.g. `lincoln.edu`; `peertutor.app` for superadmin |
| `status` | String | `active` \| `pending` \| `suspended` |
| `grade` | String | e.g. `10th`; null for admins |
| `subjects` | List\<String\> | Tutors only |
| `bio` | String | Tutors only |
| `avgRating` | Number | Tutors only; maintained by TransactWrite |
| `reviewCount` | Number | Tutors only |
| `createdAt` | String | ISO 8601 |
| `updatedAt` | String | ISO 8601 |

**GSIs:**
- `SchoolDomainIndex` — hash: `schoolDomain`, range: `uid` — list all users in a school
- `EmailIndex` — hash: `email`, range: `uid` — look up user by email

---

### peertutor-availability-slots

Tutor-defined time slots that tutees can book into.

| Attribute | Type | Notes |
|-----------|------|-------|
| `tutorId` | String | PK — UID of tutor |
| `slotId` | String | SK — ULID |
| `schoolDomain` | String | Multi-tenancy key |
| `recurring` | Boolean | True = weekly recurrence on `day` |
| `day` | String | `Monday` … `Friday` (recurring slots) |
| `specificDate` | String | `YYYY-MM-DD` (one-off slots) |
| `startTime` | String | `HH:MM` (24h) |
| `endTime` | String | `HH:MM` (24h) |
| `duration` | Number | Minutes (30, 45, or 60) |
| `booked` | Boolean | True if the slot is currently booked (one-off or all occurrences locked) |
| `bookedBy` | String | UID of tutee who booked (if booked) |
| `bookedDates` | Map | `{ "YYYY-MM-DD": "tuteeUid" }` — per-date booking for recurring slots |
| `cancelledDates` | List\<String\> | `["YYYY-MM-DD"]` — tutor-cancelled occurrences |
| `subject` | String | Optional — subject associated with this slot |
| `createdAt` | String | ISO 8601 |

**GSI:**
- `SchoolDomainIndex` — hash: `schoolDomain`, range: `slotId` — list all slots in a school

---

### peertutor-sessions

Confirmed tutoring sessions (upcoming, completed, or cancelled).

| Attribute | Type | Notes |
|-----------|------|-------|
| `sessionId` | String | PK — ULID |
| `tutorId` | String | UID of tutor |
| `tuteeId` | String | UID of tutee |
| `tutorName` | String | Denormalised for display |
| `tuteeName` | String | Denormalised for display |
| `subject` | String | |
| `slotId` | String | Reference to availability slot |
| `day` | String | `Monday` … `Friday` |
| `startTime` | String | `HH:MM` |
| `endTime` | String | `HH:MM` |
| `duration` | Number | Minutes |
| `scheduledDate` | String | `YYYY-MM-DD` |
| `status` | String | `upcoming` \| `completed` \| `cancelled` |
| `meetLink` | String | Google Meet URL |
| `meetLinkStatus` | String | `ready` \| `pending` \| `failed` |
| `tutorRated` | Boolean | Whether tutor has submitted a rating |
| `tuteeRated` | Boolean | Whether tutee has submitted a rating |
| `schoolDomain` | String | |
| `createdAt` | String | ISO 8601 |

**GSIs:**
- `TutorIndex` — hash: `tutorId`, range: `sessionId`
- `TuteeIndex` — hash: `tuteeId`, range: `sessionId`
- `SchoolDomainIndex` — hash: `schoolDomain`, range: `sessionId`

---

### peertutor-booking-requests

Pending tutor-approval requests raised by tutees before a session is confirmed.

| Attribute | Type | Notes |
|-----------|------|-------|
| `requestId` | String | PK — ULID |
| `tutorId` | String | |
| `tuteeId` | String | |
| `slotId` | String | Requested slot |
| `requestedDate` | String | `YYYY-MM-DD` |
| `subject` | String | |
| `status` | String | `pending` \| `accepted` \| `rejected` \| `cancelled` |
| `schoolDomain` | String | |
| `createdAt` | String | ISO 8601 |
| `updatedAt` | String | ISO 8601 |

**GSIs:**
- `TutorIndex` — hash: `tutorId`, range: `requestId`
- `TuteeIndex` — hash: `tuteeId`, range: `requestId`

---

### peertutor-reviews

Post-session ratings submitted by tutors or tutees.

| Attribute | Type | Notes |
|-----------|------|-------|
| `reviewId` | String | PK — ULID |
| `sessionId` | String | Session being reviewed |
| `authorId` | String | UID of reviewer |
| `targetId` | String | UID of person being reviewed |
| `stars` | Number | 1–5 |
| `text` | String | Optional comment |
| `flagged` | Boolean | User-flagged for admin review |
| `deleted` | Boolean | Admin-soft-deleted |
| `schoolDomain` | String | |
| `createdAt` | String | ISO 8601 |

**GSIs:**
- `TutorIndex` — hash: `targetId`, range: `reviewId` — all reviews for a tutor
- `SchoolDomainIndex` — hash: `schoolDomain`, range: `reviewId`

---

### peertutor-schools

One record per school. Created at registration; active after superadmin approval.

| Attribute | Type | Notes |
|-----------|------|-------|
| `domain` | String | PK — e.g. `lincoln.edu` |
| `name` | String | Display name |
| `type` | String | `high` \| `k12` \| `university` |
| `approved` | Boolean | Set to true by superadmin |
| `status` | String | `active` \| `pending` \| `suspended` |
| `brandColor` | String | Hex colour code |
| `logoUrl` | String | S3 URL |
| `subjects` | List\<String\> | Subjects offered at this school |
| `campusAddress` | String | Optional |
| `contactEmail` | String | Optional |
| `createdAt` | String | ISO 8601 |
| `updatedAt` | String | ISO 8601 |

---

### peertutor-stats

Aggregated statistics per school, updated by scheduled Lambda.

| Attribute | Type | Notes |
|-----------|------|-------|
| `schoolDomain` | String | PK |
| `monthlySessions` | Number | Sessions completed in the current month |
| `totalSessions` | Number | All-time completed sessions |
| `activeTutors` | Number | Tutors with at least one upcoming session |
| `avgRating` | Number | School-wide average rating |
| `updatedAt` | String | ISO 8601 |

---

### peertutor-email-verifications

Short-lived OTP records for email verification at sign-up.

| Attribute | Type | Notes |
|-----------|------|-------|
| `uid` | String | PK — Cognito sub |
| `otp` | String | 6-digit code |
| `email` | String | |
| `expiresAt` | Number | Unix epoch — DynamoDB TTL (15 min) |
| `createdAt` | String | ISO 8601 |

---

### peertutor-rate-limits

Sliding-window counters for per-user rate limiting.

| Attribute | Type | Notes |
|-----------|------|-------|
| `key` | String | PK — e.g. `booking:uid:2026-03-31T19:05` |
| `count` | Number | Request count in the current window |
| `expiresAt` | Number | Unix epoch — DynamoDB TTL (1 min) |

---

### peertutor-admin-audit-log

Immutable record of all school admin actions. Admins can query but not delete entries.

| Attribute | Type | Notes |
|-----------|------|-------|
| `schoolDomain` | String | PK |
| `timestampLogId` | String | SK — `ISO8601#ULID` (ensures chronological sort) |
| `adminId` | String | UID of admin who took the action |
| `adminEmail` | String | Denormalised |
| `action` | String | e.g. `SUSPEND_USER`, `DELETE_REVIEW`, `APPROVE_SCHOOL` |
| `targetId` | String | UID or resource ID of the target |
| `details` | Map | Action-specific metadata |
| `createdAt` | String | ISO 8601 |

---

### peertutor-contact-submissions

Contact form entries from the public landing page.

| Attribute | Type | Notes |
|-----------|------|-------|
| `submissionId` | String | PK — ULID |
| `name` | String | |
| `email` | String | |
| `message` | String | |
| `expiresAt` | Number | Unix epoch — DynamoDB TTL (90 days) |
| `createdAt` | String | ISO 8601 |

---

## Naming Conventions

- All table names prefixed with `peertutor-`
- IDs use ULID (sortable, URL-safe) except `uid` which is the Cognito sub (UUID)
- Timestamps are ISO 8601 strings (never Firestore Timestamp or Unix epoch, except TTL fields which must be numeric Unix epoch)
- Boolean flags (`booked`, `flagged`, `deleted`, `tutorRated`, etc.) default to `false`

---

## Related Docs

- `ARCHITECTURE.md` — where these tables sit in the system
- `SECURITY_PRIVACY.md` — multi-tenancy enforcement and access patterns
