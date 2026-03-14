/**
 * Example: Using the Status Bar in your application
 *
 * This demonstrates how to integrate the status bar into Cloud Coach
 */

import { StatusBar, getStatusBar, trackTokens, trackRequest, printStatus } from "../src/status-bar.ts";

// Example 1: Basic usage
console.log("Example 1: Basic Status Bar");
console.log("=".repeat(50));

const statusBar = new StatusBar("claude-sonnet-4-6");
statusBar.start(1000); // Update every second

// Simulate some activity
setTimeout(() => {
  trackTokens(500, 300);
  trackRequest();
}, 2000);

setTimeout(() => {
  trackTokens(1200, 800);
  trackRequest();
}, 4000);

setTimeout(() => {
  printStatus();
}, 6000);

// Example 2: Using the global singleton
console.log("\n\nExample 2: Global Singleton");
console.log("=".repeat(50));

const globalBar = getStatusBar("claude-opus-4-6");
globalBar.start(2000);

setTimeout(() => {
  trackTokens(3000, 2000);
  trackRequest();
}, 1000);

setTimeout(() => {
  printStatus();
}, 3000);

// Example 3: Custom rendering
console.log("\n\nExample 3: Custom Rendering");
console.log("=".repeat(50));

const customBar = new StatusBar("claude-haiku-4-5-20251001");
customBar.start(500, (metrics) => {
  // Custom update callback
  const line = `⚡ ${metrics.model} | 📊 ${metrics.totalTokens.toLocaleString()} tokens`;
  // In a real app, this would update your UI
  if (metrics.totalTokens > 0) {
    console.log(line);
  }
});

setTimeout(() => {
  trackTokens(100, 50);
  trackRequest();
}, 1000);

// Stop after 5 seconds
setTimeout(() => {
  customBar.stop();
  printStatus();
}, 5000);
