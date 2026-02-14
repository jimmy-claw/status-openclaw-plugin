#!/usr/bin/env python3
"""
status-ws-daemon.py — WebSocket listener + polling fallback for status-backend.
Monitors for new messages via WS signals AND periodic API polling.
Triggers OpenClaw wake events on new messages.

Usage: python3 status-ws-daemon.py [--port 21405] [--openclaw-notify]
"""

import asyncio
import json
import os
import sys
import time
import signal
import argparse
import subprocess
from pathlib import Path

try:
    import websockets
except ImportError:
    print("ERROR: 'websockets' package required. Install: pip3 install --break-system-packages websockets", file=sys.stderr)
    sys.exit(1)

PORT = int(os.environ.get("STATUS_PORT", "21405"))
MY_PUBKEY = os.environ.get("STATUS_MY_PUBKEY", "")
STATE_DIR = Path(os.environ.get("STATUS_STATE_DIR", os.path.expanduser("~/.status-backend")))
INBOX_FILE = STATE_DIR / "inbox.jsonl"
SEEN_FILE = STATE_DIR / "seen_msgs.json"  # track seen message IDs
OPENCLAW_BIN = os.environ.get("OPENCLAW_BIN", "openclaw")
OPENCLAW_NOTIFY = False
POLL_INTERVAL = 10  # seconds between API polls

# Track seen message IDs to avoid duplicates
seen_msg_ids = set()

def load_seen():
    global seen_msg_ids
    try:
        if SEEN_FILE.exists():
            seen_msg_ids = set(json.loads(SEEN_FILE.read_text()))
            # Keep only last 500
            if len(seen_msg_ids) > 500:
                seen_msg_ids = set(list(seen_msg_ids)[-500:])
    except:
        seen_msg_ids = set()

def save_seen():
    try:
        SEEN_FILE.write_text(json.dumps(list(seen_msg_ids)[-500:]))
    except:
        pass

