/**
 * Terminal Status Bar for Cloud Coach
 *
 * A real-time status bar that lives in your terminal.
 * Shows tokens, model, and context usage as you work.
 *
 * Usage in your relay:
 * import { TerminalStatusBar } from './status-terminal.ts';
 * const termBar = new TerminalStatusBar();
 * termBar.start();
 */

import { StatusBar, getStatusBar, trackTokens, trackRequest } from "./status-bar.ts";

/**
 * Terminal-based status bar that updates in place
 */
export class TerminalStatusBar {
  private statusBar: StatusBar;
  private updateInterval: NodeJS.Timeout | null = null;
  private lastStatusLine: string = "";
  private isRunning: boolean = false;

  constructor(model?: string) {
    this.statusBar = new StatusBar(model);
  }

  /**
   * Start the terminal status bar
   */
  start(updateIntervalMs: number = 1000): void {
    if (this.isRunning) {
      return; // Already running
    }
    this.isRunning = true;

    // Initial render
    this.render();

    // Set up interval
    this.updateInterval = setInterval(() => {
      this.render();
    }, updateIntervalMs);

    // Clean up on exit
    process.on("exit", () => this.stop());
    process.on("SIGINT", () => {
      this.stop();
      process.exit(0);
    });
  }

  /**
   * Stop the status bar
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Clear the status line
    this.clearStatusLine();
  }

  /**
   * Update the status line in terminal
   */
  private render(): void {
    const line = this.getStatusLine();

    // Only update if content changed
    if (line === this.lastStatusLine) {
      return;
    }

    this.clearStatusLine();
    process.stdout.write(`\r${line}`);
    this.lastStatusLine = line;
  }

  /**
   * Clear the current status line
   */
  private clearStatusLine(): void {
    process.stdout.write("\r" + " ".repeat(this.lastStatusLine.length) + "\r");
  }

  /**
   * Get the status line string
   */
  private getStatusLine(): string {
    const metrics = this.statusBar.getMetrics();
    const limits = this.statusBar.getModelLimits();
    const contextUsage = this.statusBar.getContextUsage();
    const duration = this.statusBar.getSessionDuration();
    const cost = this.statusBar.getEstimatedCost().toFixed(4);

    const modelName = limits?.name || metrics.model;

    // Color codes for terminal (if supported)
    const reset = "\x1b[0m";
    const dim = "\x1b[2m";
    const green = "\x1b[32m";
    const blue = "\x1b[34m";
    const yellow = "\x1b[33m";

    return `${dim}━━━${reset} ${blue}🤖${reset} ${modelName} ${dim}|${reset} ${green}📊${reset} ${metrics.totalTokens.toLocaleString()} tokens (${contextUsage.toFixed(1)}%) ${dim}|${reset} ${yellow}⏱️${reset} ${duration} ${dim}|${reset} 💰 $${cost} ${dim}━━━${reset}`;
  }

  /**
   * Record activity
   */
  updateTokens(input: number, output: number): void {
    this.statusBar.updateTokens(input, output);
    this.render();
  }

  recordRequest(): void {
    this.statusBar.recordRequest();
    this.render();
  }

  setModel(model: string): void {
    this.statusBar.setModel(model);
    this.render();
  }

  /**
   * Print detailed status (clears status line first)
   */
  printDetailedStatus(): void {
    this.clearStatusLine();

    const metrics = this.statusBar.getMetrics();
    const limits = this.statusBar.getModelLimits();
    const contextUsage = this.statusBar.getContextUsage();
    const duration = this.statusBar.getSessionDuration();
    const cost = this.statusBar.getEstimatedCost();
    const costFormatted = cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`;

    const modelName = limits?.name || metrics.model;

    console.log(`
${"━".repeat(60)}
📊 CLOUD COACH STATUS
${"━".repeat(60)}
🤖 Modelo:      ${modelName}
📊 Tokens:      ${metrics.inputTokens.toLocaleString()} input + ${metrics.outputTokens.toLocaleString()} output = ${metrics.totalTokens.toLocaleString()} total
📏 Contexto:    ${contextUsage.toFixed(1)}% / 100%
⏱️ Sesión:      ${duration} (${metrics.requests} requests)
💰 Costo est.:  ${costFormatted}
${"━".repeat(60)}
`.trim());

    this.render(); // Re-render status line
  }
}

/**
 * Global singleton for terminal status bar
 */
let globalTerminalStatusBar: TerminalStatusBar | null = null;

export function getTerminalStatusBar(model?: string): TerminalStatusBar {
  if (!globalTerminalStatusBar) {
    globalTerminalStatusBar = new TerminalStatusBar(model);
  }
  return globalTerminalStatusBar;
}

/**
 * Quick access functions
 */
export function startTerminalStatus(model?: string): void {
  const bar = getTerminalStatusBar(model);
  bar.start();
}

export function stopTerminalStatus(): void {
  const bar = getTerminalStatusBar();
  bar.stop();
}

export function trackTerminalTokens(input: number, output: number): void {
  const bar = getTerminalStatusBar();
  bar.updateTokens(input, output);
}

export function trackTerminalRequest(): void {
  const bar = getTerminalStatusBar();
  bar.recordRequest();
}

export function setTerminalModel(model: string): void {
  const bar = getTerminalStatusBar();
  bar.setModel(model);
}

export function printTerminalStatus(): void {
  const bar = getTerminalStatusBar();
  bar.printDetailedStatus();
}
