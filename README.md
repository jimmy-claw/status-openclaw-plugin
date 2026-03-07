# @openclaw/status — Status Messenger Plugin for OpenClaw

An OpenClaw channel plugin that integrates [Status](https://status.app) messenger via the `status-backend` local HTTP API.

## Overview

This extension adds Status messenger as a channel to OpenClaw. It enables your bot to:

- Receive Status DMs via polling (`wakuext_chatMessages`)
- Send replies via `wakuext_sendOneToOneMessage`
- Connect to the decentralized Waku network through a local `status-backend` process
- Integrate with OpenClaw's pairing, allowlist, and access-control systems

## Prerequisites

- **`status-backend` binary** — see [BUILD.md](BUILD.md) for build instructions (including ARM64/Raspberry Pi)
- A running OpenClaw gateway
- `systemd` (optional, recommended for auto-start)

## Installation

### From npm (when published)

```bash
openclaw plugins install @openclaw/status
```

### Local path install

```bash
# Run the install script
bash /path/to/openclaw-status/extras/scripts/install.sh
```

Or manually:

```bash
cd /path/to/openclaw-status
mkdir -p node_modules
ln -sf $(npm root -g)/openclaw node_modules/openclaw
npm install
```

## Configuration

Add `channels.status` to your OpenClaw config (`openclaw.json` or `config.yaml`):

```json
{
  "channels": {
    "status": {
      "port": 21405,
      "keyUID": "0x...",
      "password": "your-password",
      "dataDir": "~/.status-backend/data",
      "dmPolicy": "pairing",
      "allowFrom": []
    }
  }
}
```

### Configuration Reference

| Key        | Type     | Default                    | Description                                                |
| ---------- | -------- | -------------------------- | ---------------------------------------------------------- |
| `port`     | number   | `21405`                    | HTTP port of the status-backend API                        |
| `keyUID`   | string   | required                   | Key UID of your Status account (hex string)                |
| `password` | string   | required                   | Account password                                           |
| `dataDir`  | string   | `~/.status-backend/data`   | Path to the status-backend data directory                  |
| `dmPolicy` | string   | `"pairing"`                | Access control: `pairing`, `allowlist`, `open`, `disabled` |
| `allowFrom`| string[] | `[]`                       | Allowed sender public keys (for allowlist policy)          |
| `enabled`  | boolean  | `true`                     | Enable/disable the channel                                 |
| `name`     | string   | -                          | Optional display label for the account                     |

## Running

### 1. Start status-backend

```bash
# Manually
/usr/local/bin/status-backend &

# Or via systemd
sudo systemctl start status-backend
```

### 2. Login and initialize

```bash
# Run the login script (initializes app, logs in, starts messenger)
bash extras/scripts/status-login.sh

# Or via systemd (auto-runs after status-backend starts)
sudo systemctl enable status-login
sudo systemctl start status-login
```

### 3. Install systemd services (recommended)

```bash
sudo cp extras/systemd/status-backend.service /etc/systemd/system/
sudo cp extras/systemd/status-login.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable status-backend status-login
sudo systemctl start status-backend
# status-login starts automatically after status-backend
```

### 4. Start the OpenClaw gateway

```bash
openclaw gateway start
```

## Access Control

### DM Policies

- **pairing** (default): Unknown senders receive a pairing code to request access
- **allowlist**: Only public keys in `allowFrom` can message the bot
- **open**: Anyone can message the bot (use with caution)
- **disabled**: DMs are disabled

### Example: Allowlist Mode

```json
{
  "channels": {
    "status": {
      "keyUID": "0x...",
      "password": "...",
      "dmPolicy": "allowlist",
      "allowFrom": ["0x04abc...pubkey..."]
    }
  }
}
```

## Architecture

```
Status Network (Waku)
    ↕
status-backend (HTTP + WS on 127.0.0.1:21405)
    ↕
@openclaw/status plugin (TypeScript)
    ↕
OpenClaw Gateway (agent sessions)
```

## Files

```
├── index.ts                 # Plugin entry point
├── openclaw.plugin.json     # Plugin manifest
├── package.json
├── tsconfig.json
├── src/
│   ├── channel.ts           # ChannelPlugin implementation
│   ├── config-schema.ts     # Zod config schema
│   ├── runtime.ts           # Runtime state
│   ├── status-api.ts        # status-backend HTTP API wrapper
│   ├── status-signals.ts    # WebSocket signal handler
│   └── types.ts             # TypeScript types
├── extras/
│   ├── scripts/             # Helper scripts (login, watch, ctl, install)
│   ├── skill/               # OpenClaw skill docs
│   └── systemd/             # Systemd service units
├── docs/                    # Additional documentation
└── BUILD.md                 # Building status-backend on ARM64
```

## Troubleshooting

See [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md) for a full list of known issues including:

- SIGSEGV crashes on ARM64 (Raspberry Pi)
- WebSocket signal stream instability
- RPC provider configuration for wallet features
- Slow Waku peer discovery after restart

## Current Status

- ✅ Plugin loads and connects
- ✅ Inbound DM polling works
- ✅ Outbound messaging works
- ✅ OpenClaw pairing/allowlist access control
- ⚠️ Community features blocked by Waku peer discovery on ARM64
- ⚠️ Periodic SIGSEGV crashes on ARM64 (auto-restart handles it)

## License

MIT
