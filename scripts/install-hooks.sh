#!/usr/bin/env bash
# scripts/install-hooks.sh — Install git hooks for PeerTutor
# ─────────────────────────────────────────────────────────────────
# Copies hooks from scripts/hooks/ into the git hooks directory.
# Safe to run multiple times (overwrites existing hooks).
#
# Usage:
#   bash scripts/install-hooks.sh
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_SRC="$SCRIPT_DIR/hooks"

# Resolve the git hooks directory (works with worktrees)
GIT_DIR="$(git -C "$ROOT_DIR" rev-parse --git-dir)"
HOOKS_DST="$GIT_DIR/hooks"

if [ ! -d "$HOOKS_SRC" ]; then
  echo "[install-hooks] No hooks found in scripts/hooks/"
  exit 1
fi

echo "[install-hooks] Installing git hooks..."
echo "  Source: $HOOKS_SRC"
echo "  Target: $HOOKS_DST"
echo ""

mkdir -p "$HOOKS_DST"

installed=0
for hook in "$HOOKS_SRC"/*; do
  [ -f "$hook" ] || continue
  name="$(basename "$hook")"
  cp "$hook" "$HOOKS_DST/$name"
  chmod +x "$HOOKS_DST/$name"
  echo "  ✅ $name"
  installed=$((installed + 1))
done

echo ""
if [ "$installed" -gt 0 ]; then
  echo "[install-hooks] Done — $installed hook(s) installed."
else
  echo "[install-hooks] No hooks to install."
fi
