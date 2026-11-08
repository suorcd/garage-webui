#!/usr/bin/env bash
#
# Provision the local development Garage instance:
#   - assign the node to a layout (first run only)
#   - create the dev-key access key (first run only)
#   - create the dev-bucket bucket and grant dev-key read/write/owner
#   - expose it as the "garage-webui" global alias
#
# Safe to run repeatedly. Requires scripts/garage-dev.sh (or scripts/dev.sh)
# to be running.
#
# The script reads cluster state from the Garage admin API (JSON) and never
# parses the `garage` CLI table output, so a CLI layout change cannot break
# it. It prints the dev key ID and secret only with --show-credentials.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SHOW_CREDENTIALS=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --show-credentials)
      SHOW_CREDENTIALS=true
      shift
      ;;
    -h|--help)
      echo "Usage: scripts/garage-setup.sh [--show-credentials]"
      echo "Print the dev key ID and secret only with --show-credentials."
      exit 0
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      exit 1
      ;;
  esac
done

for cmd in garage curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' is missing; run 'nix develop' first" >&2
    exit 1
  fi
done

CONFIG="${CONFIG_PATH:-$ROOT/dev/garage.toml}"
ADMIN_URL="${API_BASE_URL:-http://127.0.0.1:3903}"
ADMIN_KEY="${API_ADMIN_KEY:-dev-admin-token}"
KEY_NAME="dev-key"
BUCKET_NAME="dev-bucket"
BUCKET_ALIAS="garage-webui"

run_garage() {
  garage -c "$CONFIG" "$@"
}

admin_get() {
  curl -fsS -H "Authorization: Bearer $ADMIN_KEY" "$ADMIN_URL$1"
}

wait_for_server() {
  local attempts=120
  for ((i = 1; i <= attempts; i++)); do
    if run_garage status >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "error: Garage did not start; see .dev/garage/server.log" >&2
  return 1
}

wait_for_admin() {
  local attempts=120
  for ((i = 1; i <= attempts; i++)); do
    if admin_get "/v2/ListBuckets" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "error: Garage admin API did not become ready at $ADMIN_URL" >&2
  return 1
}

set_layout() {
  local status_json node_id
  if ! status_json="$(admin_get "/v2/GetClusterStatus")"; then
    echo "error: could not read cluster status from $ADMIN_URL" >&2
    return 1
  fi
  node_id="$(printf '%s' "$status_json" | jq -r '(.nodes // .knownNodes // [])[] | select(.role == null) | .id' | head -n 1)"
  if [[ -z "$node_id" ]]; then
    return 0
  fi

  echo "Assigning node $node_id to the local layout..."
  run_garage layout assign -z dev -c 1G "$node_id" >/dev/null
  run_garage layout apply --version 1 >/dev/null
}

set_key() {
  local keys_json
  if ! keys_json="$(admin_get "/v2/ListKeys")"; then
    echo "error: could not list keys from $ADMIN_URL" >&2
    return 1
  fi
  if printf '%s' "$keys_json" | jq -e --arg name "$KEY_NAME" 'any(. // [] | .[]; .name == $name)' >/dev/null; then
    return 0
  fi

  echo "Creating access key $KEY_NAME..."
  run_garage key create "$KEY_NAME" >/dev/null
}

set_bucket() {
  if ! run_garage bucket info "$BUCKET_NAME" >/dev/null 2>&1; then
    echo "Creating bucket $BUCKET_NAME..."
    run_garage bucket create "$BUCKET_NAME" >/dev/null
  fi

  local keys_json key_id bucket_json
  if ! keys_json="$(admin_get "/v2/ListKeys")"; then
    echo "error: could not list keys from $ADMIN_URL" >&2
    return 1
  fi
  key_id="$(printf '%s' "$keys_json" | jq -r --arg name "$KEY_NAME" '.[] | select(.name == $name) | .id' | head -n 1)"
  if [[ -z "$key_id" ]]; then
    echo "error: key $KEY_NAME is missing after setup" >&2
    return 1
  fi

  if ! bucket_json="$(admin_get "/v2/GetBucketInfo?id=$BUCKET_NAME")"; then
    echo "error: could not read bucket $BUCKET_NAME from $ADMIN_URL" >&2
    return 1
  fi

  if ! printf '%s' "$bucket_json" | jq -e --arg key "$key_id" \
    'any(.keys // [] | .[]; .accessKeyId == $key and .permissions.read and .permissions.write and .permissions.owner)' >/dev/null; then
    echo "Granting $KEY_NAME read, write and owner on $BUCKET_NAME..."
    run_garage bucket allow --read --write --owner "$BUCKET_NAME" --key "$key_id" >/dev/null
  fi

  if ! printf '%s' "$bucket_json" | jq -e --arg alias "$BUCKET_ALIAS" \
    'any(.globalAliases // [] | .[]; . == $alias)' >/dev/null; then
    echo "Setting alias $BUCKET_ALIAS on $BUCKET_NAME..."
    run_garage bucket alias "$BUCKET_NAME" "$BUCKET_ALIAS" >/dev/null
  fi
}

wait_for_server
wait_for_admin
set_layout
set_key
set_bucket

echo
echo "Local Garage is ready:"
echo "  Admin API: $ADMIN_URL"
echo "  S3 API:    ${S3_ENDPOINT_URL:-http://127.0.0.1:3900}"
echo "  Bucket:    $BUCKET_ALIAS (alias for $BUCKET_NAME)"
echo "  Key:       $KEY_NAME"
echo

if [[ "$SHOW_CREDENTIALS" == "true" ]]; then
  run_garage key export-env --prefix "" "$KEY_NAME" | sed 's/^/  /'
fi
