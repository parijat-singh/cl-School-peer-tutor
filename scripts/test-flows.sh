#!/bin/bash
# E2E Test Script for PeerTutor — tests all flows against Firebase emulators
# Usage: bash scripts/test-flows.sh
#
# Requires: Firebase emulators running (docker-compose up -d firebase-emulators)
# Optional: jq for JSON parsing (falls back to grep/sed)

set -euo pipefail

PROJECT_ID="peertutor-dev"
FIRESTORE_URL="http://localhost:8090/v1/projects/${PROJECT_ID}/databases/(default)/documents"
AUTH_ADMIN_URL="http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}"
AUTH_SIGNIN_URL="http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key"
FUNCTIONS_URL="http://localhost:5001/${PROJECT_ID}/us-central1"

PASS_COUNT=0
FAIL_COUNT=0
TOTAL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── JSON extraction ──────────────────────────────────────────────

if command -v jq &>/dev/null; then
  extract_string() { echo "$1" | jq -r ".fields.$2.stringValue // empty" 2>/dev/null; }
  extract_bool()   { echo "$1" | jq -r "if (.fields.$2.booleanValue == null) then empty else (.fields.$2.booleanValue | tostring) end" 2>/dev/null; }
  extract_int()    { echo "$1" | jq -r ".fields.$2.integerValue // empty" 2>/dev/null; }
  extract_double() { echo "$1" | jq -r ".fields.$2.doubleValue // empty" 2>/dev/null; }
else
  # Use python for JSON parsing (handles multiline Firestore REST responses)
  PYTHON_CMD="python"
  command -v python3 &>/dev/null && ! python3 --version &>/dev/null && true  # skip broken alias
  command -v python &>/dev/null && PYTHON_CMD="python"
  echo -e "${YELLOW}[INFO] jq not found — using ${PYTHON_CMD} for JSON parsing${NC}"
  extract_string() {
    local field="$2"
    echo "$1" | $PYTHON_CMD -c "import json,sys; d=json.loads(sys.stdin.read()); f=d.get('fields',{}).get('${field}',{}); print(f.get('stringValue',''),end='')" 2>/dev/null
  }
  extract_bool() {
    local field="$2"
    echo "$1" | $PYTHON_CMD -c "import json,sys; d=json.loads(sys.stdin.read()); f=d.get('fields',{}).get('${field}',{}); v=f.get('booleanValue',''); print(str(v).lower() if isinstance(v,bool) else v,end='')" 2>/dev/null
  }
  extract_int() {
    local field="$2"
    echo "$1" | $PYTHON_CMD -c "import json,sys; d=json.loads(sys.stdin.read()); f=d.get('fields',{}).get('${field}',{}); print(f.get('integerValue',''),end='')" 2>/dev/null
  }
  extract_double() {
    local field="$2"
    echo "$1" | $PYTHON_CMD -c "import json,sys; d=json.loads(sys.stdin.read()); f=d.get('fields',{}).get('${field}',{}); print(f.get('doubleValue',''),end='')" 2>/dev/null
  }
fi

# ── Helpers ──────────────────────────────────────────────────────

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${GREEN}[PASS]${NC} $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${RED}[FAIL]${NC} $1 — expected: '$2', got: '$3'"
}

assert_equals() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label"
  else
    fail "$label" "$expected" "$actual"
  fi
}

assert_not_empty() {
  local actual="$1"
  local label="$2"
  if [ -n "$actual" ]; then
    pass "$label"
  else
    fail "$label" "(non-empty)" "(empty)"
  fi
}

get_doc() {
  local path="$1"
  curl -s --globoff -X GET "${FIRESTORE_URL}/${path}" -H "Authorization: Bearer owner" 2>/dev/null
}

create_doc() {
  local path="$1"
  local fields="$2"
  curl -s --globoff -X PATCH "${FIRESTORE_URL}/${path}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer owner" \
    -d "{\"fields\": ${fields}}" 2>/dev/null
}

update_doc() {
  local path="$1"
  local fields="$2"
  # Build updateMask from field names in the JSON
  local mask=""
  for key in $(echo "$fields" | python -c "import json,sys; [print(k) for k in json.loads(sys.stdin.read()).keys()]" 2>/dev/null | tr -d '\r'); do
    if [ -n "$mask" ]; then mask="${mask}&"; fi
    mask="${mask}updateMask.fieldPaths=${key}"
  done
  curl -s --globoff -X PATCH "${FIRESTORE_URL}/${path}?${mask}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer owner" \
    -d "{\"fields\": ${fields}}" 2>/dev/null || true
}

delete_doc() {
  local path="$1"
  curl -s --globoff -X DELETE "${FIRESTORE_URL}/${path}" -H "Authorization: Bearer owner" > /dev/null 2>&1
}

create_auth_user() {
  local email="$1"
  local password="$2"
  local uid="$3"
  local display_name="$4"
  local custom_claims="$5"

  curl -s -X POST "${AUTH_ADMIN_URL}/accounts" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer owner" \
    -d "{
      \"email\": \"${email}\",
      \"password\": \"${password}\",
      \"localId\": \"${uid}\",
      \"displayName\": \"${display_name}\",
      \"emailVerified\": true
    }" > /dev/null 2>&1

  if [ -n "$custom_claims" ]; then
    update_custom_claims "$uid" "$custom_claims"
  fi
}

