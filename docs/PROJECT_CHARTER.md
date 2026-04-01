# Project Charter — PeerTutor

## Purpose

Define the mission, user roles, core capabilities, and constraints for the PeerTutor school peer-tutoring platform.

---

## Problem Statement

Schools lack a structured, school-controlled platform that connects students who need academic help with student tutors within the same institution. Existing solutions are either generic (not school-scoped), lack trust mechanisms (no ratings, no admin oversight), or require students to leave the school ecosystem entirely.

---

## Solution

PeerTutor is a multi-tenant SaaS platform where each school operates its own isolated tutoring marketplace. Students self-register under their school's email domain, tutors post availability, tutees book sessions, and meetings happen via auto-generated Google Meet links. School administrators control branding, moderate reviews, and manage user suspensions.

---

## User Roles

| Role | Description |
|------|-------------|
| **tutee** | Student seeking academic help. Searches tutors, books sessions, rates tutors. |
| **tutor** | Student providing tutoring. Manages availability slots, accepts bookings, rates tutees. |
| **both** | Combined tutor + tutee. Has capabilities of both roles. |
| **teacher** | School teacher with read-only view of sessions. (Planned — minimal current implementation.) |
| **schooladmin** | School staff. Approves school setup, manages users, moderates reviews, views audit log, updates branding. |
| **superadmin** | Platform operator. Approves school registrations, promotes superadmins, views global activity. |

---

## Core Capabilities

### Session Management
- Tutors add recurring (weekly) or one-off availability slots
- Tutees book via direct booking or request-then-approve flow
- Atomic booking prevents double-booking (DynamoDB TransactWrite)
- Google Meet link auto-provisioned on booking confirmation
- Email confirmation with `.ics` calendar attachment

### Discovery
- Search tutors by subject within a school
- Filter by availability, rating, grade
- Optional AI-powered tutor recommendations (Anthropic Claude)

### Ratings & Reviews
- Bidirectional post-session ratings (1–5 stars + text)
- Tutor average rating updated atomically
- School admins can delete inappropriate reviews (logged in audit trail)

### School Administration
- School admin dashboard: user management, branding, review moderation, audit log
- School registration flow: submitted by admin → reviewed by superadmin
- Per-school branding: name, colour, logo

### Notifications
- Session reminders (24h and 15 min before)
- Rating request emails after session completion
- Booking confirmation and cancellation emails

---

## Constraints

| # | Constraint |
|---|-----------|
| C-01 | Strict school isolation — a user in `school-a.edu` cannot read or write data belonging to `school-b.edu`. Enforced at JWT + DynamoDB layer. |
| C-02 | No sensitive data (tokens, credentials) stored in `localStorage`. Tokens are in-memory only. |
| C-03 | All infrastructure is AWS (Cognito, DynamoDB, Lambda, S3, CloudFront). No Firebase runtime dependency. |
| C-04 | Backend is stateless (AWS Lambda). No persistent server-side sessions. |
| C-05 | Test coverage minimum 80% on statements, branches, functions, and lines for both frontend and Lambda code. |
| C-06 | All production secrets managed via GitHub Actions Environments + Terraform variables — never committed to source. |
| C-07 | Admin audit log is immutable. School admins can view but not delete or modify entries. |

---

## Out of Scope

- Payment processing (sessions are free, no marketplace fee)
- Video hosting (Google Meet handles the meeting)
- School LMS integration
- Mobile native app (mobile-responsive web only)
- Teacher-managed scheduling (teachers are observers only)

---

## Related Docs

- `PRODUCT_REQUIREMENTS.md` — detailed feature scope and phases
- `ARCHITECTURE.md` — system design
- `SECURITY_PRIVACY.md` — constraint implementation details
