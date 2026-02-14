#!/usr/bin/env bash
# status-login.sh — initialize, login, and start messenger
# Reads credentials from ~/.status-backend/account.json or env vars
set -euo pipefail

PORT="${STATUS_PORT:-21405}"
BASE="http://localhost:$PORT"
DATA_DIR="${STATUS_DATA_DIR:-$HOME/.status-backend/data}"
PASSWORD="${STATUS_PASSWORD:-jimmy-claw-2026}"

# Health check
if ! curl -sf "$BASE/health" > /dev/null 2>&1; then
  echo "status-backend not running. Starting..."
  sudo systemctl start status-backend
  sleep 3
  if ! curl -sf "$BASE/health" > /dev/null 2>&1; then
    echo "ERROR: Failed to start status-backend" >&2
    exit 1
  fi
fi

# Initialize
echo "Initializing..."
curl -sf -X POST "$BASE/statusgo/InitializeApplication" \
  -H "Content-Type: application/json" \
  -d "{\"dataDir\": \"$DATA_DIR\"}" > /dev/null

# Get keyUID
KEYUID=$(curl -sf "$BASE/statusgo/OpenAccounts" \
  -H "Content-Type: application/json" \
  -d "\"$DATA_DIR\"" | python3 -c "
import sys,json
d=json.load(sys.stdin)
accounts=d.get('accounts',[]) if isinstance(d, dict) else d
if accounts:
    print(accounts[0]['key-uid'])
" 2>/dev/null)

if [[ -z "$KEYUID" ]]; then
  echo "ERROR: No accounts found" >&2
  exit 1
fi

echo "Logging in as $KEYUID..."
RESULT=$(curl -sf -X POST "$BASE/statusgo/LoginAccount" \
  -H "Content-Type: application/json" \
  -d "{\"keyUID\": \"$KEYUID\", \"password\": \"$PASSWORD\"}")

ERROR=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
if [[ -n "$ERROR" ]]; then
  echo "ERROR: Login failed: $ERROR" >&2
  exit 1
fi

echo "Starting messenger..."
curl -sf -X POST "$BASE/statusgo/CallRPC" \
  -d '{"jsonrpc":"2.0","method":"wakuext_startMessenger","params":[],"id":1}' > /dev/null

echo "Done! Status messenger is ready."