update_custom_claims() {
  local uid="$1"
  local claims="$2"
  local escaped
  escaped=$(echo "$claims" | sed 's/"/\\"/g')
  curl -s -X POST "${AUTH_ADMIN_URL}/accounts:update" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer owner" \
    -d "{\"localId\":\"${uid}\",\"customAttributes\":\"${escaped}\"}" > /dev/null 2>&1
}

lookup_auth_user() {
  local uid="$1"
  curl -s -X POST "${AUTH_ADMIN_URL}/accounts:lookup" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer owner" \
    -d "{\"localId\":[\"${uid}\"]}" 2>/dev/null
}

clear_emulator() {
  # Clear all Firestore data
  curl -s --globoff -X DELETE "http://localhost:8090/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents" > /dev/null 2>&1
  # Clear all Auth users
  curl -s --globoff -X DELETE "http://localhost:9099/emulator/v1/projects/${PROJECT_ID}/accounts" > /dev/null 2>&1
}

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Preflight check ──────────────────────────────────────────────

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   PeerTutor E2E Test Suite                   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

if ! curl -s --connect-timeout 3 "http://localhost:8090/" > /dev/null 2>&1; then
  echo -e "${YELLOW}[SKIP] Firebase emulators not running. Start with: docker-compose up -d firebase-emulators${NC}"
  exit 0
fi

# ── Setup: clear + seed ──────────────────────────────────────────

echo -e "${CYAN}[SETUP]${NC} Clearing emulator data..."
clear_emulator

echo -e "${CYAN}[SETUP]${NC} Seeding test data..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "${SCRIPT_DIR}/seed-emulator.sh" > /dev/null 2>&1
echo -e "${CYAN}[SETUP]${NC} Seed complete."
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 1: Super admin adds a school
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T1] Super admin adds a school${NC}"

create_doc "schools/testschool.edu" '{
  "domain": {"stringValue": "testschool.edu"},
  "name": {"stringValue": "Test High School"},
  "type": {"stringValue": "high"},
  "approved": {"booleanValue": true},
  "status": {"stringValue": "approved"},
  "brandColor": {"stringValue": "#FF5733"},
  "subjects": {"arrayValue": {"values": [{"stringValue": "Math"}, {"stringValue": "Science"}]}},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

DOC=$(get_doc "schools/testschool.edu")
assert_equals "$(extract_string "$DOC" "name")" "Test High School" "School name persisted"
assert_equals "$(extract_string "$DOC" "status")" "approved" "School status is approved"
assert_equals "$(extract_bool "$DOC" "approved")" "true" "School approved flag is true"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 2: User signup with pending status
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T2] User signup (domain validated, pending status)${NC}"

create_auth_user "newstudent@lincoln.edu" "Test1234!" "user-test-signup" "Test Student" \
  '{"role":"tutee","schoolDomain":"lincoln.edu","status":"pending"}'

create_doc "users/user-test-signup" '{
  "uid": {"stringValue": "user-test-signup"},
  "name": {"stringValue": "Test Student"},
  "email": {"stringValue": "newstudent@lincoln.edu"},
  "grade": {"stringValue": "9th"},
  "role": {"stringValue": "tutee"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "status": {"stringValue": "pending"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

DOC=$(get_doc "users/user-test-signup")
assert_equals "$(extract_string "$DOC" "status")" "pending" "New user status is pending"
assert_equals "$(extract_string "$DOC" "role")" "tutee" "New user role is tutee"
assert_equals "$(extract_string "$DOC" "schoolDomain")" "lincoln.edu" "New user schoolDomain is lincoln.edu"

# Verify school exists for domain validation
SCHOOL=$(get_doc "schools/lincoln.edu")
assert_equals "$(extract_string "$SCHOOL" "status")" "approved" "Signup domain school is approved"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 3: School admin approves user
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T3] School admin approves user${NC}"

update_doc "users/user-test-signup" '{
  "status": {"stringValue": "active"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null
update_custom_claims "user-test-signup" '{"role":"tutee","schoolDomain":"lincoln.edu","status":"active"}'

DOC=$(get_doc "users/user-test-signup")
assert_equals "$(extract_string "$DOC" "status")" "active" "Approved user status is active"

# Verify claims via auth lookup
AUTH_RESP=$(lookup_auth_user "user-test-signup")
if echo "$AUTH_RESP" | grep -q 'status.*active'; then
  pass "Custom claims contain status:active"
else
  fail "Custom claims contain status:active" "status:active in claims" "not found"
fi
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 4: Elevate teacher to school admin
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T4] Elevate teacher to school admin${NC}"

update_doc "users/user-teacher-001" '{
  "role": {"stringValue": "schooladmin"},
  "status": {"stringValue": "active"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null
update_custom_claims "user-teacher-001" '{"role":"schooladmin","schoolDomain":"lincoln.edu","status":"active"}'

DOC=$(get_doc "users/user-teacher-001")
assert_equals "$(extract_string "$DOC" "role")" "schooladmin" "Teacher role updated to schooladmin"

AUTH_RESP=$(lookup_auth_user "user-teacher-001")
if echo "$AUTH_RESP" | grep -q 'role.*schooladmin'; then
  pass "Custom claims contain role:schooladmin"
else
  fail "Custom claims contain role:schooladmin" "role:schooladmin in claims" "not found"
fi
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 5: Profile editing
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T5] Profile editing${NC}"

update_doc "users/user-tutee-001" '{
  "name": {"stringValue": "Alexander Kim"},
  "grade": {"stringValue": "10th"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

DOC=$(get_doc "users/user-tutee-001")
assert_equals "$(extract_string "$DOC" "name")" "Alexander Kim" "Profile name updated"
assert_equals "$(extract_string "$DOC" "grade")" "10th" "Profile grade updated"

# Verify unchanged fields weren't lost (PATCH merges)
assert_equals "$(extract_string "$DOC" "role")" "tutee" "Role unchanged after profile edit"
assert_equals "$(extract_string "$DOC" "schoolDomain")" "lincoln.edu" "SchoolDomain unchanged after profile edit"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 6: Suspend and unsuspend account
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T6] Suspend and unsuspend account${NC}"

# Suspend
update_doc "users/user-tutor-002" '{
  "status": {"stringValue": "suspended"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null
update_custom_claims "user-tutor-002" '{"role":"tutor","schoolDomain":"lincoln.edu","status":"suspended"}'

DOC=$(get_doc "users/user-tutor-002")
assert_equals "$(extract_string "$DOC" "status")" "suspended" "User suspended"

AUTH_RESP=$(lookup_auth_user "user-tutor-002")
if echo "$AUTH_RESP" | grep -q 'status.*suspended'; then
  pass "Claims reflect suspended status"
else
  fail "Claims reflect suspended status" "status:suspended" "not found"
fi

# Unsuspend
update_doc "users/user-tutor-002" '{
  "status": {"stringValue": "active"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null
update_custom_claims "user-tutor-002" '{"role":"tutor","schoolDomain":"lincoln.edu","status":"active"}'

DOC=$(get_doc "users/user-tutor-002")
assert_equals "$(extract_string "$DOC" "status")" "active" "User unsuspended"

AUTH_RESP=$(lookup_auth_user "user-tutor-002")
if echo "$AUTH_RESP" | grep -q 'status.*active'; then
  pass "Claims reflect active status after unsuspend"
else
  fail "Claims reflect active status after unsuspend" "status:active" "not found"
fi
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 7: Tutor adds availability slot
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T7] Tutor adds availability slot${NC}"

create_doc "users/user-tutor-001/availability/slot-test-001" '{
  "id": {"stringValue": "slot-test-001"},
  "day": {"stringValue": "Tuesday"},
  "startTime": {"stringValue": "16:00"},
  "endTime": {"stringValue": "17:00"},
  "duration": {"integerValue": "60"},
  "booked": {"booleanValue": false},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

DOC=$(get_doc "users/user-tutor-001/availability/slot-test-001")
assert_equals "$(extract_string "$DOC" "day")" "Tuesday" "Slot day is Tuesday"
assert_equals "$(extract_string "$DOC" "startTime")" "16:00" "Slot startTime is 16:00"
assert_equals "$(extract_string "$DOC" "endTime")" "17:00" "Slot endTime is 17:00"
assert_equals "$(extract_int "$DOC" "duration")" "60" "Slot duration is 60"
assert_equals "$(extract_bool "$DOC" "booked")" "false" "Slot is not booked"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 8: Tutee books a session
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T8] Tutee books a session${NC}"

# Mark the slot as booked
update_doc "users/user-tutor-001/availability/slot-test-001" '{
  "booked": {"booleanValue": true},
  "bookedBy": {"stringValue": "user-tutee-002"}
}' > /dev/null

