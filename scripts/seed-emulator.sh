#!/bin/bash
# Seed Firebase Emulators with test data
# Usage: bash scripts/seed-emulator.sh

PROJECT_ID="peertutor-dev"
FIRESTORE_URL="http://localhost:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents"
AUTH_ADMIN_URL="http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}"
AUTH_EMULATOR_URL="http://localhost:9099"

echo "=== Seeding Firebase Emulators ==="

# Helper: create Firestore document (Bearer owner bypasses security rules)
create_doc() {
  local collection="$1"
  local doc_id="$2"
  local fields="$3"
  curl -s -X PATCH \
    "${FIRESTORE_URL}/${collection}/${doc_id}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer owner" \
    -d "{\"fields\": ${fields}}" > /dev/null
  echo "  Created ${collection}/${doc_id}"
}

# Helper: create subcollection document
create_subdoc() {
  local path="$1"
  local fields="$2"
  curl -s -X PATCH \
    "${FIRESTORE_URL}/${path}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer owner" \
    -d "{\"fields\": ${fields}}" > /dev/null
  echo "  Created ${path}"
}

# Helper: create Auth user via admin endpoint (bypasses blocking functions)
# Deletes any pre-existing auth user with the same email before creating,
# so re-seeding an already-used emulator always produces a clean state.
create_auth_user() {
  local email="$1"
  local password="$2"
  local uid="$3"
  local display_name="$4"
  local custom_claims="$5"

  # Look up any existing auth user with this email and delete them first
  local existing_uid
  existing_uid=$(curl -s -X POST \
    "${AUTH_ADMIN_URL}/accounts:lookup" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer owner" \
    -d "{\"email\": [\"${email}\"]}" \
    | python -c "import json,sys; d=json.load(sys.stdin); users=d.get('users',[]); print(users[0]['localId'] if users else '',end='')" 2>/dev/null)

  if [ -n "$existing_uid" ] && [ "$existing_uid" != "$uid" ]; then
    curl -s -X POST \
      "${AUTH_ADMIN_URL}/accounts:delete" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer owner" \
      -d "{\"localId\": \"${existing_uid}\"}" > /dev/null
    # Also clean up the stale Firestore user doc if it differs from our target uid
    curl -s -X DELETE \
      "${FIRESTORE_URL}/users/${existing_uid}" \
      -H "Authorization: Bearer owner" > /dev/null
  fi

  # Create user via admin endpoint with Bearer owner (bypasses blocking functions)
  curl -s -X POST \
    "${AUTH_ADMIN_URL}/accounts" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer owner" \
    -d "{
      \"email\": \"${email}\",
      \"password\": \"${password}\",
      \"localId\": \"${uid}\",
      \"displayName\": \"${display_name}\",
      \"emailVerified\": true
    }" > /dev/null

  # Set custom claims via accounts:update endpoint
  if [ -n "$custom_claims" ]; then
    local escaped_claims
    escaped_claims=$(echo "$custom_claims" | sed 's/"/\\"/g')
    curl -s -X POST \
      "${AUTH_ADMIN_URL}/accounts:update" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer owner" \
      -d "{\"localId\":\"${uid}\",\"customAttributes\":\"${escaped_claims}\"}" > /dev/null
  fi

  echo "  Created auth user: ${email} (uid: ${uid})"
}

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ─────────────────────────────────────────────
# 1. Create Schools
# ─────────────────────────────────────────────
echo ""
echo "--- Schools ---"
create_doc "schools" "lincoln.edu" '{
  "domain": {"stringValue": "lincoln.edu"},
  "name": {"stringValue": "Lincoln High School"},
  "type": {"stringValue": "high"},
  "approved": {"booleanValue": true},
  "status": {"stringValue": "approved"},
  "adminUid": {"stringValue": "user-admin-001"},
  "adminEmail": {"stringValue": "admin@lincoln.edu"},
  "brandColor": {"stringValue": "#1E3A5F"},
  "campus": {"stringValue": "Main Campus, 1600 Lincoln Ave"},
  "logoUrl": {"stringValue": ""},
  "subjects": {"arrayValue": {"values": [
    {"stringValue": "Algebra"},
    {"stringValue": "Geometry"},
    {"stringValue": "Pre-Calculus"},
    {"stringValue": "Calculus"},
    {"stringValue": "Biology"},
    {"stringValue": "Chemistry"},
    {"stringValue": "Physics"},
    {"stringValue": "English"},
    {"stringValue": "History"},
    {"stringValue": "Spanish"},
    {"stringValue": "Computer Science"}
  ]}},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}'

# Approved school — principal can log in immediately
create_doc "schools" "riverside.edu" '{
  "domain": {"stringValue": "riverside.edu"},
  "name": {"stringValue": "Riverside Middle School"},
  "type": {"stringValue": "middle"},
  "approved": {"booleanValue": true},
  "status": {"stringValue": "approved"},
  "adminUid": {"stringValue": "user-principal-001"},
  "adminEmail": {"stringValue": "principal@riverside.edu"},
  "brandColor": {"stringValue": "#2D8B4E"},
  "campus": {"stringValue": "Main Campus, 500 Riverside Dr"},
  "logoUrl": {"stringValue": ""},
  "subjects": {"arrayValue": {"values": [
    {"stringValue": "Algebra"},
    {"stringValue": "Biology"},
    {"stringValue": "English"},
    {"stringValue": "History"}
  ]}},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}'

# Pending school for super admin to approve/reject demo
create_doc "schools" "westview.edu" '{
  "domain": {"stringValue": "westview.edu"},
  "name": {"stringValue": "Westview High School"},
  "type": {"stringValue": "high"},
  "approved": {"booleanValue": false},
  "status": {"stringValue": "pending"},
  "adminEmail": {"stringValue": "admin@westview.edu"},
  "brandColor": {"stringValue": "#7C3AED"},
  "logoUrl": {"stringValue": ""},
  "subjects": {"arrayValue": {"values": [
    {"stringValue": "Algebra"},
    {"stringValue": "English"},
    {"stringValue": "Chemistry"}
  ]}},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}'

