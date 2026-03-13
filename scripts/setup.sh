#!/usr/bin/env bash
# scripts/setup.sh — PeerTutor local setup
set -e

echo "🎓 PeerTutor Setup"
echo "=================="

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "❌ Docker not found. Install from https://www.docker.com"
  exit 1
fi

# Create .env if missing
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "⚠️  Created .env from .env.example"
  echo "    Edit .env with your Firebase project values, then re-run this script."
  exit 0
fi

echo "✅ .env found"
echo ""
echo "🚀 Starting PeerTutor..."
docker-compose up --build

echo ""
echo "Services:"
echo "  Frontend:           http://localhost:5173"
echo "  Firebase Emulators: http://localhost:4000"
echo "  Nginx proxy:        http://localhost:80"
