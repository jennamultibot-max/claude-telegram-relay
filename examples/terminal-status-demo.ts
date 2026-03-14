#!/usr/bin/env bun
/**
 * Terminal Status Bar Demo
 *
 * Run this to see the status bar in action:
 * bun run examples/terminal-status-demo.ts
 */

import { TerminalStatusBar, getTerminalStatusBar } from "../src/status-terminal.ts";

console.log("Starting Cloud Coach Terminal Status Bar Demo");
console.log("Press Ctrl+C to stop\n");

// Start the status bar
const statusBar = new TerminalStatusBar("claude-sonnet-4-6");
statusBar.start(500); // Update every 500ms

// Simulate activity over time
const activities = [
  { input: 500, output: 300, delay: 2000 },
  { input: 1200, output: 800, delay: 4000 },
  { input: 3000, output: 2000, delay: 6000 },
  { input: 1500, output: 1000, delay: 8000 },
  { input: 800, output: 400, delay: 10000 },
];

// Print detailed status at intervals
setInterval(() => {
  statusBar.printDetailedStatus();
}, 5000);

// Simulate requests
for (const activity of activities) {
  setTimeout(() => {
    statusBar.updateTokens(activity.input, activity.output);
    statusBar.recordRequest();
    console.log(`\n✓ Request processed: ${activity.input + activity.output} tokens`);
  }, activity.delay);
}

// Keep running
process.on("SIGINT", () => {
  statusBar.stop();
  console.log("\n\nFinal Status:");
  statusBar.printDetailedStatus();
  process.exit(0);
});
