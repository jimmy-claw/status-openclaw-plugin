---
name: status-messenger
description: Send and receive messages over the Status (Waku) network using the status-backend HTTP API. Use when communicating via Status messenger, managing Status contacts, joining communities, or interacting with the decentralized Status network.
---

# Status Messenger Skill

Communicate over the Status decentralized network via the `status-backend` HTTP/WebSocket API.

## Prerequisites

- `status-backend` binary (built from `status-im/status-go`, `cmd/status-backend/`)
- Binary location: check `which status-backend` or `~/.local/bin/status-backend`

## Architecture

`status-backend` exposes the full status-go API:
- **REST**: `http://localhost:$PORT/statusgo/<MethodName>` — account management, login, etc.
- **JSON-RPC**: `POST /statusgo/CallRPC` — all services (`wakuext_*`, `chat_*`, `wallet_*`)
- **WebSocket**: `ws://localhost:$PORT/signals` — real-time signal stream
- **Health**: `GET /health` — returns `{"version": "..."}`

## Quick Start

### 1. Start the backend

```bash
status-backend --address localhost:21405 &
```

### 2. Initialize & create account

```bash
# Initialize
curl -s -X POST http://localhost:21405/statusgo/InitializeApplication \
  -d '{"dataDir": "'$HOME'/.status-backend/data"}'

# Create account (first time)
curl -s -X POST http://localhost:21405/statusgo/CreateAccountAndLogin \
  -d '{
    "rootDataDir": "'$HOME'/.status-backend/data",
    "displayName": "Jimmy",
    "password": "hunter2",
    "logEnabled": false
  }'
```

### 3. Start messenger & wallet

```bash
curl -s -X POST http://localhost:21405/statusgo/CallRPC \
  -d '{"jsonrpc":"2.0","method":"wakuext_startMessenger","params":[]}'

curl -s -X POST http://localhost:21405/statusgo/CallRPC \
  -d '{"jsonrpc":"2.0","method":"wallet_startWallet","params":[]}'
```

### 4. Send a message

```bash
# Send contact request
curl -s -X POST http://localhost:21405/statusgo/CallRPC \
  -d '{
    "jsonrpc":"2.0",
    "method":"wakuext_sendContactRequest",
    "params":[{"id":"0x04<pubkey>","message":"Hello!"}]
  }'

# Send message to existing chat
curl -s -X POST http://localhost:21405/statusgo/CallRPC \
  -d '{
    "jsonrpc":"2.0",
    "method":"chat_sendMessage",
    "params":[null,"<chatID>","Hello from Jimmy!",""]
  }'
```

### 5. List chats

```bash
curl -s -X POST http://localhost:21405/statusgo/CallRPC \
  -d '{"jsonrpc":"2.0","method":"wakuext_chats","params":[]}'
```

## Signal Monitoring

Connect to WebSocket for real-time events:

```bash
# Using websocat
websocat ws://localhost:21405/signals
```

Key signal types:
- `messages.new` — new messages received
- `node.login` — login completed
- `node.ready` — node fully operational

## Key RPC Methods

| Method | Description |
|--------|-------------|
| `wakuext_startMessenger` | Start the messenger service |
| `wakuext_sendContactRequest` | Send contact request with message |
| `wakuext_chats` | List all chats |
| `wakuext_activeChats` | List active chats |
| `chat_sendMessage` | Send message to a chat |
| `chat_sendImages` | Send images to a chat |
| `wakuext_createOneToOneChat` | Create 1:1 chat |
| `wakuext_createPublicChat` | Join public chat |
| `wakuext_createGroupChatWithMembers` | Create group chat |

## Login (returning user)

```bash
curl -s -X POST http://localhost:21405/statusgo/LoginAccount \
  -d '{"keyUID":"<keyUID>","password":"<password>"}'
```

## Scripts

- **`scripts/status-login.sh`** — Initialize, login, start messenger (run after service restart)
- **`scripts/status-watch.sh`** — Poll for new messages since last check. Returns new messages or "No new messages."
  - `--since TIMESTAMP_MS` — override start timestamp
  - `--chat PUBKEY` — check specific chat only
  - `--json` — output as JSON
  - Saves state to `~/.status-backend/last-check.json`
- **`scripts/status-ctl.sh`** — Common operations (start, stop, status, send, chats)

## Heartbeat Integration

Add Status message checking to HEARTBEAT.md to automatically poll for new messages:
1. Run `status-watch.sh` during heartbeat
2. If new messages found, read and respond on Status
3. Optionally notify user on primary channel (Telegram) for important messages

## Data Directory

Default: `~/.status-backend/data` — contains keys, DB, and Waku state.

## Notes

- Always connect to `/signals` WebSocket FIRST before login to catch the `node.login` signal
- After login, call `wakuext_startMessenger` and `wallet_startWallet`
- Call `settings_getSettings` once after login (workaround for settings persistence)
- The API mirrors `mobile/status.go` — check source for undocumented methods
- Port 21405 is arbitrary; use any free port
