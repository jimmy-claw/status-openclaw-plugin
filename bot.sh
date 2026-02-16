#!/bin/bash
# Simple command bot — watches Status inbox and handles !commands
# Runs as a loop, checks inbox every 2 seconds

INBOX="$HOME/.status-backend/inbox.jsonl"
STATUS_RPC="http://127.0.0.1:21405/statusgo/CallRPC"
WALLET="0xB554044cF92D94485DaA6f558451E892A39ee829"
SEPOLIA_RPC="https://ethereum-sepolia-rpc.publicnode.com"
VACLAV_PUBKEY="0x040d7ae79c51ec0513f81dfee7fbde365c53e6dea359ab107594cb8ef4a6f9794c5c8a1a7fc348a8cd6ac16332922555ddf98be147ba293dc74343f4070595b6a8"

send_status_msg() {
  local to="$1"
  local msg="$2"
  curl -s -X POST "$STATUS_RPC" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"wakuext_sendOneToOneMessage\",\"params\":[{\"id\":\"$to\",\"message\":\"$msg\"}],\"id\":1}" > /dev/null
}

handle_balance() {
  local addr="${1:-$WALLET}"
  local result
  result=$(curl -s -X POST "$SEPOLIA_RPC" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$addr\",\"latest\"]}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); w=int(d['result'],16); print(f'{w/1e18:.6f}')")
  echo "💰 Wallet Balance\nAddress: $addr\nChain: Sepolia (testnet)\nBalance: $result ETH"
}

echo "🦞 Jimmy's wallet bot started — watching $INBOX"

while true; do
  if [ -s "$INBOX" ]; then
    # Process each line
    while IFS= read -r line; do
      msg=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('text',''))" 2>/dev/null)
      sender=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('from',''))" 2>/dev/null)
      
      if [ -z "$msg" ]; then continue; fi
      
      # Check for commands
      case "$msg" in
        '!balance'*)
          args=$(echo "$msg" | sed 's/^!balance\s*//')
          response=$(handle_balance "$args")
          echo "[$(date)] !balance from $sender -> $response"
          send_status_msg "$sender" "$response"
          ;;
        '!help'*)
          response="🦞 Jimmy's Wallet Bot Commands:\n\n!balance [address] - Check Sepolia ETH balance\n!help - Show this message\n\nComing soon: !tip, !send, !signers"
          send_status_msg "$sender" "$response"
          ;;
        *)
          # Not a command, skip (let OpenClaw handle normal messages)
          ;;
      esac
    done < "$INBOX"
    
    # Clear processed messages
    > "$INBOX"
  fi
  sleep 2
done