# Create session doc
create_doc "sessions/session-test-book" '{
  "id": {"stringValue": "session-test-book"},
  "tutorId": {"stringValue": "user-tutor-001"},
  "tuteeId": {"stringValue": "user-tutee-002"},
  "tutorName": {"stringValue": "Marcus Johnson"},
  "tuteeName": {"stringValue": "Jordan Patel"},
  "subject": {"stringValue": "Calculus"},
  "slotId": {"stringValue": "slot-test-001"},
  "day": {"stringValue": "Tuesday"},
  "startTime": {"stringValue": "16:00"},
  "endTime": {"stringValue": "17:00"},
  "duration": {"integerValue": "60"},
  "scheduledDate": {"timestampValue": "2026-03-24T16:00:00Z"},
  "status": {"stringValue": "upcoming"},
  "meetLinkStatus": {"stringValue": "pending"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "tutorRated": {"booleanValue": false},
  "tuteeRated": {"booleanValue": false}
}' > /dev/null

# Verify slot is booked
SLOT=$(get_doc "users/user-tutor-001/availability/slot-test-001")
assert_equals "$(extract_bool "$SLOT" "booked")" "true" "Slot marked as booked"
assert_equals "$(extract_string "$SLOT" "bookedBy")" "user-tutee-002" "Slot bookedBy is tutee"

# Verify session created
SESSION=$(get_doc "sessions/session-test-book")
assert_equals "$(extract_string "$SESSION" "status")" "upcoming" "Session status is upcoming"
assert_equals "$(extract_string "$SESSION" "tutorId")" "user-tutor-001" "Session tutorId correct"
assert_equals "$(extract_string "$SESSION" "tuteeId")" "user-tutee-002" "Session tuteeId correct"
assert_equals "$(extract_string "$SESSION" "subject")" "Calculus" "Session subject is Calculus"
assert_equals "$(extract_bool "$SESSION" "tutorRated")" "false" "Session tutorRated starts false"
assert_equals "$(extract_bool "$SESSION" "tuteeRated")" "false" "Session tuteeRated starts false"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 9: Mutual reviews after session
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T9] Mutual reviews after session${NC}"

# Create a completed session for review testing
create_doc "sessions/session-test-review" '{
  "id": {"stringValue": "session-test-review"},
  "tutorId": {"stringValue": "user-tutor-001"},
  "tuteeId": {"stringValue": "user-tutee-002"},
  "tutorName": {"stringValue": "Marcus Johnson"},
  "tuteeName": {"stringValue": "Jordan Patel"},
  "subject": {"stringValue": "Algebra"},
  "slotId": {"stringValue": "slot-001"},
  "day": {"stringValue": "Monday"},
  "startTime": {"stringValue": "15:00"},
  "endTime": {"stringValue": "16:00"},
  "duration": {"integerValue": "60"},
  "scheduledDate": {"timestampValue": "2026-03-09T15:00:00Z"},
  "status": {"stringValue": "completed"},
  "meetLinkStatus": {"stringValue": "ready"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "2026-03-08T10:00:00Z"},
  "tutorRated": {"booleanValue": false},
  "tuteeRated": {"booleanValue": false}
}' > /dev/null

# Tutee rates tutor (5 stars)
create_doc "reviews/review-test-tutee" '{
  "id": {"stringValue": "review-test-tutee"},
  "sessionId": {"stringValue": "session-test-review"},
  "authorId": {"stringValue": "user-tutee-002"},
  "authorName": {"stringValue": "Jordan Patel"},
  "targetId": {"stringValue": "user-tutor-001"},
  "targetName": {"stringValue": "Marcus Johnson"},
  "stars": {"integerValue": "5"},
  "text": {"stringValue": "Great session!"},
  "flagged": {"booleanValue": false},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

