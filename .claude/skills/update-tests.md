---
name: update-tests
description: Update and add to the automated E2E test script after code changes
user_invocable: true
---

# Update E2E Tests

When invoked, review recent code changes and update `scripts/test-flows.sh` to keep tests in sync.

## When to trigger

Run this skill after changes to any of:
- `frontend/src/pages/*.tsx` — page components with Firestore operations
- `frontend/src/lib/types.ts` — data model changes (field names, types)
- `frontend/src/lib/auth-context.tsx` — auth flow changes
- `frontend/src/components/shared/ProtectedRoute.tsx` — route guard changes
- `backend/firestore/firestore.rules` — security rule changes
- `backend/functions/src/**/*.ts` — Cloud Function changes
- `scripts/seed-emulator.sh` — test data structure changes

## Steps

1. **Read the current test script**: `scripts/test-flows.sh`
2. **Read changed files**: Identify what changed (new fields, renamed operations, new flows)
3. **Determine impact**: Map changes to existing test cases (T1-T9):
   - T1: Super admin adds school (`schools` collection)
   - T2: User signup (auth + `users` collection, status=pending)
   - T3: Admin approves user (status=active, custom claims)
   - T4: Elevate teacher to schooladmin (role + claims update)
   - T5: Profile editing (name/grade fields)
   - T6: Suspend + unsuspend (status transitions)
   - T7: Tutor adds availability (`availability` subcollection)
   - T8: Book session (slot.booked + `sessions` collection)
   - T9: Mutual reviews + rating aggregate (`reviews` collection)
4. **Update existing tests**: Modify assertions, field names, or API calls as needed
5. **Add new tests**: If a new flow was added, append a new test case following the existing pattern:
   ```bash
   # ── T10: <Description> ──────────────────────────────────────
   echo ""
   echo "T10: <Description>"
   # ... test logic using helper functions ...
   ```
6. **Run the tests**: Execute `bash scripts/test-flows.sh` to verify all tests pass
7. **Fix failures**: If any test fails, debug and fix until all pass

## Key references

- `scripts/seed-emulator.sh` — REST API patterns and helper functions
- `frontend/src/lib/types.ts` — Canonical field names and types
- Firebase emulator REST endpoints:
  - Firestore: `http://localhost:8080/v1/projects/peertutor-dev/databases/(default)/documents`
  - Auth: `http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/peertutor-dev`

## Test helper functions available

- `create_doc PATH JSON` — Create Firestore document
- `get_doc PATH` — Read Firestore document
- `update_doc PATH JSON` — Update Firestore document fields
- `delete_doc PATH` — Delete Firestore document
- `create_auth_user EMAIL PASSWORD DISPLAY_NAME` — Create auth user
- `update_custom_claims UID CLAIMS_JSON` — Set custom claims on auth user
- `lookup_auth_user EMAIL` — Get auth user by email
- `assert_equals LABEL EXPECTED ACTUAL` — Assert equality with pass/fail output
- `extract_string JSON FIELD` — Extract string field from Firestore JSON
- `extract_bool JSON FIELD` — Extract boolean field from Firestore JSON
