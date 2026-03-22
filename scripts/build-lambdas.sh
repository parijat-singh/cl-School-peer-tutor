#!/usr/bin/env bash
# Build and package Lambda functions for deployment.
# Produces dist/{group}.zip files ready for S3 upload.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAMBDAS_DIR="$SCRIPT_DIR/../backend/lambdas"

cd "$LAMBDAS_DIR"
echo "Working directory: $(pwd)"

# Install deps if node_modules missing (CI already runs npm ci)
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm ci
fi

echo "Building Lambda bundles..."
node esbuild.config.mjs

echo "Build output:"
ls -la dist/

echo "Creating deployment zips..."

for group in auth bookings schools reviews misc scheduled; do
  if [ ! -f "dist/$group/index.mjs" ]; then
    echo "ERROR: dist/$group/index.mjs not found!"
    ls -la "dist/$group/" 2>/dev/null || echo "  Directory dist/$group/ does not exist"
    exit 1
  fi

  STAGING="dist/_staging_$group"
  rm -rf "$STAGING"
  mkdir -p "$STAGING"

  # Copy the bundled code
  cp "dist/$group/index.mjs" "$STAGING/"
  cp "dist/$group/index.mjs.map" "$STAGING/" 2>/dev/null || true

  # Include googleapis node_modules for groups that use Google Meet
  case "$group" in
    bookings|schools)
      mkdir -p "$STAGING/node_modules"
      for pkg in googleapis googleapis-common google-auth-library gaxios gcp-metadata; do
        cp -r "node_modules/$pkg" "$STAGING/node_modules/" 2>/dev/null || true
      done
      ;;
  esac

  # Create zip
  (cd "$STAGING" && zip -rq "../../dist/$group.zip" .)

  SIZE=$(du -sh "dist/$group.zip" 2>/dev/null | cut -f1)
  echo "  ✓ dist/$group.zip ($SIZE)"

  rm -rf "$STAGING"
done

echo "Build complete. Artifacts in backend/lambdas/dist/"