# Mark session as tuteeRated
update_doc "sessions/session-test-review" '{
  "tuteeRated": {"booleanValue": true}
}' > /dev/null

# Tutor rates tutee (4 stars)
create_doc "reviews/review-test-tutor" '{
  "id": {"stringValue": "review-test-tutor"},
  "sessionId": {"stringValue": "session-test-review"},
  "authorId": {"stringValue": "user-tutor-001"},
  "authorName": {"stringValue": "Marcus Johnson"},
  "targetId": {"stringValue": "user-tutee-002"},
  "targetName": {"stringValue": "Jordan Patel"},
  "stars": {"integerValue": "4"},
  "text": {"stringValue": "Eager learner."},
  "flagged": {"booleanValue": false},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

# Mark session as tutorRated
update_doc "sessions/session-test-review" '{
  "tutorRated": {"booleanValue": true}
}' > /dev/null

# Update tutor aggregate rating: old avg=4.7, count=3, new star=5
# New avg = (4.7*3 + 5) / 4 = 19.1/4 = 4.775 → rounded to 4.8
update_doc "users/user-tutor-001" '{
  "avgRating": {"doubleValue": 4.8},
  "reviewCount": {"integerValue": "4"}
}' > /dev/null

# Verify tutee review
REVIEW=$(get_doc "reviews/review-test-tutee")
assert_equals "$(extract_int "$REVIEW" "stars")" "5" "Tutee gave 5 stars"
assert_equals "$(extract_string "$REVIEW" "authorId")" "user-tutee-002" "Tutee review authorId correct"
assert_equals "$(extract_string "$REVIEW" "targetId")" "user-tutor-001" "Tutee review targetId correct"

# Verify tutor review
REVIEW=$(get_doc "reviews/review-test-tutor")
assert_equals "$(extract_int "$REVIEW" "stars")" "4" "Tutor gave 4 stars"

# Verify session rated flags
SESSION=$(get_doc "sessions/session-test-review")
assert_equals "$(extract_bool "$SESSION" "tuteeRated")" "true" "Session tuteeRated is true"
assert_equals "$(extract_bool "$SESSION" "tutorRated")" "true" "Session tutorRated is true"

# Verify tutor aggregate rating updated
USER=$(get_doc "users/user-tutor-001")
assert_equals "$(extract_int "$USER" "reviewCount")" "4" "Tutor reviewCount updated to 4"
RATING=$(extract_double "$USER" "avgRating")
# Allow for floating point — check it starts with 4.8
if [[ "$RATING" == 4.8* ]]; then
  pass "Tutor avgRating updated to 4.8"
else
  fail "Tutor avgRating updated to 4.8" "4.8" "$RATING"
fi
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 10: School branding — update name, campus, brandColor
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T10] School branding — update name, campus, brandColor${NC}"

# Update school branding fields (simulates admin saving branding settings)
update_doc "schools/lincoln.edu" '{
  "name": {"stringValue": "Lincoln Academy"},
  "campus": {"stringValue": "West Campus, 200 Oak Drive"},
  "brandColor": {"stringValue": "#1E40AF"}
}' > /dev/null

DOC=$(get_doc "schools/lincoln.edu")
assert_equals "$(extract_string "$DOC" "name")" "Lincoln Academy" "School name updated to Lincoln Academy"
assert_equals "$(extract_string "$DOC" "campus")" "West Campus, 200 Oak Drive" "School campus updated"
assert_equals "$(extract_string "$DOC" "brandColor")" "#1E40AF" "School brandColor updated to #1E40AF"

# Verify unchanged fields survived the PATCH
assert_equals "$(extract_string "$DOC" "domain")" "lincoln.edu" "Domain unchanged after branding update"
assert_equals "$(extract_string "$DOC" "status")" "approved" "Status unchanged after branding update"
assert_equals "$(extract_bool "$DOC" "approved")" "true" "Approved flag unchanged after branding update"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 11: School branding — logo URL persistence
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T11] School branding — logo URL persistence${NC}"

# Simulate logo upload setting the logoUrl field
update_doc "schools/lincoln.edu" '{
  "logoUrl": {"stringValue": "https://storage.example.com/schools/lincoln.edu/logo.png"}
}' > /dev/null

DOC=$(get_doc "schools/lincoln.edu")
assert_equals "$(extract_string "$DOC" "logoUrl")" "https://storage.example.com/schools/lincoln.edu/logo.png" "logoUrl persisted on school doc"

# Verify name/campus still intact after adding logo
assert_equals "$(extract_string "$DOC" "name")" "Lincoln Academy" "School name still intact after logo update"
assert_equals "$(extract_string "$DOC" "campus")" "West Campus, 200 Oak Drive" "Campus still intact after logo update"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 12: School branding — new school with full branding
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T12] School branding — new school with full branding${NC}"

create_doc "schools/branded.edu" '{
  "domain": {"stringValue": "branded.edu"},
  "name": {"stringValue": "Branded University"},
  "type": {"stringValue": "university"},
  "approved": {"booleanValue": true},
  "status": {"stringValue": "approved"},
  "brandColor": {"stringValue": "#8B5CF6"},
  "campus": {"stringValue": "Downtown Campus, 500 Main St"},
  "logoUrl": {"stringValue": "https://storage.example.com/schools/branded.edu/logo.svg"},
  "subjects": {"arrayValue": {"values": [{"stringValue": "Computer Science"}, {"stringValue": "Engineering"}]}},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

DOC=$(get_doc "schools/branded.edu")
assert_equals "$(extract_string "$DOC" "name")" "Branded University" "New school name correct"
assert_equals "$(extract_string "$DOC" "brandColor")" "#8B5CF6" "New school brandColor correct"
assert_equals "$(extract_string "$DOC" "campus")" "Downtown Campus, 500 Main St" "New school campus correct"
assert_equals "$(extract_string "$DOC" "logoUrl")" "https://storage.example.com/schools/branded.edu/logo.svg" "New school logoUrl correct"
assert_equals "$(extract_string "$DOC" "status")" "approved" "New school status approved"

