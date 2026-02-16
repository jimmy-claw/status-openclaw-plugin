# Code Review: @openclaw/status Plugin

**Reviewer:** Jimmy (AI agent)  
**Date:** 2026-02-16  
**Commit:** Initial review of full repository

---

## 1. Current State of Implementation

### What Works
- **Plugin structure** is complete and follows OpenClaw's ChannelPlugin interface correctly
- **Inbound message polling** via `wakuext_chatMessages` every 15s — the reliable path
- **Outbound messaging** via `wakuext_sendOneToOneMessage`
- **WebSocket signal listener** with exponential backoff reconnection
- **Health checking** and startup flow (waits for backend readiness)
- **Deduplication** via seen message IDs + per-chat timestamp tracking
- **Group chat support** — detects chatType 3, tags messages with group name
- **Config schema** via Zod with proper defaults
- **Wallet module** — comprehensive RPC wrapper for balances, tokens, transactions, ENS
- **Helper scripts** — login, watch, ctl, WS daemon all functional
- **Systemd services** — proper unit files for backend, login, and daemon
- **Extensive documentation** — BUILD.md, KNOWN-ISSUES.md, WALLET-INTEGRATION.md, LIVESTREAM-SCRIPT.md

### What's Stubbed or Incomplete
- **`pairing.notifyApproval`** — empty async function (comment says "could send a Status message")
- **Media support** — `capabilities.media` is `false`; no image/file handling
- **Wallet is not wired into the channel plugin** — `src/wallet/` is a standalone module, not integrated into command handling or the channel flow
- **No `!command` parsing** — the livestream script describes `!balance`, `!tip`, `!signers` but none are implemented
- **No governance system** — the planned signer/approval flow from LIVESTREAM-SCRIPT.md doesn't exist yet
- **Router-based transactions** — `wallet_suggestedRoutesAsync` flow not implemented
- **NFT/collectible support** — documented but not coded
- **Multi-account support** — types support it but `listStatusAccountIds` only ever returns one account

---

## 2. Code Quality Assessment

### Strengths
- **Clean TypeScript** — proper type annotations, interfaces, async/await throughout
- **Good separation of concerns** — api, signals, types, config, runtime, wallet each in their own files
- **Defensive coding** — try/catch blocks around poll operations, fallback to enqueue if system event fails, null coalescing everywhere
- **Smart dual-mode inbound** — WS + polling simultaneously handles the known WebSocket instability on arm64
- **Seed-on-start pattern** — pre-populates seenMessages from recent history to avoid replaying old messages
- **Well-documented workarounds** — KNOWN-ISSUES.md is excellent for operational context

### Issues

#### Moderate
1. **Wallet module has a hardcoded password** — `DEFAULT_PASSWORD` in `send.ts` defaults to `"jimmy-claw-2026"`. Should read from account config, not env/hardcode.

2. **Wallet RPC client is independent** — `src/wallet/rpc.ts` has its own `callRPC` that uses a module-level `STATUS_BACKEND_URL` env var. Meanwhile `src/status-api.ts` has another `callRPC` that takes a port parameter. Two separate RPC clients for the same backend — should be unified.

3. **`seenMessages` Set grows unbounded** — no eviction. Over days/weeks of continuous operation, this will consume increasing memory. Should cap at N entries (the Python daemon does this at 500).

4. **`z.number().default(21405).optional()`** in config-schema.ts — the `.default()` before `.optional()` is redundant/confusing with Zod. If optional, the default won't apply when undefined. Should be `.optional().default(21405)` or just `.default(21405)`.

5. **`callRPC` in status-api.ts double-parses response** — the fetch returns JSON, then checks for `json.error`. But status-backend sometimes returns double-encoded JSON (acknowledged in wallet/rpc.ts which handles it). The main callRPC doesn't handle this case.

#### Minor
6. **`messageId: \`status-${Date.now()}\``** in outbound.sendText — fabricated message ID. Should return the actual message ID from the RPC response.

7. **Type assertions** — heavy use of `as any` throughout channel.ts (15+ occurrences). The message/chat types from the API should be properly typed.

8. **No error handling in `sendOneToOneMessage`** outbound path — if the RPC fails, the error propagates raw to OpenClaw.

9. **`chatInfoCache` never cleared** — another memory growth vector, though slower.

10. **Hardcoded paths** in systemd units and scripts reference `/home/vpavlin/` — not portable.

---

## 3. What's Needed for Production-Ready

### Must Have
1. **Unify RPC clients** — single callRPC that takes port, used by both channel and wallet
2. **Cap seenMessages** — evict oldest entries when exceeding a threshold (e.g., 5000)
3. **Wire wallet into channel** — command parser in handleMsg for `!balance`, `!tip`, etc.
4. **Remove hardcoded credentials** — wallet password should come from config, not source
5. **Proper message typing** — define interfaces for status-go message/chat response shapes
6. **Error handling for outbound** — wrap sendOneToOneMessage with user-friendly error messages
7. **Tests** — zero test files currently. At minimum: unit tests for types.ts resolution, config schema validation, message deduplication logic

