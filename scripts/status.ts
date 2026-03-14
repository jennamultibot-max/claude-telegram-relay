#!/usr/bin/env bun
/**
 * Cloud Coach Status Utility
 *
 * Usage:
 * bun run scripts/status.ts           # Show current status
 * bun run scripts/status.ts --reset   # Reset session metrics
 * bun run scripts/status.ts --json    # Export as JSON
 */

import { getStatusBar, printStatus } from "../src/status-bar.ts";

const args = process.argv.slice(2);

const statusBar = getStatusBar();

if (args.includes("--reset")) {
  statusBar.reset();
  console.log("✓ Session metrics reset");
  printStatus();
} else if (args.includes("--json")) {
  const metrics = statusBar.getMetrics();
  const limits = statusBar.getModelLimits();
  const data = {
    metrics,
    modelInfo: limits,
    contextUsage: statusBar.getContextUsage(),
    sessionDuration: statusBar.getSessionDuration(),
    estimatedCost: statusBar.getEstimatedCost(),
  };
  console.log(JSON.stringify(data, null, 2));
} else {
  printStatus();
}
