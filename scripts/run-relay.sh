#!/bin/bash
# Wrapper script for telegram relay - ensures working directory is set
cd /Users/german/seconbrain/claude-telegram-relay
exec /Users/german/.bun/bin/bun run src/relay.ts