# ─────────────────────────────────────────────
# 2. Create Firestore User Docs FIRST (before auth users)
#    Auth blocking function reads these during user creation
# ─────────────────────────────────────────────
echo ""
echo "--- User Docs ---"

# Super Admin (you)
create_doc "users" "user-super-001" '{
  "uid": {"stringValue": "user-super-001"},
  "name": {"stringValue": "Parijat Singh"},
  "email": {"stringValue": "superadmin@peertutor.app"},
  "grade": {"nullValue": null},
  "role": {"stringValue": "superadmin"},
  "schoolDomain": {"nullValue": null},
  "status": {"stringValue": "active"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# School Admin
create_doc "users" "user-admin-001" '{
  "uid": {"stringValue": "user-admin-001"},
  "name": {"stringValue": "Sarah Chen"},
  "email": {"stringValue": "admin@lincoln.edu"},
  "grade": {"stringValue": "12th"},
  "role": {"stringValue": "schooladmin"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "status": {"stringValue": "active"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# Tutor 1 — Marcus (Math & CS)
create_doc "users" "user-tutor-001" '{
  "uid": {"stringValue": "user-tutor-001"},
  "name": {"stringValue": "Marcus Johnson"},
  "email": {"stringValue": "tutor1@lincoln.edu"},
  "grade": {"stringValue": "11th"},
  "role": {"stringValue": "tutor"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "status": {"stringValue": "active"},
  "subjects": {"arrayValue": {"values": [
    {"stringValue": "Algebra"},
    {"stringValue": "Calculus"},
    {"stringValue": "Computer Science"}
  ]}},
  "bio": {"stringValue": "AP Calculus BC student. Love helping others understand math concepts!"},
  "avgRating": {"doubleValue": 4.7},
  "reviewCount": {"integerValue": "3"},
  "isActive": {"booleanValue": true},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# Tutor 2 — Emily (Science)
create_doc "users" "user-tutor-002" '{
  "uid": {"stringValue": "user-tutor-002"},
  "name": {"stringValue": "Emily Rodriguez"},
  "email": {"stringValue": "tutor2@lincoln.edu"},
  "grade": {"stringValue": "12th"},
  "role": {"stringValue": "tutor"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "status": {"stringValue": "active"},
  "subjects": {"arrayValue": {"values": [
    {"stringValue": "Biology"},
    {"stringValue": "Chemistry"},
    {"stringValue": "Physics"}
  ]}},
  "bio": {"stringValue": "Future pre-med student. Science is my passion!"},
  "avgRating": {"doubleValue": 4.9},
  "reviewCount": {"integerValue": "2"},
  "isActive": {"booleanValue": true},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# Tutee 1 — Alex
create_doc "users" "user-tutee-001" '{
  "uid": {"stringValue": "user-tutee-001"},
  "name": {"stringValue": "Alex Kim"},
  "email": {"stringValue": "tutee1@lincoln.edu"},
  "grade": {"stringValue": "9th"},
  "role": {"stringValue": "tutee"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "status": {"stringValue": "active"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# Tutee 2 — Jordan
create_doc "users" "user-tutee-002" '{
  "uid": {"stringValue": "user-tutee-002"},
  "name": {"stringValue": "Jordan Patel"},
  "email": {"stringValue": "tutee2@lincoln.edu"},
  "grade": {"stringValue": "10th"},
  "role": {"stringValue": "tutee"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "status": {"stringValue": "active"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# Both (tutor + tutee) — Taylor
create_doc "users" "user-both-001" '{
  "uid": {"stringValue": "user-both-001"},
  "name": {"stringValue": "Taylor Morgan"},
  "email": {"stringValue": "both1@lincoln.edu"},
  "grade": {"stringValue": "11th"},
  "role": {"stringValue": "both"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "status": {"stringValue": "active"},
  "subjects": {"arrayValue": {"values": [
    {"stringValue": "English"},
    {"stringValue": "History"}
  ]}},
  "bio": {"stringValue": "English and History nerd. Also looking for help with Calculus."},
  "avgRating": {"doubleValue": 4.5},
  "reviewCount": {"integerValue": "1"},
  "isActive": {"booleanValue": true},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# Teacher — Ms. Davis
create_doc "users" "user-teacher-001" '{
  "uid": {"stringValue": "user-teacher-001"},
  "name": {"stringValue": "Ms. Rachel Davis"},
  "email": {"stringValue": "teacher@lincoln.edu"},
  "grade": {"nullValue": null},
  "role": {"stringValue": "teacher"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "status": {"stringValue": "active"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# School Admin — Riverside (principal)
create_doc "users" "user-principal-001" '{
  "uid": {"stringValue": "user-principal-001"},
  "name": {"stringValue": "Dr. James Rivera"},
  "email": {"stringValue": "principal@riverside.edu"},
  "grade": {"nullValue": null},
  "role": {"stringValue": "schooladmin"},
  "schoolDomain": {"stringValue": "riverside.edu"},
  "status": {"stringValue": "active"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# Riverside pending tutee — to demo the promote-to-admin flow
create_doc "users" "user-riverside-tutee-001" '{
  "uid": {"stringValue": "user-riverside-tutee-001"},
  "name": {"stringValue": "Maria Gomez"},
  "email": {"stringValue": "admin@riverside.edu"},
  "grade": {"stringValue": "8th"},
  "role": {"stringValue": "tutee"},
  "schoolDomain": {"stringValue": "riverside.edu"},
  "status": {"stringValue": "pending"},
  "subjects": {"arrayValue": {"values": []}},
  "bio": {"stringValue": ""},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# ─────────────────────────────────────────────
# 3. Create Auth Users (AFTER user docs so blocking function can read them)
#    Custom claims are set via emulator admin endpoint
# ─────────────────────────────────────────────
echo ""
echo "--- Auth Users ---"
create_auth_user "superadmin@peertutor.app" "Test1234!" "user-super-001" "Parijat Singh" \
  '{"role":"superadmin","schoolDomain":null,"status":"active"}'
create_auth_user "admin@lincoln.edu" "Test1234!" "user-admin-001" "Sarah Chen" \
  '{"role":"schooladmin","schoolDomain":"lincoln.edu","status":"active"}'
create_auth_user "tutor1@lincoln.edu" "Test1234!" "user-tutor-001" "Marcus Johnson" \
  '{"role":"tutor","schoolDomain":"lincoln.edu","status":"active"}'
create_auth_user "tutor2@lincoln.edu" "Test1234!" "user-tutor-002" "Emily Rodriguez" \
  '{"role":"tutor","schoolDomain":"lincoln.edu","status":"active"}'
create_auth_user "tutee1@lincoln.edu" "Test1234!" "user-tutee-001" "Alex Kim" \
  '{"role":"tutee","schoolDomain":"lincoln.edu","status":"active"}'
create_auth_user "tutee2@lincoln.edu" "Test1234!" "user-tutee-002" "Jordan Patel" \
  '{"role":"tutee","schoolDomain":"lincoln.edu","status":"active"}'
create_auth_user "both1@lincoln.edu" "Test1234!" "user-both-001" "Taylor Morgan" \
  '{"role":"both","schoolDomain":"lincoln.edu","status":"active"}'
create_auth_user "teacher@lincoln.edu" "Test1234!" "user-teacher-001" "Ms. Rachel Davis" \
  '{"role":"teacher","schoolDomain":"lincoln.edu","status":"active"}'
create_auth_user "principal@riverside.edu" "Test1234!" "user-principal-001" "Dr. James Rivera" \
  '{"role":"schooladmin","schoolDomain":"riverside.edu","status":"active"}'
create_auth_user "admin@riverside.edu" "Test1234!" "user-riverside-tutee-001" "Maria Gomez" \
  '{"role":"tutee","schoolDomain":"riverside.edu","status":"pending"}'

# ─────────────────────────────────────────────
# 4. Create Availability Slots
# ─────────────────────────────────────────────
echo ""
echo "--- Availability Slots ---"

# Marcus — 3 slots (2 recurring, 1 specific date)
create_subdoc "users/user-tutor-001/availability/slot-001" '{
  "id": {"stringValue": "slot-001"},
  "recurring": {"booleanValue": true},
  "day": {"stringValue": "Monday"},
  "startTime": {"stringValue": "15:00"},
  "endTime": {"stringValue": "16:00"},
  "duration": {"integerValue": "60"},
  "booked": {"booleanValue": false},
  "bookedDates": {"mapValue": {"fields": {}}},
  "cancelledDates": {"arrayValue": {"values": []}},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}'

create_subdoc "users/user-tutor-001/availability/slot-002" '{
  "id": {"stringValue": "slot-002"},
  "recurring": {"booleanValue": true},
  "day": {"stringValue": "Wednesday"},
  "startTime": {"stringValue": "15:00"},
  "endTime": {"stringValue": "15:45"},
  "duration": {"integerValue": "45"},
  "booked": {"booleanValue": false},
  "bookedDates": {"mapValue": {"fields": {"2026-03-18": {"stringValue": "user-tutee-001"}}}},
  "cancelledDates": {"arrayValue": {"values": []}},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}'

create_subdoc "users/user-tutor-001/availability/slot-003" '{
  "id": {"stringValue": "slot-003"},
  "recurring": {"booleanValue": false},
  "day": {"stringValue": "Friday"},
  "date": {"stringValue": "2026-03-21"},
  "startTime": {"stringValue": "14:00"},
  "endTime": {"stringValue": "14:30"},
  "duration": {"integerValue": "30"},
  "booked": {"booleanValue": false},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}'

# Emily — 2 slots (1 recurring, 1 specific date)
create_subdoc "users/user-tutor-002/availability/slot-004" '{
  "id": {"stringValue": "slot-004"},
  "recurring": {"booleanValue": true},
  "day": {"stringValue": "Tuesday"},
  "startTime": {"stringValue": "16:00"},
  "endTime": {"stringValue": "17:00"},
  "duration": {"integerValue": "60"},
  "booked": {"booleanValue": false},
  "bookedDates": {"mapValue": {"fields": {}}},
  "cancelledDates": {"arrayValue": {"values": []}},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}'

create_subdoc "users/user-tutor-002/availability/slot-005" '{
  "id": {"stringValue": "slot-005"},
  "recurring": {"booleanValue": false},
  "day": {"stringValue": "Thursday"},
  "date": {"stringValue": "2026-03-19"},
  "startTime": {"stringValue": "15:30"},
  "endTime": {"stringValue": "16:30"},
  "duration": {"integerValue": "60"},
  "booked": {"booleanValue": true},
  "bookedBy": {"stringValue": "user-tutee-002"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}'

# Taylor — 1 recurring slot
create_subdoc "users/user-both-001/availability/slot-006" '{
  "id": {"stringValue": "slot-006"},
  "recurring": {"booleanValue": true},
  "day": {"stringValue": "Wednesday"},
  "startTime": {"stringValue": "14:00"},
  "endTime": {"stringValue": "14:45"},
  "duration": {"integerValue": "45"},
  "booked": {"booleanValue": false},
  "bookedDates": {"mapValue": {"fields": {}}},
  "cancelledDates": {"arrayValue": {"values": []}},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"}
}'

# ─────────────────────────────────────────────
# 5. Create Sessions
# ─────────────────────────────────────────────
echo ""
echo "--- Sessions ---"

# Completed session: Marcus tutored Alex in Algebra
create_doc "sessions" "session-001" '{
  "id": {"stringValue": "session-001"},
  "tutorId": {"stringValue": "user-tutor-001"},
  "tuteeId": {"stringValue": "user-tutee-001"},
  "tutorName": {"stringValue": "Marcus Johnson"},
  "tuteeName": {"stringValue": "Alex Kim"},
  "subject": {"stringValue": "Algebra"},
  "slotId": {"stringValue": "slot-002"},
  "day": {"stringValue": "Wednesday"},
  "startTime": {"stringValue": "15:00"},
  "endTime": {"stringValue": "15:45"},
  "duration": {"integerValue": "45"},
  "scheduledDate": {"timestampValue": "2026-03-11T15:00:00Z"},
  "status": {"stringValue": "completed"},
  "meetLink": {"stringValue": "https://meet.google.com/abc-defg-hij"},
  "meetLinkStatus": {"stringValue": "ready"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "2026-03-09T10:00:00Z"},
  "tutorRated": {"booleanValue": true},
  "tuteeRated": {"booleanValue": true}
}'

# Upcoming session: Emily tutoring Jordan in Chemistry
create_doc "sessions" "session-002" '{
  "id": {"stringValue": "session-002"},
  "tutorId": {"stringValue": "user-tutor-002"},
  "tuteeId": {"stringValue": "user-tutee-002"},
  "tutorName": {"stringValue": "Emily Rodriguez"},
  "tuteeName": {"stringValue": "Jordan Patel"},
  "subject": {"stringValue": "Chemistry"},
  "slotId": {"stringValue": "slot-005"},
  "day": {"stringValue": "Thursday"},
  "startTime": {"stringValue": "15:30"},
  "endTime": {"stringValue": "16:30"},
  "duration": {"integerValue": "60"},
  "scheduledDate": {"timestampValue": "2026-03-19T15:30:00Z"},
  "status": {"stringValue": "upcoming"},
  "meetLink": {"stringValue": "https://meet.google.com/xyz-uvwx-yz"},
  "meetLinkStatus": {"stringValue": "ready"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "tutorRated": {"booleanValue": false},
  "tuteeRated": {"booleanValue": false}
}'

# Cancelled session: Marcus was going to tutor Jordan
create_doc "sessions" "session-003" '{
  "id": {"stringValue": "session-003"},
  "tutorId": {"stringValue": "user-tutor-001"},
  "tuteeId": {"stringValue": "user-tutee-002"},
  "tutorName": {"stringValue": "Marcus Johnson"},
  "tuteeName": {"stringValue": "Jordan Patel"},
  "subject": {"stringValue": "Computer Science"},
  "slotId": {"stringValue": "slot-003"},
  "day": {"stringValue": "Friday"},
  "startTime": {"stringValue": "14:00"},
  "endTime": {"stringValue": "14:30"},
  "duration": {"integerValue": "30"},
  "scheduledDate": {"timestampValue": "2026-03-07T14:00:00Z"},
  "status": {"stringValue": "cancelled"},
  "meetLinkStatus": {"stringValue": "pending"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "2026-03-05T09:00:00Z"},
  "cancelledAt": {"timestampValue": "2026-03-06T18:00:00Z"},
  "cancelledBy": {"stringValue": "user-tutee-002"},
  "cancelReason": {"stringValue": "Schedule conflict with soccer practice"},
  "tutorRated": {"booleanValue": false},
  "tuteeRated": {"booleanValue": false}
}'

# Completed session: Emily tutored Alex in Biology
create_doc "sessions" "session-004" '{
  "id": {"stringValue": "session-004"},
  "tutorId": {"stringValue": "user-tutor-002"},
  "tuteeId": {"stringValue": "user-tutee-001"},
  "tutorName": {"stringValue": "Emily Rodriguez"},
  "tuteeName": {"stringValue": "Alex Kim"},
  "subject": {"stringValue": "Biology"},
  "slotId": {"stringValue": "slot-004"},
  "day": {"stringValue": "Tuesday"},
  "startTime": {"stringValue": "16:00"},
  "endTime": {"stringValue": "17:00"},
  "duration": {"integerValue": "60"},
  "scheduledDate": {"timestampValue": "2026-03-10T16:00:00Z"},
  "status": {"stringValue": "completed"},
  "meetLink": {"stringValue": "https://meet.google.com/bio-logy-101"},
  "meetLinkStatus": {"stringValue": "ready"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "2026-03-08T11:00:00Z"},
  "tutorRated": {"booleanValue": true},
  "tuteeRated": {"booleanValue": false}
}'

# Upcoming session: Taylor tutoring Alex in English
create_doc "sessions" "session-005" '{
  "id": {"stringValue": "session-005"},
  "tutorId": {"stringValue": "user-both-001"},
  "tuteeId": {"stringValue": "user-tutee-001"},
  "tutorName": {"stringValue": "Taylor Morgan"},
  "tuteeName": {"stringValue": "Alex Kim"},
  "subject": {"stringValue": "English"},
  "slotId": {"stringValue": "slot-006"},
  "day": {"stringValue": "Wednesday"},
  "startTime": {"stringValue": "14:00"},
  "endTime": {"stringValue": "14:45"},
  "duration": {"integerValue": "45"},
  "scheduledDate": {"timestampValue": "2026-03-18T14:00:00Z"},
  "status": {"stringValue": "upcoming"},
  "meetLink": {"stringValue": "https://meet.google.com/eng-lish-202"},
  "meetLinkStatus": {"stringValue": "ready"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "'"${NOW}"'"},
  "tutorRated": {"booleanValue": false},
  "tuteeRated": {"booleanValue": false}
}'

# ─────────────────────────────────────────────
# 6. Create Reviews
# ─────────────────────────────────────────────
echo ""
echo "--- Reviews ---"

# Alex reviewed Marcus (session-001)
create_doc "reviews" "review-001" '{
  "id": {"stringValue": "review-001"},
  "sessionId": {"stringValue": "session-001"},
  "authorId": {"stringValue": "user-tutee-001"},
  "authorName": {"stringValue": "Alex Kim"},
  "targetId": {"stringValue": "user-tutor-001"},
  "targetName": {"stringValue": "Marcus Johnson"},
  "stars": {"integerValue": "5"},
  "text": {"stringValue": "Marcus explained quadratic equations so clearly! Finally understand them."},
  "flagged": {"booleanValue": false},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "2026-03-11T16:00:00Z"}
}'

# Marcus reviewed Alex (session-001)
create_doc "reviews" "review-002" '{
  "id": {"stringValue": "review-002"},
  "sessionId": {"stringValue": "session-001"},
  "authorId": {"stringValue": "user-tutor-001"},
  "authorName": {"stringValue": "Marcus Johnson"},
  "targetId": {"stringValue": "user-tutee-001"},
  "targetName": {"stringValue": "Alex Kim"},
  "stars": {"integerValue": "4"},
  "text": {"stringValue": "Great student, came prepared with specific questions."},
  "flagged": {"booleanValue": false},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "2026-03-11T16:05:00Z"}
}'

