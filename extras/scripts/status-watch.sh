#!/usr/bin/env bash
# status-watch.sh — poll for new Status messages and output them
# Usage: status-watch.sh [--since TIMESTAMP_MS] [--chat PUBKEY] [--json]
# Designed to be called periodically (e.g., from heartbeat or cron)
set -euo pipefail

PORT="${STATUS_PORT:-21405}"
BASE="http://localhost:$PORT"
STATE_FILE="${STATUS_STATE_DIR:-$HOME/.status-backend}/last-check.json"
MY_PUBKEY="${STATUS_MY_PUBKEY:-}"

# Parse args
SINCE=""
CHAT=""
JSON_OUT=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) SINCE="$2"; shift 2 ;;
    --chat) CHAT="$2"; shift 2 ;;
    --json) JSON_OUT=true; shift ;;
    *) shift ;;
  esac
done

# Load last check timestamp
if [[ -z "$SINCE" && -f "$STATE_FILE" ]]; then
  SINCE=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('lastCheck', 0))" 2>/dev/null || echo "0")
fi
SINCE="${SINCE:-0}"

rpc() {
  curl -sf -X POST "$BASE/statusgo/CallRPC" \
    -H "Content-Type: application/json" \
    -d "$1" 2>/dev/null
}

# Health check
if ! curl -sf "$BASE/health" > /dev/null 2>&1; then
  echo "ERROR: status-backend not reachable" >&2
  exit 1
fi

# Get active chats
if [[ -n "$CHAT" ]]; then
  CHATS="[\"$CHAT\"]"
else
  CHATS=$(rpc '{"jsonrpc":"2.0","method":"wakuext_activeChats","params":[],"id":1}' | \
    python3 -c "
import sys,json
d=json.load(sys.stdin)
chats=d.get('result',[])
# Only 1:1 chats (chatType=1)
ids=[c['id'] for c in chats if c.get('chatType')==1]
print(json.dumps(ids))
" 2>/dev/null || echo "[]")
fi

# Get my public key if not set
if [[ -z "$MY_PUBKEY" ]]; then
  MY_PUBKEY=$(rpc '{"jsonrpc":"2.0","method":"settings_getSettings","params":[],"id":1}' | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('result',{}).get('public-key',''))" 2>/dev/null || echo "")
fi

NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")

# Fetch messages from each chat
python3 -c "
import json, sys, subprocess

base = '$BASE'
since = $SINCE
my_pubkey = '$MY_PUBKEY'
json_out = $([[ "$JSON_OUT" == "true" ]] && echo "True" || echo "False")
chats = json.loads('$CHATS')
now_ms = $NOW_MS

new_messages = []

for chat_id in chats:
    payload = json.dumps({
        'jsonrpc': '2.0',
        'method': 'wakuext_chatMessages',
        'params': [chat_id, '', 20],
        'id': 1
    })
    try:
        result = subprocess.run(
            ['curl', '-sf', '-X', 'POST', f'{base}/statusgo/CallRPC',
             '-H', 'Content-Type: application/json', '-d', payload],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        messages = data.get('result', {}).get('messages', [])
        for msg in messages:
            ts = msg.get('whisperTimestamp', 0)
            if ts > since and msg.get('from', '') != my_pubkey:
                new_messages.append({
                    'chat': chat_id,
                    'from': msg.get('from', ''),
                    'text': msg.get('text', ''),
                    'timestamp': ts,
                    'id': msg.get('id', ''),
                    'type': msg.get('contentType', 1)
                })
    except Exception as e:
        print(f'Error checking chat {chat_id[:20]}...: {e}', file=sys.stderr)

# Sort by timestamp
new_messages.sort(key=lambda m: m['timestamp'])

if json_out:
    print(json.dumps(new_messages, indent=2))
else:
    if not new_messages:
        print('No new messages.')
    for msg in new_messages:
        sender = msg['from'][:20] + '...'
        print(f'[{msg[\"timestamp\"]}] {sender}: {msg[\"text\"][:200]}')

# Save state
state = {'lastCheck': now_ms, 'messagesFound': len(new_messages)}
with open('$STATE_FILE', 'w') as f:
    json.dump(state, f)
" 2>/dev/null