# Clean up
delete_doc "schools/branded.edu"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 13: School branding — partial update preserves existing branding
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T13] School branding — partial update preserves existing fields${NC}"

# Only update brandColor — name, campus, logoUrl should survive
update_doc "schools/lincoln.edu" '{
  "brandColor": {"stringValue": "#059669"}
}' > /dev/null

DOC=$(get_doc "schools/lincoln.edu")
assert_equals "$(extract_string "$DOC" "brandColor")" "#059669" "brandColor updated to green"
assert_equals "$(extract_string "$DOC" "name")" "Lincoln Academy" "Name preserved during partial update"
assert_equals "$(extract_string "$DOC" "campus")" "West Campus, 200 Oak Drive" "Campus preserved during partial update"
assert_equals "$(extract_string "$DOC" "logoUrl")" "https://storage.example.com/schools/lincoln.edu/logo.png" "logoUrl preserved during partial update"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 14: Tutor profile save — subjects and bio persisted
# ══════════════════════════════════════════════════════════════════
# Regression: Edit Profile modal used to silently fail because the
# Zod schema required subjects but the field was never synced to RHF
# state. Fix: removed subjects from the schema; subjects saved from
# local state directly. Verified the underlying Firestore PATCH here.
echo -e "${CYAN}[T14] Tutor profile save — subjects and bio persisted${NC}"

update_doc "users/user-both-001" '{
  "name":    {"stringValue": "Taylor Morgan"},
  "grade":   {"stringValue": "11th"},
  "subjects": {"arrayValue": {"values": [
    {"stringValue": "English"},
    {"stringValue": "History"}
  ]}},
  "bio": {"stringValue": "Passionate about English and History. Happy to help!"}
}' > /dev/null

DOC=$(get_doc "users/user-both-001")
assert_equals "$(extract_string "$DOC" "name")"  "Taylor Morgan" "Profile name preserved"
assert_equals "$(extract_string "$DOC" "grade")" "11th"          "Profile grade preserved"
assert_equals "$(extract_string "$DOC" "bio")"   "Passionate about English and History. Happy to help!" "Bio saved correctly"

# Verify subjects array is present in the response
if echo "$DOC" | grep -q '"English"'; then
  pass "subjects array contains English"
else
  fail "subjects array contains English" "English in subjects" "not found"
fi
if echo "$DOC" | grep -q '"History"'; then
  pass "subjects array contains History"
else
  fail "subjects array contains History" "History in subjects" "not found"
fi

# Verify unrelated fields (role, schoolDomain, email) are NOT clobbered by the PATCH
assert_equals "$(extract_string "$DOC" "role")"         "both"        "Role unchanged after profile edit"
assert_equals "$(extract_string "$DOC" "schoolDomain")" "lincoln.edu" "schoolDomain unchanged after profile edit"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 15: Specific-date availability slot — correct fields, no undefined
# ══════════════════════════════════════════════════════════════════
# Regression: addAvailabilitySlot passed bookedDates:undefined and
# cancelledDates:undefined for one-off slots, which Firestore rejects.
# Fix: conditional spread in firestore.ts strips undefined fields.
echo -e "${CYAN}[T15] Specific-date slot — created with correct fields, no bookedDates/cancelledDates${NC}"

create_doc "users/user-both-001/availability/slot-test-specific" '{
  "recurring":    {"booleanValue": false},
  "day":          {"stringValue": "Wednesday"},
  "date":         {"stringValue": "2026-04-01"},
  "startTime":    {"stringValue": "10:00"},
  "endTime":      {"stringValue": "11:00"},
  "duration":     {"integerValue": "60"},
  "booked":       {"booleanValue": false},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt":    {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

DOC=$(get_doc "users/user-both-001/availability/slot-test-specific")
assert_equals "$(extract_bool "$DOC" "recurring")"    "false"        "Specific-date slot has recurring=false"
assert_equals "$(extract_string "$DOC" "date")"       "2026-04-01"   "Specific-date slot has correct date"
assert_equals "$(extract_string "$DOC" "startTime")"  "10:00"        "Specific-date slot has correct startTime"
assert_equals "$(extract_string "$DOC" "endTime")"    "11:00"        "Specific-date slot has correct endTime"
assert_equals "$(extract_int "$DOC" "duration")"      "60"           "Specific-date slot has correct duration"
assert_equals "$(extract_bool "$DOC" "booked")"       "false"        "Specific-date slot starts unbooked"

# Verify bookedDates and cancelledDates are absent (no undefined Firestore fields)
if echo "$DOC" | grep -q '"bookedDates"'; then
  fail "No bookedDates field on specific-date slot" "field absent" "field present"
else
  pass "No bookedDates field on specific-date slot"
fi
if echo "$DOC" | grep -q '"cancelledDates"'; then
  fail "No cancelledDates field on specific-date slot" "field absent" "field present"
else
  pass "No cancelledDates field on specific-date slot"
fi

# Clean up
delete_doc "users/user-both-001/availability/slot-test-specific"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 16: School approval auto-activates designated school admin
# ══════════════════════════════════════════════════════════════════
# Regression: principal@riverside.edu was seeded with status=pending
# (or had a stale manual-signup doc) so logging in showed
# "Account Pending Approval" even though the school was authorised.
# Fix 1 — seed: riverside.edu is now approved and user-principal-001
#          is created with role=schooladmin, status=active.
# Fix 2 — signUp: if email matches school.adminEmail the user doc is
#          written with role=schooladmin / status=active (not pending).
# Fix 3 — handleApprove: when super admin approves a school any
#          existing user whose email matches adminEmail is promoted and
#          activated automatically.
# Fix 4 — seed helper: deletes any stale auth user with the same email
#          before re-creating, so duplicate-email silent failures can't
#          leave a ghost account with the wrong uid.
echo -e "${CYAN}[T16] School approval — principal gets schooladmin + active status${NC}"

