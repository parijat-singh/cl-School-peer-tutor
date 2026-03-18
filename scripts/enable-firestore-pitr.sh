#!/usr/bin/env bash
# Enable Firestore point-in-time recovery (PITR) on the default database.
# Billing required. Run once per GCP project (same project as Firebase).
#
# Usage: ./scripts/enable-firestore-pitr.sh <gcp-project-id>
#   e.g. ./scripts/enable-firestore-pitr.sh peertutor-prod
#
# Docs: docs/runbooks/firestore-pitr-and-backups.md

set -euo pipefail
PROJECT="${1:?Usage: $0 <gcp-project-id>}"

echo "Enabling PITR on Firestore (default) in project: $PROJECT"
gcloud config set project "$PROJECT" >/dev/null

if gcloud firestore databases update --help 2>&1 | grep -q enable-pitr; then
  gcloud firestore databases update --database="(default)" --enable-pitr --project="$PROJECT"
  echo "PITR enabled."
else
  echo "Trying Firestore Admin API (URL-encoded database id)..."
  TOKEN=$(gcloud auth print-access-token)
  curl -sS -X PATCH \
    "https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/%28default%29?updateMask=pointInTimeRecoveryEnablement" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"pointInTimeRecoveryEnablement":"POINT_IN_TIME_RECOVERY_ENABLED"}' \
    | head -c 500
  echo ""
  echo "If the response shows an error, enable PITR in Firebase Console → Firestore → (database) → Backups / PITR."
fi