# Alex reviewed Emily (session-004)
create_doc "reviews" "review-003" '{
  "id": {"stringValue": "review-003"},
  "sessionId": {"stringValue": "session-004"},
  "authorId": {"stringValue": "user-tutee-001"},
  "authorName": {"stringValue": "Alex Kim"},
  "targetId": {"stringValue": "user-tutor-002"},
  "targetName": {"stringValue": "Emily Rodriguez"},
  "stars": {"integerValue": "5"},
  "text": {"stringValue": "Emily made cell biology so interesting. Best tutor ever!"},
  "flagged": {"booleanValue": false},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "2026-03-10T17:30:00Z"}
}'

# Jordan reviewed Marcus (from a past session)
create_doc "reviews" "review-004" '{
  "id": {"stringValue": "review-004"},
  "sessionId": {"stringValue": "session-past-001"},
  "authorId": {"stringValue": "user-tutee-002"},
  "authorName": {"stringValue": "Jordan Patel"},
  "targetId": {"stringValue": "user-tutor-001"},
  "targetName": {"stringValue": "Marcus Johnson"},
  "stars": {"integerValue": "4"},
  "text": {"stringValue": "Solid explanations, just a bit fast paced."},
  "flagged": {"booleanValue": false},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "2026-03-05T17:00:00Z"}
}'