def setup_my_pubkey():
    global MY_PUBKEY
    if MY_PUBKEY:
        return
    try:
        result = subprocess.run(
            ["curl", "-sf", "-X", "POST", f"http://127.0.0.1:{PORT}/statusgo/CallRPC",
             "-H", "Content-Type: application/json",
             "-d", json.dumps({"jsonrpc": "2.0", "method": "settings_getSettings", "params": [], "id": 1})],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        MY_PUBKEY = data.get("result", {}).get("public-key", "")
        if MY_PUBKEY:
            print(f"My public key: {MY_PUBKEY[:20]}...")
    except Exception as e:
        print(f"Warning: Could not fetch public key: {e}", file=sys.stderr)


def get_contact_name(pubkey):
    try:
        result = subprocess.run(
            ["curl", "-sf", "-X", "POST", f"http://127.0.0.1:{PORT}/statusgo/CallRPC",
             "-H", "Content-Type: application/json",
             "-d", json.dumps({"jsonrpc": "2.0", "method": "wakuext_contacts", "params": [], "id": 1})],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        for contact in data.get("result", []):
            if contact.get("id") == pubkey:
                return contact.get("displayName", contact.get("name", pubkey[:16] + "..."))
    except:
        pass
    return pubkey[:16] + "..."


def notify_openclaw(sender_name, message_text, sender_pubkey):
    """Send a wake event to OpenClaw via CLI."""
    if not OPENCLAW_NOTIFY:
        return

    wake_text = f"[Status DM from {sender_pubkey[:12]}...] {message_text[:500]}"

    try:
        result = subprocess.run(
            [OPENCLAW_BIN, "system", "event", "--text", wake_text, "--mode", "now"],
            capture_output=True, text=True, timeout=15,
            env={**os.environ, "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")},
        )
        if result.returncode == 0:
            print(f"  → OpenClaw wake sent")
        else:
            print(f"  → OpenClaw wake failed (rc={result.returncode}): {result.stderr[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"  → OpenClaw wake failed: {e}", file=sys.stderr)


def save_to_inbox(msg_data):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with open(INBOX_FILE, "a") as f:
        f.write(json.dumps(msg_data) + "\n")


def process_message(sender, text, msg_id, timestamp, source="ws"):
    """Process a single inbound message. Returns True if new."""
    global seen_msg_ids

    if not msg_id or msg_id in seen_msg_ids:
        return False
    if sender == MY_PUBKEY:
        return False
    if not text:
        return False

    seen_msg_ids.add(msg_id)
    save_seen()

    sender_name = get_contact_name(sender)
    print(f"[{time.strftime('%H:%M:%S')}] [{source}] {sender_name}: {text[:100]}")

    msg_data = {
        "from": sender,
        "fromName": sender_name,
        "text": text,
        "chatID": "",
        "msgID": msg_id,
        "timestamp": timestamp,
        "receivedAt": int(time.time() * 1000),
    }
    save_to_inbox(msg_data)
    notify_openclaw(sender_name, text, sender)
    return True


def handle_ws_signal(event):
    """Process a messages.new WebSocket signal."""
    messages = event.get("messages", [])
    for msg in messages:
        sender = msg.get("from", "")
        text = msg.get("text", "")
        msg_id = msg.get("id", "")
        timestamp = msg.get("whisperTimestamp", int(time.time() * 1000))
        content_type = msg.get("contentType", 1)
        if content_type not in (1, 3):
            continue
        process_message(sender, text, msg_id, timestamp, source="ws")


def poll_messages():
    """Poll for recent messages via wakuext_chatMessages for known chats."""
    # Get list of chats
    try:
        result = subprocess.run(
            ["curl", "-sf", "-X", "POST", f"http://127.0.0.1:{PORT}/statusgo/CallRPC",
             "-H", "Content-Type: application/json",
             "-d", json.dumps({"jsonrpc": "2.0", "method": "wakuext_chats", "params": [], "id": 1})],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        chats = data.get("result") or []
    except Exception as e:
        print(f"[poll] Failed to get chats: {e}", file=sys.stderr)
        return

    new_count = 0
    for chat in chats:
        chat_id = chat.get("id", "")
        chat_type = chat.get("chatType", 0)
        if chat_type != 1:  # only 1:1 chats
            continue
        if chat_id == MY_PUBKEY:
            continue

        try:
            result = subprocess.run(
                ["curl", "-sf", "-X", "POST", f"http://127.0.0.1:{PORT}/statusgo/CallRPC",
                 "-H", "Content-Type: application/json",
                 "-d", json.dumps({"jsonrpc": "2.0", "method": "wakuext_chatMessages", "params": [chat_id, "", 10], "id": 1})],
                capture_output=True, text=True, timeout=10
            )
            data = json.loads(result.stdout)
            messages = (data.get("result") or {}).get("messages") or []
            for msg in messages:
                sender = msg.get("from", "")
                if msg.get("outgoingStatus"):
                    continue  # skip our own
                text = msg.get("text", "")
                msg_id = msg.get("id", "")
                timestamp = msg.get("whisperTimestamp", 0)
                content_type = msg.get("contentType", 1)
                if content_type not in (1, 3):
                    continue
                if process_message(sender, text, msg_id, timestamp, source="poll"):
                    new_count += 1
        except Exception as e:
            pass

    if new_count:
        print(f"[poll] Found {new_count} new message(s)")


async def ws_listener(uri):
    """WebSocket signal listener with auto-reconnect."""
    while True:
        try:
            print(f"WS: Connecting to {uri}...")
            async with websockets.connect(uri, ping_interval=15, ping_timeout=10, close_timeout=5) as ws:
                print("WS: Connected!")
                async for raw in ws:
                    try:
                        sig = json.loads(raw)
                        if sig.get("type") == "messages.new":
                            handle_ws_signal(sig.get("event", {}))
                    except:
                        pass
        except Exception as e:
            print(f"WS: {type(e).__name__}: {e}. Reconnecting in 3s...")
        await asyncio.sleep(3)


async def poll_loop():
    """Periodic API polling fallback."""
    await asyncio.sleep(5)  # initial delay
    while True:
        try:
            poll_messages()
        except Exception as e:
            print(f"[poll] Error: {e}", file=sys.stderr)
        await asyncio.sleep(POLL_INTERVAL)


async def main_async(uri):
    """Run WS listener and polling in parallel."""
    await asyncio.gather(
        ws_listener(uri),
        poll_loop(),
    )


def main():
    global PORT, OPENCLAW_NOTIFY

    parser = argparse.ArgumentParser(description="Status message listener (WS + polling)")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--openclaw-notify", action="store_true")
    args = parser.parse_args()

    PORT = args.port
    OPENCLAW_NOTIFY = args.openclaw_notify

    setup_my_pubkey()
    load_seen()

    uri = f"ws://127.0.0.1:{PORT}/signals"
    print(f"Status Message Daemon (WS + Polling)")
    print(f"  Port: {PORT}")
    print(f"  Inbox: {INBOX_FILE}")
    print(f"  Seen IDs: {len(seen_msg_ids)}")
    print(f"  OpenClaw notify: {OPENCLAW_NOTIFY}")
    print(f"  Poll interval: {POLL_INTERVAL}s")
    print()

    loop = asyncio.new_event_loop()

    def shutdown(signum, frame):
        print("\nShutting down...")
        save_seen()
        loop.stop()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    loop.run_until_complete(main_async(uri))


if __name__ == "__main__":
    main()
