#!/usr/bin/env bash
# Build and package Lambda functions for deployment.
# Produces dist/{group}.zip files ready for S3 upload.

set -euo pipefail

cd "$(dirname "$0")/../backend/lambdas"

echo "Installing all dependencies (esbuild needed for build)..."
npm ci 2>/dev/null || npm install

echo "Building Lambda bundles..."
node esbuild.config.mjs

echo "Creating deployment zips..."
GROUPS="auth bookings schools reviews misc scheduled"

# Groups that need googleapis (externalized from esbuild for bundle size)
NEEDS_GOOGLEAPIS="bookings schools"

for group in $GROUPS; do
  STAGING="dist/_staging_$group"
  rm -rf "$STAGING"
  mkdir -p "$STAGING"

  # Copy the bundled code
  cp dist/$group/index.mjs "$STAGING/"
  cp dist/$group/index.mjs.map "$STAGING/" 2>/dev/null || true

  # Include googleapis node_modules for groups that use Google Meet
  if echo "$NEEDS_GOOGLEAPIS" | grep -qw "$group"; then
    mkdir -p "$STAGING/node_modules"
    cp -r node_modules/googleapis "$STAGING/node_modules/" 2>/dev/null || true
    cp -r node_modules/googleapis-common "$STAGING/node_modules/" 2>/dev/null || true
    cp -r node_modules/google-auth-library "$STAGING/node_modules/" 2>/dev/null || true
    cp -r node_modules/gaxios "$STAGING/node_modules/" 2>/dev/null || true
    cp -r node_modules/gcp-metadata "$STAGING/node_modules/" 2>/dev/null || true
  fi

  # Create zip
  (cd "$STAGING" && zip -rq "../../dist/$group.zip" . 2>/dev/null || \
    powershell -Command "Compress-Archive -Path '.' -DestinationPath '../../dist/$group.zip' -Force")

  SIZE=$(du -sh "dist/$group.zip" 2>/dev/null | cut -f1)
  echo "  ✓ dist/$group.zip ($SIZE)"

  rm -rf "$STAGING"
done

echo "Build complete. Artifacts in backend/lambdas/dist/"