# Flagged review for admin to see
create_doc "reviews" "review-005" '{
  "id": {"stringValue": "review-005"},
  "sessionId": {"stringValue": "session-past-002"},
  "authorId": {"stringValue": "user-tutee-002"},
  "authorName": {"stringValue": "Jordan Patel"},
  "targetId": {"stringValue": "user-both-001"},
  "targetName": {"stringValue": "Taylor Morgan"},
  "stars": {"integerValue": "2"},
  "text": {"stringValue": "Seemed distracted during the whole session."},
  "flagged": {"booleanValue": true},
  "flaggedBy": {"stringValue": "user-both-001"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "createdAt": {"timestampValue": "2026-03-04T16:00:00Z"}
}'

# ─────────────────────────────────────────────
# 7. Create Stats
# ─────────────────────────────────────────────
echo ""
echo "--- Stats ---"
create_doc "stats" "lincoln.edu" '{
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "totalUsers": {"integerValue": "6"},
  "activeTutors": {"integerValue": "3"},
  "sessionsThisMonth": {"integerValue": "2"},
  "totalSessions": {"integerValue": "4"},
  "avgRating": {"doubleValue": 4.7},
  "updatedAt": {"timestampValue": "'"${NOW}"'"}
}'

# ─────────────────────────────────────────────
# 8. Create Admin Audit Log entries
# ─────────────────────────────────────────────
echo ""
echo "--- Admin Audit Log ---"
create_doc "adminAuditLog" "audit-001" '{
  "id": {"stringValue": "audit-001"},
  "adminUid": {"stringValue": "user-admin-001"},
  "action": {"stringValue": "update_subjects"},
  "targetId": {"stringValue": "lincoln.edu"},
  "reason": {"stringValue": "Added Computer Science to subject list"},
  "schoolDomain": {"stringValue": "lincoln.edu"},
  "timestamp": {"timestampValue": "2026-03-01T10:00:00Z"}
}'

echo ""
echo "=== Seeding complete! ==="
echo ""
echo "Test accounts (all passwords: Test1234!):"
echo "  Super Admin:  superadmin@peertutor.app  (Parijat - cross-school)"
echo "  School Admin: admin@lincoln.edu         (Sarah - Lincoln HS)"
echo "  School Admin: principal@riverside.edu   (Dr. Rivera - Riverside MS)"
echo "  Tutee(pending):admin@riverside.edu      (Maria - Riverside MS, promote to admin to test)"
echo "  Tutor:        tutor1@lincoln.edu        (Marcus - Math/CS)"
echo "  Tutor:        tutor2@lincoln.edu        (Emily - Sciences)"
echo "  Tutee:        tutee1@lincoln.edu        (Alex)"
echo "  Tutee:        tutee2@lincoln.edu        (Jordan)"
echo "  Both:         both1@lincoln.edu         (Taylor - English/History)"
echo "  Teacher:      teacher@lincoln.edu       (Ms. Davis)"
echo ""
echo "Schools:"
echo "  lincoln.edu   — Approved (Lincoln High School)"
echo "  riverside.edu — Approved (Riverside Middle School)"
echo "  westview.edu  — Pending  (Westview High School — for super admin demo)"
