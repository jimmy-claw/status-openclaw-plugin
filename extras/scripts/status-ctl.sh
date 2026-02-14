#!/usr/bin/env bash
# status-ctl.sh — manage status-backend for OpenClaw
set -euo pipefail

PORT="${STATUS_PORT:-21405}"
BASE="http://localhost:$PORT"
DATA_DIR="${STATUS_DATA_DIR:-$HOME/.status-backend/data}"
PIDFILE="/tmp/status-backend.pid"

usage() {
  cat <<EOF
Usage: status-ctl.sh <command> [args]

Commands:
  start               Start status-backend daemon
  stop                Stop status-backend daemon
  status              Check if running + health
  init                Initialize application
  create-account      Create new account (prompts for display name)
  login <keyUID>      Login to existing account
  start-services      Start messenger + wallet after login
  chats               List active chats
  send <chatID> <msg> Send a message
  contacts            List contacts
  accounts            List available accounts
EOF
}

start() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Already running (PID $(cat "$PIDFILE"))"
    return 0
  fi
  local bin
  bin=$(command -v status-backend 2>/dev/null || echo "$HOME/.local/bin/status-backend")
  if [ ! -x "$bin" ]; then
    echo "ERROR: status-backend not found. Build from status-im/status-go:"
    echo "  cd status-go && go build -o ~/.local/bin/status-backend ./cmd/status-backend/"
    return 1
  fi
  mkdir -p "$DATA_DIR"
  nohup "$bin" --address "localhost:$PORT" > /tmp/status-backend.log 2>&1 &
  echo $! > "$PIDFILE"
  echo "Started status-backend on port $PORT (PID $!)"
  sleep 2
  health
}

stop() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null && echo "Stopped" || echo "Not running"
    rm -f "$PIDFILE"
  else
    echo "No PID file found"
  fi
}

health() {
  curl -sf "$BASE/health" 2>/dev/null && echo || echo "NOT HEALTHY"
}

status_check() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Running (PID $(cat "$PIDFILE"))"
    health
  else
    echo "Not running"
  fi
}

rpc() {
  local method="$1"
  shift
  local params="${1:-[]}"
  curl -sf -X POST "$BASE/statusgo/CallRPC" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":$params,\"id\":1}"
}

api() {
  local method="$1"
  shift
  local body="${1:-{}}"
  curl -sf -X POST "$BASE/statusgo/$method" \
    -H "Content-Type: application/json" \
    -d "$body"
}

init_app() {
  api "InitializeApplication" "{\"dataDir\":\"$DATA_DIR\"}"
  echo
}

create_account() {
  local name="${1:-Jimmy}"
  local pass="${2:-defaultpass123}"
  api "CreateAccountAndLogin" "{
    \"rootDataDir\":\"$DATA_DIR\",
    \"displayName\":\"$name\",
    \"password\":\"$pass\",
    \"logEnabled\":false
  }"
  echo
}

login_account() {
  local keyuid="$1"
  local pass="${2:-defaultpass123}"
  api "LoginAccount" "{\"keyUID\":\"$keyuid\",\"password\":\"$pass\"}"
  echo
}

start_services() {
  rpc "wakuext_startMessenger"
  echo
  rpc "wallet_startWallet"
  echo
  rpc "settings_getSettings"
  echo "Services started"
}

list_chats() {
  rpc "wakuext_chats"
}

send_msg() {
  local chatid="$1"
  local text="$2"
  rpc "chat_sendMessage" "[null,\"$chatid\",\"$text\",\"\"]"
}

list_contacts() {
  rpc "wakuext_contacts"
}

list_accounts() {
  api "OpenAccounts" "\"$DATA_DIR\""
}

cmd="${1:-}"
shift || true

case "$cmd" in
  start)           start ;;
  stop)            stop ;;
  status)          status_check ;;
  init)            init_app ;;
  create-account)  create_account "${1:-}" "${2:-}" ;;
  login)           login_account "${1:?keyUID required}" "${2:-}" ;;
  start-services)  start_services ;;
  chats)           list_chats ;;
  send)            send_msg "${1:?chatID required}" "${2:?message required}" ;;
  contacts)        list_contacts ;;
  accounts)        list_accounts ;;
  health)          health ;;
  *)               usage ;;
esac
