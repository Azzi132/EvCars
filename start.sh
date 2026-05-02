#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  echo
  echo "Shutting down backend..."
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill -TERM "-$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" 2>/dev/null || true
    sleep 1
    kill -KILL "-$BACKEND_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '(:|\.)5000$'; then
  echo "Error: port 5000 is already in use." >&2
  echo "Find and kill the stale process with:" >&2
  echo "  ss -ltnp | grep :5000   # then: kill <pid>" >&2
  exit 1
fi

echo "Starting backend..."
# setsid puts backend in its own process group so we can signal the whole tree
setsid bash -c 'cd "'"$ROOT"'/backend" && exec npm start' &
BACKEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Starting frontend (Expo) in foreground — press a/i/r/etc. as normal."
echo "Press Ctrl+C to stop both."
echo

cd "$ROOT" && npm start
