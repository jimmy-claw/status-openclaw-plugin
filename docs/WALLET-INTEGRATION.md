# Status Wallet Integration Plan for OpenClaw Plugin

> **Date:** 2026-02-15  
> **Status:** Validated against live status-backend  
> **Wallet Address:** `0xB554044cF92D94485DaA6f558451E892A39ee829`  
> **Source:** `/home/vpavlin/build/status-go` (commit used for API reference)

---

## 1. Architecture Overview

```
Status Wallet (status-go)
    │
    ├── wallet service (JSON-RPC namespace: "wallet")
    │   ├── Balance queries
    │   ├── Token management (12,385 tokens in registry!)
    │   ├── Transaction building & signing
    │   ├── Router (smart send/swap/bridge)
    │   ├── NFT / Collectibles
    │   ├── Activity history
    │   └── WalletConnect support
    │
    ├── accounts service (JSON-RPC namespace: "accounts")
    │   └── Account/address management
    │
    └── Chain RPC (proxied through status-go)
        └── Requires configured RPC providers per chain
```

All calls go through `POST http://127.0.0.1:21405/statusgo/CallRPC`.

---

## 2. Prerequisites: RPC Provider Configuration

**Critical discovery:** Status-go ships with NO RPC providers configured by default. Without them, all balance queries and transactions fail with:
```
"could not find any enabled RPC providers for chain: <chainId>"
```

### Setting Up RPC Providers

Use `wallet_setChainUserRpcProviders` to add public/private RPC endpoints:

```json
{
  "jsonrpc": "2.0",
  "method": "wallet_setChainUserRpcProviders",
  "params": [11155111, [{
    "chainId": 11155111,
    "name": "Sepolia Public",
    "url": "https://rpc.sepolia.org",
    "type": "user",
    "enabled": true,
    "authType": "no-auth",
    "enableRpsLimiter": false
  }]],
  "id": 1
}
```
**Response:** `{"result": null}` (success)

### RpcProvider Structure (from `params/network_config.go:31`)
```go
type RpcProvider struct {
    ID               int64            // Auto-increment (sorting)
    ChainID          uint64           // Chain ID
    Name             string           // Provider name
    URL              string           // RPC endpoint URL
    EnableRPSLimiter bool             // Rate limiting
    Type             string           // "embedded-proxy" | "embedded-direct" | "user"
    Enabled          bool
    AuthType         string           // "no-auth" | "basic-auth" | "token-auth"
    AuthLogin        string           // For basic-auth
    AuthPassword     string           // For basic-auth
    AuthToken        string           // For token-auth (appended to URL)
}
```

### Recommended Public RPC Providers (Already Configured)

| Chain | ChainID | RPC URL | Status |
|-------|---------|---------|--------|
| Ethereum | 1 | `https://eth.llamarpc.com` | ✅ Set |
| Optimism | 10 | `https://mainnet.optimism.io` | ✅ Set |
| Arbitrum | 42161 | `https://arb1.arbitrum.io/rpc` | ✅ Set |
| Base | 8453 | `https://mainnet.base.org` | ✅ Set |
| Sepolia | 11155111 | `https://rpc.sepolia.org` | ✅ Set |
| BSC | 56 | TODO | ❌ |
| Op Sepolia | 11155420 | TODO | ❌ |
| Base Sepolia | 84532 | TODO | ❌ |
| Arb Sepolia | 421614 | TODO | ❌ |
| Status Net Sepolia | 1660990954 | TODO | ❌ |

---

## 3. Accounts & Addresses

### Get Wallet Accounts
```json
{"method": "accounts_getAccounts", "params": []}
```

**Live Response:**
```json
[
  {
    "address": "0x73fa3b588A2EA6d8Eef34369Aa64dBB781427127",
    "wallet": false, "chat": true,
    "type": "generated",
    "path": "m/43'/60'/1581'/0'/0",
    "name": ""
  },
  {
    "address": "0xB554044cF92D94485DaA6f558451E892A39ee829",
    "wallet": true, "chat": false,
    "type": "generated",
    "path": "m/44'/60'/0'/0/0",
    "name": "Account 1",
    "prodPreferredChainIds": "1:10:42161:8453",
    "testPreferredChainIds": "11155111:11155420:421614:84532:1660990954"
  }
]
```

