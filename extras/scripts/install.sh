#!/bin/bash
# Install @openclaw/status plugin locally
# Run from anywhere

PLUGIN_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
echo "Installing @openclaw/status from $PLUGIN_DIR"

# Symlink openclaw (peer dep)
mkdir -p "$PLUGIN_DIR/node_modules"
if [ ! -e "$PLUGIN_DIR/node_modules/openclaw" ]; then
  OPENCLAW_PATH=$(npm root -g)/openclaw
  ln -sf "$OPENCLAW_PATH" "$PLUGIN_DIR/node_modules/openclaw"
  echo "Linked openclaw from $OPENCLAW_PATH"
fi

cd "$PLUGIN_DIR"
npm install
echo "Done! Add to your openclaw config:"
echo '  channels:'
echo '    status:'
echo '      port: 21405'
echo '      keyUID: <your-key-uid>'
echo '      password: <your-password>'
