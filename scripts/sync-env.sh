#!/usr/bin/env bash
# scripts/sync-env.sh — Keep .env.example in sync with .env
# ─────────────────────────────────────────────────────────────────
# Reads .env, strips secret values, preserves comments and structure,
# and writes .env.example so new developers know which vars to set.
#
# Usage:
#   bash scripts/sync-env.sh          # Run manually
#   (also runs automatically via pre-commit hook)
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

# ── Helper: strip Windows \r from line ───────────────────────────
strip_cr() { printf '%s' "${1//$'\r'/}"; }

# ── Preflight ────────────────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
  echo "[sync-env] No .env found — nothing to sync."
  exit 0
fi

# ── Collect variable names from .env ─────────────────────────────

# Extract all VAR_NAME keys (lines like KEY=value, skip comments/blanks)
env_keys=()
while IFS= read -r raw_line; do
  line="$(strip_cr "$raw_line")"
  # Skip blank lines and comments
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  # Extract the key (everything before the first =)
  key="${line%%=*}"
  # Validate it looks like a variable name
  [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && env_keys+=("$key")
done < "$ENV_FILE"

# ── Collect variable names already in .env.example ───────────────

example_keys=()
if [ -f "$EXAMPLE_FILE" ]; then
  while IFS= read -r raw_line; do
    line="$(strip_cr "$raw_line")"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    key="${line%%=*}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && example_keys+=("$key")
  done < "$EXAMPLE_FILE"
fi

# ── Find missing keys ───────────────────────────────────────────

missing=()
for key in "${env_keys[@]}"; do
  found=false
  for ekey in "${example_keys[@]}"; do
    if [ "$key" = "$ekey" ]; then
      found=true
      break
    fi
  done
  if [ "$found" = false ]; then
    missing+=("$key")
  fi
done

# ── Find removed keys (in example but not in .env) ──────────────

removed=()
for ekey in "${example_keys[@]}"; do
  found=false
  for key in "${env_keys[@]}"; do
    if [ "$ekey" = "$key" ]; then
      found=true
      break
    fi
  done
  if [ "$found" = false ]; then
    removed+=("$ekey")
  fi
done

# ── Report & apply changes ──────────────────────────────────────

changes=false

# Append missing keys to .env.example
if [ ${#missing[@]} -gt 0 ]; then
  changes=true
  echo ""  >> "$EXAMPLE_FILE"
  echo "# ── Added by sync-env $(date +%Y-%m-%d) ──────────────────────────" >> "$EXAMPLE_FILE"
  for key in "${missing[@]}"; do
    echo "[sync-env] + Adding:  $key"
    echo "$key=" >> "$EXAMPLE_FILE"
  done
fi

# Warn about removed keys (don't auto-delete — may be intentional)
if [ ${#removed[@]} -gt 0 ]; then
  changes=true
  echo ""
  echo "[sync-env] ⚠ The following keys are in .env.example but NOT in .env:"
  for key in "${removed[@]}"; do
    echo "           - $key"
  done
  echo "           Remove them manually from .env.example if no longer needed."
fi

# ── Sanitize values — strip secrets from .env.example ────────────

# List of keys whose values are safe to keep as examples/defaults
SAFE_KEYS="FIREBASE_AUTH_DOMAIN|FIREBASE_STORAGE_BUCKET|SENDGRID_FROM_EMAIL|SENDGRID_FROM_NAME|GOOGLE_CALENDAR_ID|SUPER_ADMIN_EMAIL|DOMAIN|NODE_ENV"

if [ -f "$EXAMPLE_FILE" ]; then
  tmp_file="$EXAMPLE_FILE.tmp"
  > "$tmp_file"  # truncate
  while IFS= read -r raw_line; do
    line="$(strip_cr "$raw_line")"
    # Pass through comments and blank lines
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
      echo "$line" >> "$tmp_file"
      continue
    fi

    key="${line%%=*}"
    val="${line#*=}"

    # Check if this is a safe key (non-secret default value is OK)
    if [[ "$key" =~ ^($SAFE_KEYS)$ ]]; then
      # Replace real values with generic placeholders
      case "$key" in
        FIREBASE_AUTH_DOMAIN)     val="your-project.firebaseapp.com" ;;
        FIREBASE_STORAGE_BUCKET)  val="your-project.appspot.com" ;;
        SENDGRID_FROM_EMAIL)      val="noreply@yourdomain.com" ;;
        SENDGRID_FROM_NAME)       val="${val:-PeerTutor}" ;;
        GOOGLE_CALENDAR_ID)       val="${val:-primary}" ;;
        SUPER_ADMIN_EMAIL)        val="admin@yourdomain.com" ;;
        DOMAIN)                   val="yourdomain.com" ;;
        NODE_ENV)                 val="development" ;;
        *)                        val="" ;;
      esac
      echo "$key=$val" >> "$tmp_file"
    else
      # Secret key — always blank in example
      echo "$key=" >> "$tmp_file"
    fi
  done < "$EXAMPLE_FILE"
  mv "$tmp_file" "$EXAMPLE_FILE"
fi

# ── Summary ──────────────────────────────────────────────────────

if [ "$changes" = true ]; then
  echo ""
  echo "[sync-env] ✅ .env.example updated — review and commit the changes."
else
  echo "[sync-env] ✅ .env.example is already in sync with .env."
fi
