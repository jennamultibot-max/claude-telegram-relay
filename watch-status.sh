#!/bin/bash
# Watch Cloud Coach Status Bar
# Usage: ./watch-status.sh

LOG_FILE="$HOME/seconbrain/claude-telegram-relay/logs/com.claude.telegram-relay.log"

if [ ! -f "$LOG_FILE" ]; then
    echo "❌ Log file not found: $LOG_FILE"
    exit 1
fi

echo "📊 Watching Cloud Coach Status Bar..."
echo "Press Ctrl+C to stop"
echo ""

tail -f "$LOG_FILE"
