/**
 * Global Status Bar for Cloud Coach
 *
 * Tracks session metrics:
 * - Tokens consumed
 * - Current model
 * - Context usage percentage
 *
 * Usage:
 * import { StatusBar } from './status-bar.ts';
 * const statusBar = new StatusBar();
 * statusBar.start();
 * statusBar.updateTokens(1500);
 */

export interface ModelLimits {
  name: string;
  maxTokens: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

const MODELS: Record<string, ModelLimits> = {
  "claude-opus-4-6": {
    name: "Opus 4.6",
    maxTokens: 200000,
    inputCostPer1M: 15,
    outputCostPer1M: 75,
  },
  "claude-sonnet-4-6": {
    name: "Sonnet 4.6",
    maxTokens: 200000,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  "claude-haiku-4-5-20251001": {
    name: "Haiku 4.5",
    maxTokens: 200000,
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
  },
  "glm-4.7": {
    name: "GLM 4.7",
    maxTokens: 200000,
    inputCostPer1M: 1,
    outputCostPer1M: 2,
  },
  "glm-4.5-air": {
    name: "GLM 4.5 Air",
    maxTokens: 200000,
    inputCostPer1M: 0.5,
    outputCostPer1M: 1,
  },
};

export interface SessionMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
  model: string;
  sessionStart: Date;
}

export class StatusBar {
  private metrics: SessionMetrics;
  private updateInterval: NodeJS.Timeout | null = null;
  private updateCallback: ((metrics: SessionMetrics) => void) | null = null;

  constructor(model: string = "claude-sonnet-4-6") {
    this.metrics = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      requests: 0,
      model,
      sessionStart: new Date(),
    };
  }

  /**
   * Start the status bar with automatic updates
   * @param updateIntervalMs - How often to update (default: 1000ms)
   * @param callback - Optional callback function for custom rendering
   */
  start(updateIntervalMs: number = 1000, callback?: (metrics: SessionMetrics) => void): void {
    this.updateCallback = callback || this.defaultUpdateCallback.bind(this);

    // Clear previous interval if exists
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Initial render
    this.render();

    // Set up interval
    this.updateInterval = setInterval(() => {
      this.render();
    }, updateIntervalMs);

    console.log(this.getStatusLine());
  }

  /**
   * Stop the status bar
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.render(); // Final render
  }

  /**
   * Update token counts
   */
  updateTokens(input: number, output: number): void {
    this.metrics.inputTokens += input;
    this.metrics.outputTokens += output;
    this.metrics.totalTokens += input + output;
    this.render();
  }

  /**
   * Record a new request
   */
  recordRequest(): void {
    this.metrics.requests++;
    this.render();
  }

  /**
   * Change the current model
   */
  setModel(model: string): void {
    this.metrics.model = model;
    this.render();
  }

  /**
   * Get current metrics
   */
  getMetrics(): SessionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get model limits
   */
  getModelLimits(): ModelLimits | null {
    return MODELS[this.metrics.model] || null;
  }

  /**
   * Calculate context usage percentage
   */
  getContextUsage(): number {
    const limits = this.getModelLimits();
    if (!limits) return 0;
    return (this.metrics.totalTokens / limits.maxTokens) * 100;
  }

  /**
   * Calculate estimated cost
   */
  getEstimatedCost(): number {
    const limits = this.getModelLimits();
    if (!limits) return 0;

    const inputCost = (this.metrics.inputTokens / 1_000_000) * limits.inputCostPer1M;
    const outputCost = (this.metrics.outputTokens / 1_000_000) * limits.outputCostPer1M;

    return inputCost + outputCost;
  }

  /**
   * Get session duration in human-readable format
   */
  getSessionDuration(): string {
    const diff = Date.now() - this.metrics.sessionStart.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get a single-line status string
   */
  getStatusLine(): string {
    const limits = this.getModelLimits();
    const contextUsage = this.getContextUsage();
    const duration = this.getSessionDuration();
    const cost = this.getEstimatedCost().toFixed(4);

    const modelName = limits?.name || this.metrics.model;

    return `━━━ 🤖 ${modelName} | 📊 ${this.metrics.totalTokens.toLocaleString()} tokens (${contextUsage.toFixed(1)}%) | ⏱️ ${duration} | 💰 $${cost} ━━━`;
  }

  /**
   * Get a detailed multi-line status
   */
  getDetailedStatus(): string {
    const limits = this.getModelLimits();
    const contextUsage = this.getContextUsage();
    const duration = this.getSessionDuration();
    const cost = this.getEstimatedCost();
    const costFormatted = cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`;

    return `
${"━".repeat(60)}
📊 CLOUD COACH STATUS
${"━".repeat(60)}
🤖 Modelo:      ${limits?.name || this.metrics.model}
📊 Tokens:      ${this.metrics.inputTokens.toLocaleString()} input + ${this.metrics.outputTokens.toLocaleString()} output = ${this.metrics.totalTokens.toLocaleString()} total
📏 Contexto:    ${contextUsage.toFixed(1)}% / 100%
⏱️ Sesión:      ${duration} (${this.metrics.requests} requests)
💰 Costo est.:  ${costFormatted}
${"━".repeat(60)}
`.trim();
  }

  /**
   * Render the status bar
   */
  private render(): void {
    if (this.updateCallback) {
      this.updateCallback(this.metrics);
    }
  }

  /**
   * Default update callback (console-based)
   */
  private defaultUpdateCallback(metrics: SessionMetrics): void {
    // In a terminal app, this would update the status line
    // For now, we'll just log occasionally (every 10 seconds)
    const now = Date.now();
    if (!this.lastLogTime || now - this.lastLogTime > 10000) {
      this.lastLogTime = now;
      console.log(this.getStatusLine());
    }
  }

  private lastLogTime: number = 0;

  /**
   * Reset metrics (start new session)
   */
  reset(): void {
    this.metrics = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      requests: 0,
      model: this.metrics.model,
      sessionStart: new Date(),
    };
    this.render();
  }
}

/**
 * Global singleton instance for easy access
 */
let globalStatusBar: StatusBar | null = null;

export function getStatusBar(model?: string): StatusBar {
  if (!globalStatusBar) {
    globalStatusBar = new StatusBar(model);
  }
  return globalStatusBar;
}

/**
 * Convenience function to track tokens without accessing instance
 */
export function trackTokens(input: number, output: number): void {
  const sb = getStatusBar();
  sb.updateTokens(input, output);
}

/**
 * Convenience function to record a request
 */
export function trackRequest(): void {
  const sb = getStatusBar();
  sb.recordRequest();
}

/**
 * Convenience function to change model
 */
export function setModel(model: string): void {
  const sb = getStatusBar();
  sb.setModel(model);
}

/**
 * Print current status to console
 */
export function printStatus(): void {
  const sb = getStatusBar();
  console.log(sb.getDetailedStatus());
}