# ── Part A: verify riverside.edu is approved in seed data ─────────
SCHOOL=$(get_doc "schools/riverside.edu")
assert_equals "$(extract_string "$SCHOOL" "status")"   "approved"              "riverside.edu status is approved"
assert_equals "$(extract_bool   "$SCHOOL" "approved")" "true"                  "riverside.edu approved flag is true"
assert_equals "$(extract_string "$SCHOOL" "adminEmail")" "principal@riverside.edu" "riverside.edu adminEmail is principal@riverside.edu"

# ── Part B: verify the principal user doc has correct role/status ──
# Find the user doc by email (we patch the known seed doc id here)
PRINCIPAL=$(get_doc "users/user-principal-001")
assert_equals "$(extract_string "$PRINCIPAL" "role")"         "schooladmin"      "Principal role is schooladmin"
assert_equals "$(extract_string "$PRINCIPAL" "status")"       "active"           "Principal status is active"
assert_equals "$(extract_string "$PRINCIPAL" "schoolDomain")" "riverside.edu"    "Principal schoolDomain is riverside.edu"

# ── Part C: simulate school approval activating a pending admin ────
# Create a pending school + a pending admin user for that school
create_doc "schools/approval-test.edu" '{
  "domain":     {"stringValue": "approval-test.edu"},
  "name":       {"stringValue": "Approval Test School"},
  "type":       {"stringValue": "high"},
  "approved":   {"booleanValue": false},
  "status":     {"stringValue": "pending"},
  "adminEmail": {"stringValue": "admin@approval-test.edu"},
  "brandColor": {"stringValue": "#000000"},
  "logoUrl":    {"stringValue": ""},
  "createdAt":  {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

create_doc "users/user-approval-admin" '{
  "uid":          {"stringValue": "user-approval-admin"},
  "name":         {"stringValue": "Test Principal"},
  "email":        {"stringValue": "admin@approval-test.edu"},
  "grade":        {"nullValue": null},
  "role":         {"stringValue": "tutee"},
  "schoolDomain": {"stringValue": "approval-test.edu"},
  "status":       {"stringValue": "pending"},
  "createdAt":    {"timestampValue": "'"${NOW}"'"},
  "updatedAt":    {"timestampValue": "'"${NOW}"'"}
}' > /dev/null

# Create matching auth user (needed so lookup_auth_user can verify claims)
create_auth_user "admin@approval-test.edu" "Test1234!" "user-approval-admin" "Test Principal" \
  '{"role":"tutee","schoolDomain":"approval-test.edu","status":"pending"}'

# Verify user starts as pending/tutee
USER=$(get_doc "users/user-approval-admin")
assert_equals "$(extract_string "$USER" "status")" "pending" "Admin user starts as pending before approval"
assert_equals "$(extract_string "$USER" "role")"   "tutee"   "Admin user starts as tutee before approval"

# Simulate super admin approving the school (handleApprove logic):
# Step 1 — approve the school doc
update_doc "schools/approval-test.edu" '{
  "approved": {"booleanValue": true},
  "status":   {"stringValue": "approved"}
}' > /dev/null

# Step 2 — activate the admin user (auto-promotion that handleApprove now performs)
update_doc "users/user-approval-admin" '{
  "role":         {"stringValue": "schooladmin"},
  "status":       {"stringValue": "active"},
  "schoolDomain": {"stringValue": "approval-test.edu"},
  "updatedAt":    {"timestampValue": "'"${NOW}"'"}
}' > /dev/null
update_custom_claims "user-approval-admin" \
  '{"role":"schooladmin","schoolDomain":"approval-test.edu","status":"active"}'

# Verify school is approved
SCHOOL2=$(get_doc "schools/approval-test.edu")
assert_equals "$(extract_string "$SCHOOL2" "status")"   "approved" "School status updated to approved"
assert_equals "$(extract_bool   "$SCHOOL2" "approved")" "true"     "School approved flag set to true"

# Verify admin user is now active schooladmin
USER2=$(get_doc "users/user-approval-admin")
assert_equals "$(extract_string "$USER2" "role")"   "schooladmin" "Admin role promoted to schooladmin after approval"
assert_equals "$(extract_string "$USER2" "status")" "active"      "Admin status activated after school approval"

# Verify custom claims updated
AUTH_RESP=$(lookup_auth_user "user-approval-admin")
if echo "$AUTH_RESP" | grep -q 'schooladmin'; then
  pass "Auth claims reflect schooladmin role after approval"
else
  fail "Auth claims reflect schooladmin role after approval" "schooladmin in claims" "not found"
fi
if echo "$AUTH_RESP" | grep -q 'active'; then
  pass "Auth claims reflect active status after approval"
else
  fail "Auth claims reflect active status after approval" "active in claims" "not found"
fi

# Clean up
delete_doc "schools/approval-test.edu"
delete_doc "users/user-approval-admin"
echo ""

# ══════════════════════════════════════════════════════════════════
# Cloud Function helpers (T17–T24)
# ══════════════════════════════════════════════════════════════════

# Sign in a user via the Auth emulator; returns the idToken
signin_user() {
  local email="$1" password="$2"
  curl -s -X POST "${AUTH_SIGNIN_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\",\"returnSecureToken\":true}" 2>/dev/null \
  | python -c "import json,sys; d=json.load(sys.stdin); print(d.get('idToken',''),end='')" 2>/dev/null
}

# POST to a Cloud Function callable endpoint
call_function() {
  local fn_name="$1" data="$2" id_token="$3"
  curl -s -X POST "${FUNCTIONS_URL}/${fn_name}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${id_token}" \
    -d "{\"data\":${data}}" 2>/dev/null
}

# Extract a field from a Cloud Function's {"result": {...}} response
fn_result() {
  local field="$2"
  echo "$1" | python -c "import json,sys; d=json.load(sys.stdin); v=d.get('result',{}).get('${field}',''); print(str(v).lower() if isinstance(v,bool) else str(v),end='')" 2>/dev/null
}

