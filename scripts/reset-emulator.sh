#!/bin/bash
# Reset Firebase emulators to original seed state
# Usage: bash scripts/reset-emulator.sh
#
# Clears all Firestore and Auth data, then re-seeds with seed-emulator.sh

PROJECT_ID="peertutor-dev"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Preflight check
if ! curl -s --connect-timeout 3 "http://localhost:8080/" > /dev/null 2>&1; then
  echo -e "${YELLOW}[SKIP] Firebase emulators not running. Nothing to reset.${NC}"
  exit 0
fi

echo ""
echo -e "${CYAN}[RESET]${NC} Clearing all emulator data..."
curl -s --globoff -X DELETE "http://localhost:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents" > /dev/null 2>&1
curl -s --globoff -X DELETE "http://localhost:9099/emulator/v1/projects/${PROJECT_ID}/accounts" > /dev/null 2>&1

echo -e "${CYAN}[RESET]${NC} Re-seeding with original data..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "${SCRIPT_DIR}/seed-emulator.sh" > /dev/null 2>&1

echo -e "${GREEN}[RESET]${NC} Emulator restored to original seed state."
echo ""
