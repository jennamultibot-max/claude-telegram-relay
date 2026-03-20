#!/bin/bash
# Start Claude Telegram Relay with correct environment

# Unset CLAUDECODE FIRST to allow nested Claude sessions
unset CLAUDECODE

cd "$(dirname "$0")"

# Add bun and claude to PATH
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$HOME/.local/bin:$PATH"

# Verify tools are available
echo "Checking requirements..."
if ! command -v bun &> /dev/null; then
    echo "Error: bun not found in PATH"
    exit 1
fi

if ! command -v claude &> /dev/null; then
    echo "Error: claude not found in PATH"
    exit 1
fi

echo "Starting Claude Telegram Relay..."
bun run src/relay.ts
