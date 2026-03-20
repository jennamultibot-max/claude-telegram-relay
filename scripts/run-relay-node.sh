#!/bin/bash
# Wrapper script for telegram relay using Node.js instead of Bun
cd /Users/german/seconbrain/claude-telegram-relay
exec node --import "dotenv/config" src/relay.ts