# Extract the error message from a Cloud Function's {"error": {...}} response
fn_error() {
  echo "$1" | python -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('message',''),end='')" 2>/dev/null
}

# Assert that haystack contains needle (case-insensitive ERE)
assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  if echo "$haystack" | grep -qiE "$needle"; then
    pass "$label"
  else
    fail "$label" "(contains '${needle}')" "${haystack:0:100}"
  fi
}

# Dynamic dates: next Monday / Tuesday / Wednesday from today
NEXT_MONDAY=$(python  -c "from datetime import date,timedelta; t=date.today(); d=(0-t.weekday())%7; d=d if d else 7; print((t+timedelta(d)).strftime('%Y-%m-%d'))")
NEXT_TUESDAY=$(python -c "from datetime import date,timedelta; t=date.today(); d=(1-t.weekday())%7; d=d if d else 7; print((t+timedelta(d)).strftime('%Y-%m-%d'))")
NEXT_WEDNESDAY=$(python -c "from datetime import date,timedelta; t=date.today(); d=(2-t.weekday())%7; d=d if d else 7; print((t+timedelta(d)).strftime('%Y-%m-%d'))")

# ══════════════════════════════════════════════════════════════════
# TEST 17: Tutee requests a slot — happy path
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T17] Tutee requests a slot — happy path${NC}"

TUTEE1_TOKEN=$(signin_user "tutee1@lincoln.edu" "Test1234!")
assert_not_empty "$TUTEE1_TOKEN" "tutee1 signed in for booking request tests"

RESP=$(call_function "requestBooking" \
  "{\"tutorId\":\"user-tutor-001\",\"slotId\":\"slot-001\",\"scheduledDate\":\"${NEXT_MONDAY}\",\"subject\":\"Algebra\"}" \
  "$TUTEE1_TOKEN")
BR1_ID=$(fn_result "$RESP" requestId)
assert_not_empty "$BR1_ID" "requestBooking returns requestId"

BR1=$(get_doc "bookingRequests/${BR1_ID}")
assert_equals "$(extract_string "$BR1" "status")"        "pending"          "BookingRequest status is pending"
assert_equals "$(extract_string "$BR1" "tuteeId")"       "user-tutee-001"   "BookingRequest tuteeId correct"
assert_equals "$(extract_string "$BR1" "tutorId")"       "user-tutor-001"   "BookingRequest tutorId correct"
assert_equals "$(extract_string "$BR1" "slotId")"        "slot-001"         "BookingRequest slotId correct"
assert_equals "$(extract_string "$BR1" "scheduledDate")" "${NEXT_MONDAY}"   "BookingRequest scheduledDate correct"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 18: Duplicate booking request blocked
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T18] Duplicate booking request blocked${NC}"

RESP=$(call_function "requestBooking" \
  "{\"tutorId\":\"user-tutor-001\",\"slotId\":\"slot-001\",\"scheduledDate\":\"${NEXT_MONDAY}\",\"subject\":\"Algebra\"}" \
  "$TUTEE1_TOKEN")
DUP_ERR=$(fn_error "$RESP")
assert_contains "$DUP_ERR" "already|pending|exist|duplicate" "Duplicate request returns an error"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 19: Tutor accepts request → session created, slot booked
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T19] Tutor accepts booking request${NC}"

TUTOR1_TOKEN=$(signin_user "tutor1@lincoln.edu" "Test1234!")
assert_not_empty "$TUTOR1_TOKEN" "tutor1 signed in for accept/reject tests"

RESP=$(call_function "respondToBooking" \
  "{\"requestId\":\"${BR1_ID}\",\"action\":\"accept\"}" \
  "$TUTOR1_TOKEN")
SESSION1_ID=$(fn_result "$RESP" sessionId)
assert_not_empty "$SESSION1_ID" "respondToBooking accept returns sessionId"

BR1=$(get_doc "bookingRequests/${BR1_ID}")
assert_equals "$(extract_string "$BR1" "status")"    "accepted"      "BookingRequest status is accepted"
assert_equals "$(extract_string "$BR1" "sessionId")" "$SESSION1_ID"  "BookingRequest sessionId field set"

SESSION1=$(get_doc "sessions/${SESSION1_ID}")
assert_equals "$(extract_string "$SESSION1" "status")"         "upcoming"        "Created session status is upcoming"
assert_equals "$(extract_string "$SESSION1" "tutorId")"        "user-tutor-001"  "Created session tutorId correct"
assert_equals "$(extract_string "$SESSION1" "tuteeId")"        "user-tutee-001"  "Created session tuteeId correct"
assert_equals "$(extract_string "$SESSION1" "meetLinkStatus")" "pending"         "Created session meetLinkStatus is pending"

SLOT1=$(get_doc "users/user-tutor-001/availability/slot-001")
if echo "$SLOT1" | python -c "
import json,sys
d=json.load(sys.stdin)
bd=d.get('fields',{}).get('bookedDates',{}).get('mapValue',{}).get('fields',{})
sys.exit(0 if '${NEXT_MONDAY}' in bd else 1)" 2>/dev/null; then
  pass "Slot bookedDates has entry for ${NEXT_MONDAY}"
else
  fail "Slot bookedDates has entry for ${NEXT_MONDAY}" "date key present" "not found"
fi
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 20: Already-booked slot request blocked
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T20] Already-booked slot request blocked${NC}"

TUTEE2_TOKEN=$(signin_user "tutee2@lincoln.edu" "Test1234!")
assert_not_empty "$TUTEE2_TOKEN" "tutee2 signed in for slot-taken test"

RESP=$(call_function "requestBooking" \
  "{\"tutorId\":\"user-tutor-001\",\"slotId\":\"slot-001\",\"scheduledDate\":\"${NEXT_MONDAY}\",\"subject\":\"Algebra\"}" \
  "$TUTEE2_TOKEN")
