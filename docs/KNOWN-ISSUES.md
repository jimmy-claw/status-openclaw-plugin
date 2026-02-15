# Known Issues & Troubleshooting

## 1. SIGSEGV Crashes on arm64 (Raspberry Pi)

**Severity:** High  
**Affects:** status-backend on aarch64/arm64 (Pi 5)

### Symptoms
- status-backend crashes with `signal 11 (SEGV)` periodically
- Crashes can happen during startup or randomly after running for 30-60 min
- Journal shows: `Main process exited, code=killed, status=11/SEGV`

### Cause
A bug in status-go (or its go-sqlcipher dependency) on arm64. The binary was built from source with GCC 14 patches for go-sqlcipher, but segfaults persist.

### Impact
- After crash + auto-restart, Waku peers are lost
- Messages sent during downtime are not automatically fetched
- Status app shows the node as "Offline"

### Workaround
The login script (`scripts/status-login.sh`) includes:
1. Wait for backend health check
2. Initialize + Login
3. Start messenger with delay for peer discovery  
4. **Call `wakuext_requestAllHistoricMessages`** to fetch missed messages from Waku store nodes
5. Start wallet service

systemd auto-restarts status-backend on crash (`Restart=on-failure`), which triggers status-login to re-run the full sequence.

### Manual Recovery
If messages aren't arriving after a crash:
```bash
# Check if backend is running
sudo systemctl status status-backend

# Check for recent crashes
sudo journalctl -u status-backend --since "30 min ago" | grep SEGV

# Force re-login
sudo systemctl restart status-login

# Or manually request historic messages
curl -s -X POST http://127.0.0.1:21405/statusgo/CallRPC \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"wakuext_requestAllHistoricMessages","params":[],"id":1}'
```

---

## 2. WebSocket Signal Stream Instability

**Severity:** Medium  
**Affects:** Real-time message delivery via WebSocket

### Symptoms
- WebSocket to `ws://127.0.0.1:21405/signals` disconnects every ~30 seconds
- Error: `ConnectionClosedError: sent 1011 (internal error) keepalive ping timeout`
- Messages arriving during reconnection gaps are missed

### Cause
status-backend's WebSocket endpoint doesn't respond to ping/pong frames properly on arm64.

### Solution
**Switched to polling-based message daemon** (`status-poll-daemon.py`) which checks for new messages via `wakuext_chatMessages` every 10 seconds. More reliable than WebSocket.

```bash
# The poll daemon runs as a systemd service
sudo systemctl status status-poll-daemon

# Restart if needed
sudo systemctl restart status-poll-daemon
```

---

## 3. RPC Provider Configuration Required

**Severity:** High (blocks all wallet operations)  
**Affects:** Wallet balance queries, transactions, token discovery

### Symptoms
- `wallet_buildTransaction` fails with: `could not find any enabled RPC providers for chain: <id>`
- `wallet_fetchOrGetCachedWalletBalances` returns `{}`
- Token discovery fails

### Cause
status-go ships with **no RPC providers configured** by default. The embedded Infura/Alchemy keys are not included in self-built binaries.

### Solution
Configure RPC providers via `wallet_setChainUserRpcProviders`:
```bash
curl -s -X POST http://127.0.0.1:21405/statusgo/CallRPC \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "method":"wallet_setChainUserRpcProviders",
    "params":[11155111, [{
      "chainId": 11155111,
      "name": "PublicNode Sepolia",
      "url": "https://ethereum-sepolia-rpc.publicnode.com",
      "type": "user",
      "enabled": true,
      "authType": "no-auth"
    }]],
    "id":1
  }'
```

**Important:** After changing RPC providers, restart status-backend for changes to take full effect. The RPC client caches provider connections.

### Currently Configured Providers
| Chain | ChainID | Provider |
|-------|---------|----------|
| Ethereum | 1 | eth.llamarpc.com |
| Optimism | 10 | mainnet.optimism.io |
| Arbitrum | 42161 | arb1.arbitrum.io/rpc |
| Base | 8453 | mainnet.base.org |
| Sepolia | 11155111 | 1rpc.io/sepolia, publicnode.com |

---

## 4. Media Server Port Changes on Restart

**Severity:** Low  
**Affects:** Image message URLs

### Symptoms
- Image URLs like `https://localhost:42595/messages/images?messageId=...` stop working
- After restart, port changes (e.g., 42595 → 42007)

### Cause
status-go's internal media server binds to a random available port on each startup.

### Solution
Always fetch the image URL from the message's `image` field — it contains the current port. Don't cache/hardcode the port.

---

## 5. Slow Waku Peer Discovery After Restart

**Severity:** Medium  
**Affects:** Message delivery latency after restart

### Symptoms
- After restart, no messages received for 1-15 minutes
- Status app shows node as "Offline"
- `wakuext_chatMessages` returns stale data

### Cause
Waku peer discovery via discv5 takes time. Store node connections need to be re-established.

### Solution
1. The login script waits 15s after messenger start for peer discovery
2. `requestAllHistoricMessages` fetches from store nodes even before relay peers connect
3. If still no messages after 5 min, manually call `requestAllHistoricMessages`

---

## Service Architecture

```
systemd services:
├── status-backend.service      # Core process (auto-restarts on crash)
├── status-login.service        # One-shot: Init → Login → Messenger → Historic fetch
└── status-poll-daemon.service  # Polling message listener (replaces WS daemon)

Files:
├── /usr/local/bin/status-backend
├── ~/.openclaw/workspace/scripts/status-login.sh
├── ~/.openclaw/workspace/skills/status-messenger/scripts/status-poll-daemon.py
└── ~/.status-backend/
    ├── data/           # status-go database
    ├── inbox.jsonl     # Incoming messages for OpenClaw
    └── seen_msgs.json  # Deduplication state
```
