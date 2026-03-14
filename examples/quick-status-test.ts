#!/usr/bin/env bun
/**
 * Quick test of the status bar
 */

import { StatusBar, trackTokens, trackRequest, printStatus } from "../src/status-bar.ts";

console.log("Testing Cloud Coach Status Bar...\n");

const statusBar = new StatusBar("claude-sonnet-4-6");
statusBar.start(1000);

// Simulate some activity
setTimeout(() => {
  trackTokens(1500, 800);
  trackRequest();
  console.log("✓ Activity recorded");
}, 1500);

setTimeout(() => {
  trackTokens(3200, 2100);
  trackRequest();
  console.log("✓ More activity recorded");
}, 3000);

setTimeout(() => {
  console.log("\nFinal Status:");
  printStatus();
  statusBar.stop();
  console.log("\n✓ Test complete!");
  process.exit(0);
}, 4500);
