#!/usr/bin/env bash
# .claude/hooks/pre-commit-tests.sh
# PreToolUse hook: intercepts `git commit` commands and runs E2E tests first.
# Exit 0 = allow, Exit 2 = block the tool call.

# Read the tool input from stdin (JSON with the Bash command)
INPUT=$(cat)

# Extract the command being run
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

# Only intercept git commit commands
if echo "$COMMAND" | grep -qE 'git\s+commit'; then
  echo "Pre-commit hook: running E2E tests before commit..."

  # Find the repo root (where scripts/test-flows.sh lives)
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$REPO_ROOT" ]; then
    echo "Warning: not in a git repo, skipping tests"
    exit 0
  fi

  TEST_SCRIPT="$REPO_ROOT/scripts/test-flows.sh"
  if [ ! -f "$TEST_SCRIPT" ]; then
    echo "Warning: test script not found at $TEST_SCRIPT, skipping"
    exit 0
  fi

  # Run the tests
  bash "$TEST_SCRIPT"
  TEST_EXIT=$?

  if [ $TEST_EXIT -ne 0 ]; then
    echo ""
    echo "BLOCKED: E2E tests failed ($TEST_EXIT failure(s)). Fix tests before committing."
    exit 2
  fi

  echo "All E2E tests passed. Proceeding with commit."
fi

exit 0
