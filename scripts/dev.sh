#!/usr/bin/env bash
#
# Start the complete local development environment:
#   - a single-node Garage server (unless one is already running on :3903)
#   - the dev bucket/key/layout
#   - the Go API with live reload (Air) on :3909
#   - the Vite dev server on :5173
#
# If another service answers at the admin URL with a different token, the
# script stops instead of starting a second Garage.
# Run this from `nix develop` (or any shell with garage, go, node, pnpm and air).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for cmd in garage go node pnpm air curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' is missing; run 'nix develop' first" >&2
    exit 1
  fi
done

export CONFIG_PATH="$ROOT/dev/garage.toml"
export API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3903}"
export API_ADMIN_KEY="${API_ADMIN_KEY:-dev-admin-token}"
export S3_ENDPOINT_URL="${S3_ENDPOINT_URL:-http://127.0.0.1:3900}"
export S3_REGION="${S3_REGION:-garage}"
export AUTH_DISABLED="${AUTH_DISABLED:-true}"
export VITE_API_URL="${VITE_API_URL:-http://127.0.0.1:3909}"

mkdir -p .dev/garage/meta .dev/garage/data

GARAGE_PID=""
cleanup() {
  if [[ -n "$GARAGE_PID" ]]; then
    echo
    echo "Stopping local Garage..."
    kill "$GARAGE_PID" 2>/dev/null || true
    wait "$GARAGE_PID" 2>/dev/null || true
    rm -f .dev/garage/garage.pid
  fi
}
trap cleanup EXIT INT TERM

if curl -fsS -H "Authorization: Bearer $API_ADMIN_KEY" \
  "$API_BASE_URL/v2/ListBuckets" >/dev/null 2>&1; then
  echo "Using the Garage instance already running at $API_BASE_URL"
elif curl -s "$API_BASE_URL/v2/ListBuckets" >/dev/null 2>&1; then
  # Something answers here, but it did not accept the admin token. Start no
  # second Garage: it would fail to bind. Stop here with a clear message.
  echo "error: something already answers at $API_BASE_URL but the admin token does not match" >&2
  echo "Set API_ADMIN_KEY to the running instance token, or stop that instance first." >&2
  exit 1
else
  echo "Starting local Garage; logs are in .dev/garage/server.log"
  garage -c "$CONFIG_PATH" server >.dev/garage/server.log 2>&1 &
  GARAGE_PID=$!
  echo "$GARAGE_PID" >.dev/garage/garage.pid
fi

if [[ ! -d node_modules ]]; then
  echo "Installing frontend dependencies..."
  pnpm install --frozen-lockfile
fi

scripts/garage-setup.sh

echo
echo "Web UI:  http://localhost:5173"
echo "API:     http://localhost:3909"
echo "Garage:  http://localhost:3903 (admin API)"
echo "Press Ctrl+C to stop."
echo

pnpm dev