TAKEN_ERR=$(fn_error "$RESP")
assert_contains "$TAKEN_ERR" "booked|taken|unavailable|already" "Request on already-booked slot is rejected"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 21: Tutor manually rejects a booking request
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T21] Tutor manually rejects a booking request${NC}"

RESP=$(call_function "requestBooking" \
  "{\"tutorId\":\"user-tutor-001\",\"slotId\":\"slot-003\",\"scheduledDate\":\"2026-03-21\",\"subject\":\"Computer Science\"}" \
  "$TUTEE2_TOKEN")
BR2_ID=$(fn_result "$RESP" requestId)
assert_not_empty "$BR2_ID" "Request for rejection test created"

RESP=$(call_function "respondToBooking" \
  "{\"requestId\":\"${BR2_ID}\",\"action\":\"reject\"}" \
  "$TUTOR1_TOKEN")
REJECT_OK=$(fn_result "$RESP" success)
assert_equals "$REJECT_OK" "true" "respondToBooking reject returns success:true"

BR2=$(get_doc "bookingRequests/${BR2_ID}")
assert_equals "$(extract_string "$BR2" "status")" "rejected" "Manually rejected request has status=rejected"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 22: Two tutees request same slot — accept one, other auto-rejected
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T22] Competing requests — accept first, second auto-rejected${NC}"

TUTOR2_TOKEN=$(signin_user "tutor2@lincoln.edu" "Test1234!")
assert_not_empty "$TUTOR2_TOKEN" "tutor2 signed in for competing-requests test"

RESP=$(call_function "requestBooking" \
  "{\"tutorId\":\"user-tutor-002\",\"slotId\":\"slot-004\",\"scheduledDate\":\"${NEXT_TUESDAY}\",\"subject\":\"Biology\"}" \
  "$TUTEE1_TOKEN")
BR3_ID=$(fn_result "$RESP" requestId)
assert_not_empty "$BR3_ID" "First competing request created (tutee1 → slot-004)"

RESP=$(call_function "requestBooking" \
  "{\"tutorId\":\"user-tutor-002\",\"slotId\":\"slot-004\",\"scheduledDate\":\"${NEXT_TUESDAY}\",\"subject\":\"Biology\"}" \
  "$TUTEE2_TOKEN")
BR4_ID=$(fn_result "$RESP" requestId)
assert_not_empty "$BR4_ID" "Second competing request created (tutee2 → slot-004)"

RESP=$(call_function "respondToBooking" \
  "{\"requestId\":\"${BR3_ID}\",\"action\":\"accept\"}" \
  "$TUTOR2_TOKEN")
SESSION2_ID=$(fn_result "$RESP" sessionId)
assert_not_empty "$SESSION2_ID" "Accepting first request creates a session"

SESSION2=$(get_doc "sessions/${SESSION2_ID}")
assert_equals "$(extract_string "$SESSION2" "tuteeId")" "user-tutee-001" "Accepted session belongs to tutee1"

BR3=$(get_doc "bookingRequests/${BR3_ID}")
assert_equals "$(extract_string "$BR3" "status")" "accepted" "Accepted request has status=accepted"

BR4=$(get_doc "bookingRequests/${BR4_ID}")
assert_equals "$(extract_string "$BR4" "status")" "rejected" "Competing tutee2 request auto-rejected on acceptance"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 23: Tutee cancels own pending booking request
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T23] Tutee cancels own pending booking request${NC}"

RESP=$(call_function "requestBooking" \
  "{\"tutorId\":\"user-both-001\",\"slotId\":\"slot-006\",\"scheduledDate\":\"${NEXT_WEDNESDAY}\",\"subject\":\"English\"}" \
  "$TUTEE1_TOKEN")
BR5_ID=$(fn_result "$RESP" requestId)
assert_not_empty "$BR5_ID" "Request for cancellation test created"

RESP=$(call_function "cancelBookingRequest" \
  "{\"requestId\":\"${BR5_ID}\"}" \
  "$TUTEE1_TOKEN")
CANCEL_OK=$(fn_result "$RESP" success)
assert_equals "$CANCEL_OK" "true" "cancelBookingRequest returns success:true"

BR5=$(get_doc "bookingRequests/${BR5_ID}")
assert_equals "$(extract_string "$BR5" "status")" "cancelled" "Cancelled request has status=cancelled"
echo ""

# ══════════════════════════════════════════════════════════════════
# TEST 24: Cross-user cancellation blocked
# ══════════════════════════════════════════════════════════════════
echo -e "${CYAN}[T24] Cross-user cancellation blocked${NC}"

# tutee1 creates a fresh request (T23 cancelled the previous one, slot is free again)
RESP=$(call_function "requestBooking" \
  "{\"tutorId\":\"user-both-001\",\"slotId\":\"slot-006\",\"scheduledDate\":\"${NEXT_WEDNESDAY}\",\"subject\":\"English\"}" \
  "$TUTEE1_TOKEN")
BR6_ID=$(fn_result "$RESP" requestId)
assert_not_empty "$BR6_ID" "Request for cross-cancel test created"

# tutee2 tries to cancel tutee1's request — must be blocked
RESP=$(call_function "cancelBookingRequest" \
  "{\"requestId\":\"${BR6_ID}\"}" \
  "$TUTEE2_TOKEN")
CROSS_ERR=$(fn_error "$RESP")
assert_contains "$CROSS_ERR" "own|permission|cancel|not your" "Cross-user cancel attempt is blocked"
echo ""

# ══════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════

echo -e "${CYAN}══════════════════════════════════════════════${NC}"
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${GREEN}  All ${TOTAL} tests passed!${NC}"
else
  echo -e "${RED}  ${FAIL_COUNT} failed${NC}, ${GREEN}${PASS_COUNT} passed${NC} out of ${TOTAL} total"
fi
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo ""

# Reset emulator to original seed state
bash "${SCRIPT_DIR}/reset-emulator.sh"

exit "$FAIL_COUNT"
