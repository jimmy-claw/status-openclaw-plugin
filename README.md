# @openclaw/status — Status Messenger Plugin for OpenClaw

An OpenClaw channel plugin that integrates [Status](https://status.app) messenger via the `status-backend` local HTTP API.

## What It Does

- **Receives** Status DMs via polling (`wakuext_chatMessages` every 15s)
- **Sends** replies via `wakuext_sendOneToOneMessage`
- **Connects** to WebSocket signal stream for real-time events
- **Integrates** with OpenClaw's channel plugin architecture (following the Nostr plugin pattern)

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
├── index.ts                 # Plugin entry point (register)
├── openclaw.plugin.json     # Plugin manifest
├── package.json
├── tsconfig.json
├── src/
│   ├── channel.ts           # ChannelPlugin implementation
│   ├── config-schema.ts     # Zod config schema
│   ├── runtime.ts           # Runtime state management
│   ├── status-api.ts        # status-backend HTTP API wrapper
│   ├── status-signals.ts    # WebSocket signal handler
│   └── types.ts             # TypeScript types
├── extras/
│   ├── scripts/             # Helper scripts (login, watch, ctl)
│   ├── skill/               # OpenClaw skill docs
│   └── systemd/             # Systemd service units
└── BUILD.md                 # Building status-backend on ARM64
```

## Setup

1. **Build `status-backend`** — see [BUILD.md](BUILD.md) for ARM64 instructions
2. **Install systemd services** from `extras/systemd/`
3. **Create a Status account** via the API
4. **Configure OpenClaw** — add `channels.status` to `openclaw.json`:

```json
{
  "channels": {
    "status": {
      "port": 21405,
      "keyUID": "0x...",
      "password": "...",
      "dataDir": "~/.status-backend/data",
      "dmPolicy": "allowlist",
      "allowFrom": ["0x04...pubkey..."]
    }
  }
}
```

5. **Install plugin** — symlink or copy to OpenClaw's plugin directory

## Current Status

- ✅ Plugin loads and connects
- ✅ Inbound DM polling works
- ✅ Outbound messaging works
- ✅ System event enqueueing works
- ⚠️ Auto-reply needs deeper OpenClaw SDK integration
- ⚠️ Community features blocked by Waku peer discovery on ARM64
- ⚠️ Periodic SIGSEGV crashes on ARM64 (auto-restart handles it)

## License

MIT
