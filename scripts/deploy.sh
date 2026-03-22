#!/usr/bin/env bash
# =============================================================================
# PeerTutor — Production Deploy Script
#
# Builds the frontend and deploys to AWS S3 + CloudFront.
# Lambda functions are deployed via GitHub Actions CD pipeline.
#
# Prerequisites (one-time setup):
#   1. aws configure --profile schoolpeertutor
#   2. cp .env.production.example .env.production  and fill in your values
#
# Usage:
#   bash scripts/deploy.sh
#   bash scripts/deploy.sh --skip-ci-check    (skip GitHub CI status check)
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[deploy]${NC} $*"; }
success() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[deploy]${NC} $*"; }
error()   { echo -e "${RED}[deploy] ERROR:${NC} $*" >&2; exit 1; }

SKIP_CI_CHECK=false
for arg in "$@"; do
  [[ "$arg" == "--skip-ci-check" ]] && SKIP_CI_CHECK=true
done

# ── Load .env.production ─────────────────────────────────────────────────────
ENV_FILE="$(dirname "$0")/../.env.production"
if [ ! -f "$ENV_FILE" ]; then
  error ".env.production not found.\nCopy .env.production.example → .env.production and fill in your values."
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
info "Loaded .env.production"

# ── Validate required vars ────────────────────────────────────────────────────
required_vars=(
  S3_BUCKET
  CLOUDFRONT_DISTRIBUTION_ID
  AWS_PROFILE
  VITE_API_URL
  VITE_COGNITO_USER_POOL_ID
  VITE_COGNITO_CLIENT_ID
)
for var in "${required_vars[@]}"; do
  [ -z "${!var:-}" ] && error "Missing required variable: $var  (check .env.production)"
done
info "All required variables present ✅"

# ── Check tools are installed ────────────────────────────────────────────────
command -v aws  >/dev/null 2>&1 || error "aws CLI not installed. https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
command -v node >/dev/null 2>&1 || error "node not installed."
command -v npm  >/dev/null 2>&1 || error "npm not installed."

# ── Check AWS credentials work ───────────────────────────────────────────────
info "Verifying AWS credentials (profile: $AWS_PROFILE)..."
aws sts get-caller-identity --profile "$AWS_PROFILE" --query 'Account' --output text > /dev/null \
  || error "AWS credentials invalid for profile '$AWS_PROFILE'. Run: aws configure --profile $AWS_PROFILE"
success "AWS credentials OK"

# ── Optional: verify CI is green on current commit ───────────────────────────
if [ "$SKIP_CI_CHECK" = false ]; then
  if command -v gh >/dev/null 2>&1; then
    info "Checking GitHub CI status..."
    CURRENT_SHA=$(git rev-parse HEAD)
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

    if [ "$CURRENT_BRANCH" != "master" ]; then
      warn "You are not on master branch (on: $CURRENT_BRANCH). Proceeding anyway."
    else
      CI_STATUS=$(gh run list \
        --branch master \
        --commit "$CURRENT_SHA" \
        --workflow ci.yml \
        --json conclusion \
        --jq '.[0].conclusion' 2>/dev/null || echo "unknown")

      if [ "$CI_STATUS" = "success" ]; then
        success "CI passed for this commit ✅"
      elif [ "$CI_STATUS" = "unknown" ] || [ -z "$CI_STATUS" ]; then
        warn "Could not determine CI status (run may still be in progress)."
        warn "To skip this check: bash scripts/deploy.sh --skip-ci-check"
        read -r -p "Continue anyway? [y/N] " confirm
        [[ "$confirm" =~ ^[Yy]$ ]] || exit 0
      else
        error "CI status is '$CI_STATUS' for commit $CURRENT_SHA.\nFix the failing checks before deploying."
      fi
    fi
  else
    warn "gh CLI not installed — skipping CI status check. (Install: https://cli.github.com)"
  fi
else
  warn "Skipping CI status check (--skip-ci-check)"
fi

# ── Build frontend ────────────────────────────────────────────────────────────
info "Building frontend..."
cd "$(dirname "$0")/../frontend"

npm ci --prefer-offline
npm run build

success "Frontend built → frontend/dist/"
cd ..

# ── Confirm before going live ────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}About to deploy to production:${NC}"
echo "  S3 bucket:     s3://$S3_BUCKET"
echo "  CloudFront:    $CLOUDFRONT_DISTRIBUTION_ID"
echo "  API:           $VITE_API_URL"
echo "  Domain:        https://schoolpeertutor.com"
echo ""
read -r -p "Deploy now? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { info "Deploy cancelled."; exit 0; }

# ── Deploy frontend to S3 ─────────────────────────────────────────────────────
info "Syncing to S3..."

# Hashed assets (JS/CSS with content hash in filename) get long-lived cache
aws s3 sync frontend/dist/ "s3://$S3_BUCKET/" \
  --profile "$AWS_PROFILE" \
  --delete \
  --cache-control "max-age=31536000,immutable" \
  --exclude "index.html" \
  --exclude "*.map"

# index.html must never be cached — it's the entry point for the SPA
aws s3 cp frontend/dist/index.html "s3://$S3_BUCKET/index.html" \
  --profile "$AWS_PROFILE" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html"

success "S3 sync complete"

# ── Invalidate CloudFront ────────────────────────────────────────────────────
info "Invalidating CloudFront cache..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --profile "$AWS_PROFILE" \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)
success "CloudFront invalidation created: $INVALIDATION_ID"
info "CDN will be fully updated within ~60 seconds"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete ✅${NC}"
echo -e "${GREEN}  https://schoolpeertutor.com${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "  CloudFront invalidation: $INVALIDATION_ID"
echo "  Commit: $(git rev-parse --short HEAD)"
echo "  Time:   $(date '+%Y-%m-%d %H:%M:%S')"
