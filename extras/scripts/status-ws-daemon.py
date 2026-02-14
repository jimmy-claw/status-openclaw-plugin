#!/usr/bin/env python3
"""
status-ws-daemon.py — WebSocket listener for status-backend signals.
Monitors for new messages and triggers OpenClaw wake events.

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

# Try websockets, fall back to install hint
try:
    import websockets
except ImportError:
    print("ERROR: 'websockets' package required. Install: pip3 install --break-system-packages websockets", file=sys.stderr)
    sys.exit(1)

PORT = int(os.environ.get("STATUS_PORT", "21405"))
MY_PUBKEY = os.environ.get("STATUS_MY_PUBKEY", "")
STATE_DIR = Path(os.environ.get("STATUS_STATE_DIR", os.path.expanduser("~/.status-backend")))
INBOX_FILE = STATE_DIR / "inbox.jsonl"  # new messages appended here
NOTIFY_CMD = os.environ.get("STATUS_NOTIFY_CMD", "")  # optional command to run on new message

# OpenClaw wake integration
OPENCLAW_BIN = os.environ.get("OPENCLAW_BIN", "openclaw")
OPENCLAW_NOTIFY = False

def setup_my_pubkey():
    """Fetch our own public key from settings."""
    global MY_PUBKEY
    if MY_PUBKEY:
        return
    try:
        result = subprocess.run(
            ["curl", "-sf", "-X", "POST", f"http://localhost:{PORT}/statusgo/CallRPC",
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
    """Try to resolve a pubkey to a display name."""
    try:
        result = subprocess.run(
            ["curl", "-sf", "-X", "POST", f"http://localhost:{PORT}/statusgo/CallRPC",
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


def notify_openclaw(sender_name, message_text, chat_id):
    """Send a wake event to OpenClaw with the new message info."""
    wake_text = f"New Status message from {sender_name}: {message_text[:500]}"
    
    if OPENCLAW_NOTIFY:
        gateway_url = os.environ.get("OPENCLAW_GATEWAY_URL", "http://127.0.0.1:18789")
        gateway_token = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")
        
        try:
            import urllib.request
            req = urllib.request.Request(
                f"{gateway_url}/api/cron/wake",
                data=json.dumps({"text": wake_text, "mode": "now"}).encode(),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {gateway_token}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
                if result.get("ok"):
                    print(f"  → OpenClaw wake sent")
                else:
                    print(f"  → OpenClaw wake response: {result}")
        except Exception as e:
            print(f"  → OpenClaw wake failed: {e}", file=sys.stderr)

    if NOTIFY_CMD:
        try:
            subprocess.run(NOTIFY_CMD, shell=True, env={
                **os.environ,
                "STATUS_MSG_SENDER": sender_name,
                "STATUS_MSG_TEXT": message_text,
                "STATUS_MSG_CHAT": chat_id,
            }, timeout=10)
        except Exception as e:
            print(f"  → Notify command failed: {e}", file=sys.stderr)


def save_to_inbox(msg_data):
    """Append message to inbox file."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with open(INBOX_FILE, "a") as f:
        f.write(json.dumps(msg_data) + "\n")


def handle_message_signal(event):
    """Process a messages.new signal."""
    messages = event.get("messages", [])
    for msg in messages:
        sender = msg.get("from", "")
        # Skip our own messages
        if sender == MY_PUBKEY:
            continue

        text = msg.get("text", "")
        chat_id = msg.get("localChatID", "")
        msg_id = msg.get("id", "")
        timestamp = msg.get("whisperTimestamp", int(time.time() * 1000))
        content_type = msg.get("contentType", 1)

        # Only handle text messages (contentType 1)
        if content_type != 1 and content_type != 3:  # 1=text, 3=sticker
            continue

        sender_name = get_contact_name(sender)
        print(f"[{time.strftime('%H:%M:%S')}] {sender_name}: {text[:100]}")

        msg_data = {
            "from": sender,
            "fromName": sender_name,
            "text": text,
            "chatID": chat_id,
            "msgID": msg_id,
            "timestamp": timestamp,
            "receivedAt": int(time.time() * 1000),
        }
        save_to_inbox(msg_data)
        notify_openclaw(sender_name, text, chat_id)


async def listen_signals():
    """Connect to status-backend WebSocket and listen for signals."""
    uri = f"ws://localhost:{PORT}/signals"
    
    while True:
        try:
            print(f"Connecting to {uri}...")
            async with websockets.connect(uri, ping_interval=30, ping_timeout=10) as ws:
                print("Connected! Listening for signals...")
                
                async for raw in ws:
                    try:
                        signal = json.loads(raw)
                        sig_type = signal.get("type", "")
                        
                        if sig_type == "messages.new":
                            handle_message_signal(signal.get("event", {}))
                        elif sig_type == "message.delivered":
                            pass  # ignore delivery receipts
                        elif sig_type in ("node.login", "node.ready"):
                            print(f"Signal: {sig_type}")
                        # Uncomment for debugging all signals:
                        # else:
                        #     print(f"Signal: {sig_type}")
                    except json.JSONDecodeError:
                        pass
                    except Exception as e:
                        print(f"Error handling signal: {e}", file=sys.stderr)

        except websockets.exceptions.ConnectionClosed:
            print("WebSocket connection closed. Reconnecting in 5s...")
        except ConnectionRefusedError:
            print("Connection refused. Is status-backend running? Retrying in 10s...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"WebSocket error: {e}. Reconnecting in 5s...")
        
        await asyncio.sleep(5)


def main():
    global PORT, OPENCLAW_NOTIFY

    parser = argparse.ArgumentParser(description="Status WebSocket signal listener")
    parser.add_argument("--port", type=int, default=PORT, help="status-backend port")
    parser.add_argument("--openclaw-notify", action="store_true", help="Send OpenClaw wake events on new messages")
    args = parser.parse_args()

    PORT = args.port
    OPENCLAW_NOTIFY = args.openclaw_notify

    setup_my_pubkey()
    
    print(f"Status WebSocket Daemon")
    print(f"  Port: {PORT}")
    print(f"  Inbox: {INBOX_FILE}")
    print(f"  OpenClaw notify: {OPENCLAW_NOTIFY}")
    print()

    # Handle graceful shutdown
    loop = asyncio.new_event_loop()
    
    def shutdown(signum, frame):
        print("\nShutting down...")
        loop.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    loop.run_until_complete(listen_signals())


if __name__ == "__main__":
    main()
