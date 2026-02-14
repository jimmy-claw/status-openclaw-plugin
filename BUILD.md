# Building status-backend on ARM64 (Raspberry Pi 5)

Full log of building the `status-backend` binary from `status-im/status-go` on a Raspberry Pi 5 (arm64, Debian/Ubuntu). No prebuilt arm64 binaries exist.

## Prerequisites

- Go 1.22+ (from official Go downloads — apt version is too old)
- GCC 14 (default on recent Debian/Ubuntu)
- Nim 2.2.4 (built from source — choosenim doesn't support arm64)
- Git, Make, pkg-config
- ~4GB disk space for build artifacts

## Key Issues & Fixes

### 1. /tmp is tmpfs (4GB) — Not Enough for Build

The Pi's `/tmp` is a 4GB tmpfs. The status-go build generates several GB of artifacts.

**Fix:** Build on real disk:
```bash
mkdir -p ~/build
cd ~/build
git clone https://github.com/status-im/status-go.git
cd status-go
```

### 2. Nim Not Available for ARM64

`choosenim` (Nim's installer) doesn't have prebuilt arm64 binaries.

**Fix:** Build Nim from source:
```bash
cd ~/build
git clone https://github.com/nim-lang/Nim.git
cd Nim
git checkout v2.2.4
sh build_all.sh
export PATH=$HOME/build/Nim/bin:$PATH
```

### 3. go-sqlcipher Fails with GCC 14 on ARM64

`go-sqlcipher` (a dependency) uses inline assembly with the `+crypto` ARM feature suffix. GCC 14 changed how this is specified on ARM64.

**Error:**
```
/home/vpavlin/go/pkg/mod/github.com/nicowaisman/go-sqlcipher@v1.0.1/cipher.c: Assembler messages:
Error: invalid feature modifier '+crypto' in target
```

**Fix:** Patch the Go module cache directly:
```bash
# Find the cached module
SQLCIPHER_DIR=$(find ~/go/pkg/mod -path "*/go-sqlcipher*" -name "cipher.c" -exec dirname {} \;)

# Make it writable (Go module cache is read-only)
chmod -R u+w "$SQLCIPHER_DIR"

# Replace +crypto with +aes+sha2 (GCC 14 ARM64 syntax)
find "$SQLCIPHER_DIR" -name "*.c" -exec sed -i 's/+crypto/+aes+sha2/g' {} \;
find "$SQLCIPHER_DIR" -name "*.h" -exec sed -i 's/+crypto/+aes+sha2/g' {} \;
```

### 4. libwaku / RLN Build Issues

Building with full Waku (nwaku/libwaku) requires Nim + Rust + many deps and is extremely slow on ARM64.

**Fix:** Build with `gowaku_no_rln` tag to skip RLN and use the Go-native Waku:
```bash
go build -tags gowaku_no_rln -o status-backend ./cmd/status-backend/
```

### 5. Building libsds.so (Status Data Store)

The `libsds.so` shared library is needed at runtime:
```bash
cd ~/build/status-go
# Find the sds module
go build -tags gowaku_no_rln -buildmode=c-shared -o libsds.so ./lib/
sudo cp libsds.so /usr/local/lib/
sudo ldconfig
```

## Full Build Steps

```bash
# 1. Clone
cd ~/build
git clone https://github.com/status-im/status-go.git
cd status-go

# 2. Apply go-sqlcipher patch (see above)

# 3. Build status-backend
go build -tags gowaku_no_rln -o status-backend ./cmd/status-backend/

# 4. Build libsds.so
go build -tags gowaku_no_rln -buildmode=c-shared -o libsds.so ./lib/

# 5. Install
sudo cp status-backend /usr/local/bin/
sudo cp libsds.so /usr/local/lib/
sudo ldconfig
```

Result: `status-backend` binary (~107MB)

## Running

### Systemd Service

`/etc/systemd/system/status-backend.service`:
```ini
[Unit]
Description=Status Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=vpavlin
ExecStart=/usr/local/bin/status-backend --address 127.0.0.1 --port 21405
Restart=always
RestartSec=5
Environment=LD_LIBRARY_PATH=/usr/local/lib

[Install]
WantedBy=multi-user.target
```

### Login Bootstrap Service

`/etc/systemd/system/status-login.service` (oneshot, runs after backend):
```ini
[Unit]
Description=Status Backend Login Bootstrap
After=status-backend.service
Requires=status-backend.service

[Service]
Type=oneshot
User=vpavlin
ExecStart=/home/vpavlin/.openclaw/workspace/scripts/status-login.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

The login script handles: `InitializeApplication` → `LoginAccount` → `wakuext_startMessenger`

## Runtime Quirks

### IPv4 vs IPv6
status-backend binds to `127.0.0.1` (IPv4 only). On this Pi, `localhost` resolves to `::1` (IPv6). **Always use `127.0.0.1` explicitly** in API calls.

### startMessenger Hangs
`wakuext_startMessenger` blocks for 30-120 seconds on ARM64 while Waku bootstraps. It MUST be called (without it, `wakuext_chats` returns null), but don't await it inline — fire and forget or use a separate service.

### SIGSEGV Crashes
Periodic segfaults on ARM64 (likely Go runtime + CGo + ARM64 edge case). systemd `Restart=always` handles recovery. Not frequent enough to be a blocker.

### Waku Peer Discovery
After `startMessenger` returns, chat data may still be null for additional time while Waku finds peers. 1:1 DMs work relatively quickly (route by pubkey), but community features (`fetchCommunity`) may hang indefinitely on resource-constrained devices.

### Chat DB Initialization
Even after `startMessenger` completes:
- `settings_getSettings` works immediately after login
- `wakuext_chats` may return null for 1-5 minutes
- `wakuext_sendOneToOneMessage` works once chats become available

## API Quick Reference

- **REST:** `http://127.0.0.1:21405/statusgo/<Method>` (POST, JSON body)
- **JSON-RPC:** `http://127.0.0.1:21405/statusgo/CallRPC` (standard JSON-RPC 2.0)
- **WebSocket:** `ws://127.0.0.1:21405/signals` (real-time signal stream)

### Key Methods
```
InitializeApplication    — first call, sets data dir
CreateAccount            — create new account
LoginAccount             — login with keyUID + password
wakuext_startMessenger   — start Waku messaging (slow!)
wakuext_chats            — list all chats
wakuext_chatMessages     — get messages for a chat
wakuext_sendOneToOneMessage — send DM
wakuext_sendContactRequest — send contact request
settings_getSettings     — get account settings
```
