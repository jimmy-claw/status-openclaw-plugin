# 🎬 Livestream Script: AI Agent with a Community-Governed Wallet

**Date:** 2026-02-16
**Duration:** ~2.5 hours
**Participants:** Václav (vpavlin) + Jimmy (AI agent) + audience
**Platform:** Status group chat "chair, Jimmy-Claw" + stream
**Network:** Sepolia testnet

---

## 🎯 The Pitch

"An AI agent that lives in your group chat, has its own wallet, and needs community permission to spend money."

We vibecode a governance-gated wallet bot on top of Status messenger — real transactions, real votes, real drama.

---

## 📋 Pre-Stream Checklist

- [ ] status-backend running on Pi5 (port 21405)
- [ ] OpenClaw gateway running with Status plugin
- [ ] Jimmy's wallet funded on Sepolia (`0xB554044cF92D94485DaA6f558451E892A39ee829`)
- [ ] Group chat working (DMs + group both functional)
- [ ] vpavlin.eth resolvable on Sepolia
- [ ] Stream/recording set up

---

## Act 1: Intro & Warm-up (0:00 - 0:30)

### Show & Tell — What We've Built So Far
1. **Demo the current setup:**
   - Show Status group chat with Jimmy
   - Send a message, Jimmy responds
   - Show it running on a Raspberry Pi 5
2. **Explain the stack:**
   - Status app → Waku network → status-backend (HTTP API) → OpenClaw plugin → AI agent
   - "Jimmy lives in your group chat and can read/write messages"
3. **Show the wallet:**
   - `!balance` (we'll implement this first as a quick win)
   - Show the Sepolia balance on Etherscan

### Quick Win: Implement `!balance`
```
Goal: When someone types !balance, Jimmy replies with his Sepolia ETH balance
RPC: wallet_getWalletToken or eth_getBalance via wallet APIs
Time: ~15 minutes
```

**Steps:**
1. Create `src/commands/` directory in the plugin
2. Parse incoming messages for `!` prefix
3. Call wallet RPC to get balance
4. Reply in the group chat

---

## Act 2: The Tip Command (0:30 - 1:15)

### Implement `!tip @user amount`

**Steps:**
1. Parse the command: extract recipient pubkey from @mention, amount
2. Resolve recipient's wallet address (from Status profile or ENS)
3. Build the transaction via status-go RPCs:
   - `wallet_buildTransactions` or direct `eth_sendTransaction`
4. Sign and send on Sepolia
5. Reply with tx hash + Etherscan link

**Key RPCs:**
- `wallet_getWalletToken` — check balance first
- `wallet_buildTransactionsFromRoute` — build tx
- `wallet_signMessage` — sign
- `wallet_sendTransactionWithSignature` — broadcast

**Test:** Václav types `!tip @jimmy 0.001` and we watch the tx go through live.

---

## Act 3: Governance — The Fun Part (1:15 - 2:00)

### Implement Signer System

**State file:** `wallet-governance.json`
```json
{
  "signers": ["0x040d7ae...", "0x043d3f3..."],
  "threshold": 1,
  "maxAutoApprove": 0.01,
  "pendingTxs": {}
}
```

**Steps:**
1. **Add signer management:**
   - `!add-signer @user` (only existing signers can add)
   - `!remove-signer @user`
   - `!signers` — list current signers

2. **Implement approval flow:**
   - Tips ≤ `maxAutoApprove` → auto-send
   - Tips > threshold → create pending tx, post approval request
   - Signers reply to the pending tx message with `APPROVE` or `REJECT`
   - Use `responseTo` field to match approval to specific pending tx
   - When enough approvals (threshold met) → execute tx

3. **Implement the voting UX:**
   ```
   User:    !tip @vpavlin 0.05
   Jimmy:   🔔 Pending Tx #abc123
            Tip 0.05 ETH → vpavlin.eth
            Need 1/2 signer approvals.
            Reply to this message: APPROVE or REJECT
   
   Chair:   APPROVE  (reply to Jimmy's message)
   
   Jimmy:   ✅ Tx #abc123 approved by Chair!
            Sending 0.05 ETH → vpavlin.eth...
            ✅ Confirmed! tx: 0xdef456...
            https://sepolia.etherscan.io/tx/0xdef456...
   ```

**Test:** Have the stream audience become signers and vote on a real transaction.

---

## Act 4: Polish & Stretch Goals (2:00 - 2:30)

Pick based on time remaining:

### Option A: `!history` command
- Show recent transactions from Jimmy's wallet
- `wallet_activity_filterAllActivityAsync`

### Option B: Rate limiting
- Max tips per hour per user
- Daily spending cap

### Option C: `!config` command
- Change threshold, max auto-approve from chat
- Requires all signers to agree

### Option D: Emoji reactions for voting
- Check `wakuext_emojiReactionsByChatID`
- 👍 = approve, 👎 = reject
- Stretch goal — text voting is the safe path

---

## 🏗 Architecture

```
Status Group Chat
    ↓ (Waku)
status-backend (Pi5, port 21405)
    ↓ (WebSocket + HTTP poll)
OpenClaw Status Plugin
    ↓ (system event --mode now)
Jimmy (AI Agent)
    ↓ (parses ! commands)
Command Handler
    ├── !balance → wallet RPC → reply
    ├── !tip → governance check → pending/auto-send → reply
    ├── APPROVE/REJECT (reply-to) → tally votes → execute → reply
    └── !signers → list → reply
```

---

## 📁 Files We'll Create/Modify

```
plugins/openclaw-status/
├── src/
│   ├── channel.ts          (existing — message handling)
│   ├── wallet/             (existing — 6 files, 613 lines)
│   ├── commands/
│   │   ├── index.ts        (command parser + router)
│   │   ├── balance.ts      (!balance)
│   │   ├── tip.ts          (!tip with governance)
│   │   ├── signers.ts      (!add-signer, !remove-signer, !signers)
│   │   └── governance.ts   (approval tracking, vote counting)
│   └── state/
│       └── governance.json (signers, pending txs, config)
```

---

## 🎤 Talking Points for Stream

- "We're building an AI agent that lives in Status messenger and has its own crypto wallet"
- "But we don't want a rogue AI spending money — so we add community governance"
- "Anyone can request a tip, but signers need to approve it — like a social multisig"
- "All built on top of status-go RPCs — no Status core modifications"
- "Running on a Raspberry Pi 5 — this is truly decentralized infrastructure"
- "The replies use message threading so you can vote on specific transactions"

---

## ⚠️ Known Risks

1. **status-go wallet RPCs might need configuration** — we may need to set up RPC providers via `wallet_setChainUserRpcProviders` for Sepolia
2. **Transaction signing flow** — buildTransaction → signMessage → sendTransactionWithSignature chain might have gotchas
3. **Sepolia balance** — currently ~0.1 ETH, enough for many test txs
4. **status-backend stability** — periodic SIGSEGV crashes on arm64, have restart script ready

---

## 🎉 Success Criteria

- [ ] `!balance` shows real Sepolia balance
- [ ] `!tip` sends a real transaction (with tx hash proof)
- [ ] Signer approval flow works via reply-to threading
- [ ] At least one audience member becomes a signer and votes
- [ ] No major crashes during stream 🤞