- **Chat key address:** `0x73fa3b588...` (used for messaging, m/43' derivation)
- **Wallet address:** `0xB554044cf...` (used for funds, m/44' derivation)

---

## 4. Supported Chains

### `wallet_getEthereumChains` ✅ Verified

Returns paired Prod/Test networks:

| Prod Chain | ChainID | Test Chain | ChainID | Layer |
|-----------|---------|-----------|---------|-------|
| Ethereum | 1 | Sepolia | 11155111 | L1 |
| Optimism | 10 | Op Sepolia | 11155420 | L2 |
| BSC | 56 | BSC Testnet | 97 | L1 |
| Base | 8453 | Base Sepolia | 84532 | L2 |
| Arbitrum | 42161 | Arb Sepolia | 421614 | L2 |
| Linea | 59144 | Linea Sepolia | 59141 | L2 |
| — | — | Status Net Sepolia | 1660990954 | L2 |

---

## 5. Token Management

### `wallet_getAllTokens` ✅ Verified
Returns **12,385 tokens** across all chains. Token structure:
```json
{
  "crossChainId": "status",
  "chainId": 10,
  "address": "0x650af3c15af43dcb218406d30784416d64cfb6b2",
  "decimals": 18,
  "name": "Status",
  "symbol": "SNT",
  "logoUri": "https://assets.coingecko.com/coins/images/779/thumb/status.png",
  "custom": false
}
```

### `wallet_getTokensForActiveNetworksMode` ✅ Verified
Same as above but filtered to active networks.

### `wallet_getMandatoryTokenKeys` ✅ Verified
Returns token keys (format: `chainId-address`) that are always tracked:
```
"59144-0x0000000000000000000000000000000000000000"  (Linea ETH)
"8453-0x0000000000000000000000000000000000000000"   (Base ETH)
"1-0x0000000000000000000000000000000000000000"      (ETH)
...
```

### `wallet_discoverToken(chainID, address)` 
Discover a custom token by contract address. Requires RPC provider for that chain.

### Other Token Methods
- `wallet_getTokenByChainAddress(chainID, address)` — lookup single token
- `wallet_getTokensByChain(chainID)` — all tokens on a chain
- `wallet_getTokensByKeys(keys[])` — batch lookup by key

---

## 6. Balance Queries

### `wallet_fetchOrGetCachedWalletBalances(addresses[], forceRefresh)`
```json
{"method": "wallet_fetchOrGetCachedWalletBalances", 
 "params": [["0xB554044cF92D94485DaA6f558451E892A39ee829"], true]}
```
**Current result:** `{}` (empty — wallet has no funds yet)

Returns `map[address][]StorageToken` — tokens with balances per address.

### `wallet_getBalancesByChain(addresses[], tokenKeys[])`
```json
{"method": "wallet_getBalancesByChain",
 "params": [["0xB554044cF92D94485DaA6f558451E892A39ee829"], []]}
```
Returns `map[chainID]map[address]map[tokenAddress]balance`.

---

## 7. Transaction Building & Sending

### Simple Flow: BuildTransaction + SendTransactionWithSignature

#### 7.1 Build Transaction
```json
{"method": "wallet_buildTransaction",
 "params": [11155111, "{\"from\":\"0xB554044cF92D94485DaA6f558451E892A39ee829\",\"to\":\"0xTARGET\",\"value\":\"0x2386F26FC10000\"}"]}
```
**Note:** Second param is a JSON *string* (stringified SendTxArgs), not an object!

**SendTxArgs structure** (from `wallettypes/types.go:49`):
```go
type SendTxArgs struct {
    From                 Address     `json:"from"`
    To                   *Address    `json:"to"`
    Gas                  *Uint64     `json:"gas"`
    GasPrice             *Big        `json:"gasPrice"`
    Value                *Big        `json:"value"`
    Nonce                *Uint64     `json:"nonce"`
    MaxFeePerGas         *Big        `json:"maxFeePerGas"`
    MaxPriorityFeePerGas *Big        `json:"maxPriorityFeePerGas"`
    Input                HexBytes    `json:"input"`
    Data                 HexBytes    `json:"data"`
    // V1 extensions:
    FromChainID          uint64      `json:"fromChainID"`
    ToChainID            uint64      `json:"toChainID"`
    ValueIn              *Big        `json:"valueIn"`
    ValueOut             *Big        `json:"valueOut"`
    FromToken            *Token      `json:"fromToken"`
    ToToken              *Token      `json:"toToken"`
    SlippagePercentage   float32     `json:"slippagePercentage"`
}
```

#### 7.2 Sign Message
```json
{"method": "wallet_signMessage",
 "params": ["0x<32-byte-hash>", "0xB554044cF92D94485DaA6f558451E892A39ee829", "jimmy-claw-2026"]}
```
**Verified:** Works (error was "hash must be 32 bytes" — correct validation).

#### 7.3 Send with Signature
```json
{"method": "wallet_sendTransactionWithSignature",
 "params": [11155111, "transfer", "{...sendTxArgs...}", "<hex-signature>"]}
```

### Advanced: Router Flow (Recommended)

The router finds optimal paths for sends, swaps, and bridges across chains.

#### Send Types (from `router/sendtype/send_type.go`)
```go
Transfer                = 0   // Simple ETH/token transfer
ENSRegister             = 1
ENSRelease              = 2
ENSSetPubKey            = 3
StickersBuy             = 4
Bridge                  = 5
ERC721Transfer          = 6
ERC1155Transfer         = 7
Swap                    = 8
CommunityBurn           = 9
CommunityDeployAssets   = 10
CommunityDeployCollectibles = 11
CommunityDeployOwnerToken   = 12
CommunityMintTokens     = 13
CommunityRemoteBurn     = 14
CommunitySetSignerPubKey = 15
```

#### RouteInputParams (from `requests/router_input_params.go:46`)
```go
type RouteInputParams struct {
    Uuid               string         `json:"uuid"`
    SendType           SendType       `json:"sendType"`       // See enum above
    AddrFrom           Address        `json:"addrFrom"`
    AddrTo             Address        `json:"addrTo"`
    AmountIn           *Big           `json:"amountIn"`       // In wei (hex)
    AmountOut          *Big           `json:"amountOut"`      // For swaps
    TokenKey           string         `json:"tokenKey"`       // e.g. "ETH"
    ToTokenKey         string         `json:"toTokenKey"`     // For swaps
    FromChainID        uint64         `json:"fromChainID"`
    ToChainID          uint64         `json:"toChainID"`
    GasFeeMode         GasFeeMode     `json:"gasFeeMode"`    // 0=low, 1=medium, 2=high
    SlippagePercentage float32        `json:"slippagePercentage"`
    TestnetMode        bool
}
```

#### Step 1: Calculate Routes (Async — sends result via WebSocket signal)
```json
{"method": "wallet_suggestedRoutesAsync",
 "params": [{
    "uuid": "my-send-001",
    "sendType": 0,
    "addrFrom": "0xB554044cF92D94485DaA6f558451E892A39ee829",
    "addrTo": "0xTARGET",
    "amountIn": "0x2386F26FC10000",
    "tokenKey": "ETH",
    "toTokenKey": "ETH",
    "fromChainID": 11155111,
    "toChainID": 11155111,
    "gasFeeMode": 1
 }]}
```

#### Step 2: Build Transactions from Route
```json
{"method": "wallet_buildTransactionsFromRoute", "params": ["my-send-001"]}
```

#### Step 3: Send with Signatures
```json
{"method": "wallet_sendRouterTransactionsWithSignatures",
 "params": [{"uuid": "my-send-001", "signatures": {...}}]}
```

---

## 8. Signing

| Method | Params | Use Case |
|--------|--------|----------|
| `wallet_signMessage` | `(hash, address, password)` | Sign 32-byte hash |
| `wallet_signTypedDataV4` | `(typedJson, address, password)` | EIP-712 signing |
| `wallet_safeSignTypedDataForDApps` | `(typedJson, address, password, chainID, legacy)` | DApp signing |
| `wallet_hashMessageEIP191` | `(message)` | Hash for personal_sign |

---

## 9. NFTs / Collectibles

| Method | Description |
|--------|-------------|
| `wallet_getOwnedCollectiblesAsync(requestID, chainIDs[], addresses[], filter, offset, limit, dataType, fetchCriteria)` | Fetch owned NFTs |
| `wallet_getCollectiblesByUniqueIDAsync(requestID, uniqueIDs[], dataType)` | Fetch specific NFTs |
| `wallet_searchCollectibles(chainID, text, cursor, limit, providerID)` | Search NFTs |
| `wallet_getCollectibleOwnership(id)` | Check NFT ownership |
| `wallet_refetchOwnedCollectibles()` | Refresh NFT cache |

---

## 10. Activity / Transaction History

| Method | Description |
|--------|-------------|
| `wallet_startActivityFilterSessionV2(addresses[], chainIDs[], filter, firstPageCount)` | Start filtered activity session |
| `wallet_getMoreForActivityFilterSession(sessionID)` | Get next page |
| `wallet_stopActivityFilterSession(sessionID)` | Clean up |
| `wallet_getPendingTransactions()` | Get pending txs |
| `wallet_getTransactionEstimatedTime(chainID, maxFeePerGas)` | ETA for tx |

---

## 11. Other Features

### On-Ramps
- `wallet_getCryptoOnRamps()` — Returns `[]` (no on-ramps configured)
- `wallet_getCryptoOnRampURL(providerID, params)` — Get buy-crypto URL

### WalletConnect
- `wallet_addWalletConnectSession(sessionJson)`
- `wallet_disconnectWalletConnectSession(topic)`
- `wallet_getWalletConnectActiveSessions(validAtTimestamp)`
- `wallet_getWalletConnectDapps(validAtTimestamp, testChains)`

### ENS
- Available via router with sendType 1-3

### Chain Management
- `wallet_setChainActive(chainID, active)` — Toggle chain availability
- `wallet_setChainEnabled(chainID, enabled)` — Toggle chain in UI
- `wallet_addEthereumChain(network)` — Add custom chain
- `wallet_deleteEthereumChain(chainID)` — Remove chain

---

## 12. Security Considerations

### Password Handling
- Password (`jimmy-claw-2026`) needed for: `signMessage`, `signTypedDataV4`, `sendTransactionWithSignature`, router send
- status-go decrypts the keystore, signs, and re-locks — private keys never leave the process
- **Plugin must:** Store password in env var (`STATUS_WALLET_PASSWORD`), never in source or logs

### Plugin Safety Rules
1. **Always confirm before sending** — show tx details, amount, recipient, fees
2. **Amount limits** — configurable max-send per tx (e.g., 0.1 ETH default)
3. **Address validation** — checksum validation via `wallet_isChecksumValidForAddress`
4. **Testnet default** — start in testnet mode, require explicit switch to mainnet
5. **Rate limiting** — max N transactions per hour

---

## 13. Implementation Plan

### Phase 1: Infrastructure (RPC Providers + Balance)
- [ ] Auto-configure RPC providers on plugin startup
- [ ] `getBalance()` — fetch and display balances across active chains
- [ ] `getTokens()` — list tokens for address
- [ ] `getChains()` — show active chains
- [ ] Format output for Telegram (no markdown tables)

### Phase 2: Simple Send
- [ ] Parse natural language: "send 0.01 ETH to 0x..."
- [ ] Build transaction via `wallet_buildTransaction`
- [ ] Confirmation flow with inline buttons
- [ ] Sign and send via `wallet_sendTransactionWithSignature`
- [ ] Return tx hash + explorer link

### Phase 3: Router Integration
- [ ] Connect to WebSocket for async route results
- [ ] `wallet_suggestedRoutesAsync` → display route options
- [ ] Build and send via router flow
- [ ] Support swap (sendType 8) and bridge (sendType 5)

### Phase 4: Custom Tokens & $JIMMY
- [ ] `wallet_discoverToken` for custom token lookup
- [ ] Token balance display
- [ ] Token send support
- [ ] $JIMMY token integration (see below)

### Phase 5: Advanced
- [ ] NFT display and transfer
- [ ] Transaction history
- [ ] WalletConnect pairing
- [ ] ENS registration

### Proposed File Structure
```
src/
├── wallet/
│   ├── rpc.ts           # Wallet RPC client (reuse status-api.ts pattern)
│   ├── providers.ts     # RPC provider auto-configuration
│   ├── balances.ts      # Balance queries & formatting
│   ├── send.ts          # Simple send flow
│   ├── router.ts        # Router-based send/swap/bridge
│   ├── tokens.ts        # Token management & discovery
│   ├── signing.ts       # Message signing utilities
│   └── types.ts         # TypeScript types for wallet API
```

---

## 14. $JIMMY Token

### Status
- People created a $JIMMY token (ref: https://x.com/i/status/2022934884411674802)
- Need to find: chain, contract address, decimals
- Once found: use `wallet_discoverToken(chainID, contractAddress)` to register

### Integration Steps
1. Find contract address from tweet/chain explorers
2. Register via `wallet_discoverToken`
3. Add to plugin's default tracked tokens
4. Enable balance display and transfers
5. If listed on DEX → enable swap via router (sendType 8)

---

## 15. Testing Checklist

### Prerequisites
- [x] Configure RPC providers (Ethereum, Sepolia, Base, Optimism, Arbitrum)
- [ ] Configure remaining testnet RPC providers
- [ ] Get Sepolia ETH from faucet → `0xB554044cF92D94485DaA6f558451E892A39ee829`

### Read-Only Tests
- [x] `wallet_startWallet` → `null` ✅
- [x] `wallet_getEthereumChains` → 7 chain pairs ✅
- [x] `wallet_getAllTokens` → 12,385 tokens ✅
- [x] `wallet_getMandatoryTokenKeys` → token key list ✅
- [x] `wallet_getPendingTransactions` → `null` (no pending) ✅
- [x] `accounts_getAccounts` → 2 accounts (chat + wallet) ✅
- [x] `wallet_setChainUserRpcProviders` → configured 5 chains ✅
- [ ] `wallet_fetchOrGetCachedWalletBalances` → needs funds to validate

### Transaction Tests (Need Sepolia ETH)
- [ ] `wallet_buildTransaction` on Sepolia
- [ ] `wallet_signMessage` with valid 32-byte hash
- [ ] `wallet_sendTransactionWithSignature` — send 0.001 ETH to self
- [ ] `wallet_suggestedRoutesAsync` — test router
- [ ] Full router send flow

---

## Appendix: Quick Test Script

```bash
#!/bin/bash
BACKEND="http://127.0.0.1:21405/statusgo/CallRPC"
WALLET="0xB554044cF92D94485DaA6f558451E892A39ee829"

rpc() {
  curl -s -X POST "$BACKEND" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$1\",\"params\":$2,\"id\":1}"
}

echo "=== Start Wallet ==="
rpc "wallet_startWallet" "[]"

echo -e "\n=== Chains ==="
rpc "wallet_getEthereumChains" "[]" | python3 -m json.tool

echo -e "\n=== Balances ==="
rpc "wallet_fetchOrGetCachedWalletBalances" "[[\"$WALLET\"], true]" | python3 -m json.tool

echo -e "\n=== Pending Txs ==="
rpc "wallet_getPendingTransactions" "[]" | python3 -m json.tool
```