### Should Have
8. **Media support** — at least image forwarding (status-go has `chat_sendImages`)
9. **Reply-to threading** — `responseTo` field support for governance voting UX
10. **Rate limiting** — both inbound (flood protection) and outbound (don't spam)
11. **Graceful seenMessages persistence** — save to disk on stop, reload on start (like the Python daemon)
12. **Health endpoint for the plugin itself** — expose connection status, poll count, last message time

### Nice to Have
13. **Multi-account** — the types support it but the resolution logic is single-account
14. **Contact name resolution** — show display names instead of pubkey hashes
15. **Emoji reaction support** — `wakuext_emojiReactionsByChatID` for governance voting

---

## 4. Bugs & Issues

1. **Zod schema bug** — `z.number().default(21405).optional()` will produce `number | undefined` but the default won't fire when the value is `undefined` (Zod v4 applies defaults before optional). Behavior depends on Zod version — with zod@4.3.6 (listed in package.json), this may work differently. Needs testing.

2. **Race condition in poll loop** — `handleMsg` is async but called in a for-loop without await-per-message sequencing. If two messages from the same chat arrive, the system event calls could race. Currently mitigated by the seenMessages check, but the event ordering isn't guaranteed.

3. **`startAccount` never catches its own errors** — if `getActiveChats` or `getChatMessages` throw during the seed phase, the error is silently swallowed (the `catch {}` block). But if `getSettings` throws, it only warns. Inconsistent error handling.

4. **WebSocket + polling duplicate window** — a message could arrive via WS, get processed, then appear in the next poll cycle. The seenMessages set prevents duplicate processing, but the set check happens before `handleMsg` in the WS path (inside `onSignal`) but inside `handleMsg` for the poll path. If WS processes a message between the poll's `getChatMessages` call and its `handleMsg` call, the dedup works correctly — but only by accident.

5. **`pollStopped` flag isn't respected in the interval callback** — `setInterval` fires the callback, which checks `pollStopped`, but there's a race between `stop()` setting `pollStopped = true` and an in-flight `pollMessages()`. Should use `clearInterval` alone (which it does) and make pollMessages check an AbortSignal.

---

## 5. Comparison with Nostr Plugin Pattern

Without access to the actual OpenClaw Nostr plugin source, I'm comparing against what this plugin claims to follow and the OpenClaw plugin SDK interfaces it imports:

### Alignment
- **Plugin registration** (`register` → `api.registerChannel`) — correct pattern
- **ChannelPlugin interface** — all required sections present (meta, capabilities, config, pairing, security, outbound, status, gateway)
- **Config schema** — uses `buildChannelConfigSchema` wrapper correctly
- **Runtime management** — follows the `setRuntime`/`getRuntime` pattern
- **Account resolution** — `listAccountIds`, `resolveAccount`, `defaultAccountId` all present

### Differences / Gaps
- **No `inbound` handler** — Nostr plugins likely define an `inbound` section for message processing. This plugin uses system events (`openclaw system event --mode now`) as a workaround to inject messages. This is a significant architectural deviation — messages bypass the normal channel inbound pipeline.
- **No `formatInbound`** — the plugin constructs its own `[Status DM from ...]` prefix format. A proper channel plugin would have the framework format inbound messages.
- **`deliveryMode: "direct"`** — correct for 1:1 messaging, but group chat support would need different handling.
- **No reconnection lifecycle** — the Nostr plugin likely has relay connection state management. This plugin manages it ad-hoc in `startAccount`.

### The System Event Workaround
The biggest architectural concern: instead of using OpenClaw's channel inbound pipeline, messages are injected via:
```ts
runtime.system.runCommandWithTimeout(
  ["openclaw", "system", "event", "--text", eventText, "--mode", "now"],
  { timeoutMs: 10_000 }
);
```
This means:
- Messages don't go through OpenClaw's DM policy enforcement
- No proper sender attribution (just a text prefix)
- No reply routing — the agent can't easily reply back to the Status sender
- The `allowFrom` config is defined but never checked against incoming messages

This is the #1 thing to fix for proper integration. The plugin needs to use whatever inbound message callback the SDK provides (likely `ctx.onMessage` or similar).

---

## 6. Wallet Module Review (`src/wallet/`)

### Structure (6 files, ~450 lines)
- **`types.ts`** — Clean type definitions, good coverage of status-go wallet API shapes
- **`rpc.ts`** — Standalone RPC client with double-JSON parsing (correct for status-backend)
- **`balances.ts`** — Balance fetching with best-effort response parsing. `flattenBalances` is fragile — response shape isn't well-known
- **`tokens.ts`** — Token lookup with in-memory cache. Clean API.
- **`send.ts`** — Full build→sign→send flow. Correct API sequence per WALLET-INTEGRATION.md.
- **`index.ts`** — Clean re-export barrel file

### Issues
1. **Hardcoded password** (`jimmy-claw-2026`) — security concern
2. **No connection to channel plugin** — wallet is dead code until command routing is added
3. **`ethToWeiHex` precision** — uses `Math.round(parseFloat(ethAmount) * 1e18)` which loses precision for large values due to float64 limitations. Should use BigInt string parsing.
4. **No confirmation flow** — `sendTransaction` executes immediately with no user confirmation step
5. **No testnet safety** — no guard against accidentally sending on mainnet
6. **`rpcIdCounter`** resets on module reload — minor, IDs don't need to be globally unique for status-backend

### What's Good
- The build→sign→send flow correctly matches status-go's API (buildTransaction returns messageToSign, which is signed separately, then sent with signature)
- ENS resolution is properly integrated
- Token cache with force-refresh option is sensible
- Type exports are comprehensive

---

## 7. Summary

**Overall:** This is a solid **alpha-quality** plugin with good architecture, excellent documentation, and working core messaging. The main gaps are:

1. **Inbound messages bypass the channel SDK pipeline** (system event workaround)
2. **Wallet module exists but isn't connected** to message handling
3. **No tests**
4. **Hardcoded credentials** in wallet module
5. **Memory management** for long-running operation

The documentation (BUILD.md, KNOWN-ISSUES.md, WALLET-INTEGRATION.md) is unusually thorough and represents significant operational knowledge. The livestream script shows a clear vision for where this is headed.

**Estimated effort to production-ready:** 2-3 focused days for core fixes (#1-4 above), plus ongoing work for wallet commands, governance, and testing.
