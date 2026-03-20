/**
 * Error Handling Utilities with Retry Logic
 *
 * Provides robust error handling with exponential backoff for:
 * - Supabase calls
 * - Embedding generation
 * - Telegram API
 *
 * Includes fallback mechanisms and proper logging to Supabase logs table.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// TYPES
// ============================================================

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  event: string;
  message?: string;
  metadata?: Record<string, any>;
  sessionId?: string;
  durationMs?: number;
}

// ============================================================
// CONFIGURATION
// ============================================================

const MAX_RETRIES = 3;
const SUPABASE_TIMEOUT_MS = 10000; // 10 seconds
const EMBEDDING_TIMEOUT_MS = 10000; // 10 seconds
const TELEGRAM_RATE_LIMIT_MS = 60000; // 1 minute between messages
const TELEGRAM_RETRY_DELAY_MS = 300000; // 5 minutes

// Global state for Telegram rate limiting
let lastTelegramSendTime: number = 0;
let pendingTelegramRetry: {
  message: string;
  retryAt: number;
} | null = null;

// ============================================================
// SUPABASE CLIENT
// ============================================================

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    }
  }

  return supabaseClient;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a promise with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error = new Error(`Operation timed out after ${timeoutMs}ms`)
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(timeoutError), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Log error to Supabase logs table
 */
export async function logError(
  event: string,
  error: any,
  metadata?: Record<string, any>
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error(`[${event}]`, error);
    return;
  }

  try {
    await supabase.from("logs").insert({
      level: "error",
      event,
      message: error?.message || String(error),
      metadata: {
        ...metadata,
        stack: error?.stack,
      },
    });
  } catch (logError) {
    console.error("Failed to log error:", logError);
    console.error(`Original error [${event}]:`, error);
  }
}

/**
 * Log info to Supabase logs table
 */
export async function logInfo(
  event: string,
  message?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.log(`[${event}]`, message || "");
    return;
  }

  try {
    await supabase.from("logs").insert({
      level: "info",
      event,
      message,
      metadata,
    });
  } catch (logError) {
    console.error("Failed to log info:", logError);
  }
}

/**
 * Safe Supabase call with retry logic and exponential backoff
 *
 * @param fn - Function that returns a Promise with Supabase call
 * @param fallback - Fallback value if all retries fail
 * @param context - Context string for logging
 * @returns Result of the function call or fallback value
 */
export async function safeSupabaseCall<T>(
  fn: () => Promise<T>,
  fallback: T,
  context?: string
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await withTimeout(
        fn(),
        SUPABASE_TIMEOUT_MS,
        new Error(`Supabase call timed out after ${SUPABASE_TIMEOUT_MS}ms`)
      );
      return result;
    } catch (error: any) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;

      if (isLastAttempt) {
        await logError(
          context || "supabase_connection_failed",
          error,
          { attempt: attempt + 1, maxRetries: MAX_RETRIES }
        );
        console.error(
          `Supabase call failed after ${MAX_RETRIES} attempts:`,
          error
        );
        return fallback;
      }

      // Exponential backoff: 1s, 2s, 4s
      const backoffDelay = Math.pow(2, attempt) * 1000;
      console.warn(
        `Supabase call failed (attempt ${attempt + 1}/${MAX_RETRIES}), ` +
          `retrying in ${backoffDelay}ms...`
      );
      await sleep(backoffDelay);
    }
  }

  return fallback;
}

// ============================================================
// EMBEDDING GENERATION WITH TIMEOUT
// ============================================================

/**
 * Generate embedding with timeout and fallback
 *
 * @param text - Text to generate embedding for
 * @param embeddingFn - Function that generates embedding
 * @returns Embedding vector or null if all attempts fail
 */
export async function safeEmbeddingGeneration(
  text: string,
  embeddingFn: (text: string) => Promise<number[] | null>
): Promise<number[] | null> {
  try {
    const embedding = await withTimeout(
      embeddingFn(text),
      EMBEDDING_TIMEOUT_MS,
      new Error(`Embedding generation timed out after ${EMBEDDING_TIMEOUT_MS}ms`)
    );

    if (!embedding) {
      await logInfo(
        "embedding_fallback",
        "Embedding generation returned null, using plain text fallback",
        { textLength: text.length }
      );
    }

    return embedding;
  } catch (error: any) {
    await logError(
      "embedding_generation_failed",
      error,
      { textLength: text.length }
    );
    console.error("Embedding generation failed, using plain text fallback:", error);
    return null;
  }
}

// ============================================================
// TELEGRAM API WITH RATE LIMITING
// ============================================================

/**
 * Check if Telegram can send message (rate limit check)
 */
function canSendToTelegram(): boolean {
  const now = Date.now();
  return now - lastTelegramSendTime >= TELEGRAM_RATE_LIMIT_MS;
}

/**
 * Get time until next allowed Telegram send
 */
function getTimeUntilNextSend(): number {
  const now = Date.now();
  const timeSinceLastSend = now - lastTelegramSendTime;
  const timeUntilNextSend = Math.max(
    0,
    TELEGRAM_RATE_LIMIT_MS - timeSinceLastSend
  );
  return timeUntilNextSend;
}

/**
 * Send Telegram message with rate limiting and retry logic
 *
 * @param botToken - Telegram bot token
 * @param chatId - Telegram chat ID
 * @param message - Message to send
 * @returns true if sent successfully, false otherwise
 */
export async function sendTelegramWithRetry(
  botToken: string,
  chatId: string,
  message: string
): Promise<boolean> {
  // Check rate limit
  if (!canSendToTelegram()) {
    const timeUntilNextSend = getTimeUntilNextSend();
    await logInfo(
      "telegram_rate_limited",
      `Telegram send rate limited, retrying in ${Math.ceil(timeUntilNextSend / 1000)}s`,
      {
        messageLength: message.length,
        timeUntilNextSend,
      }
    );

    // Schedule retry
    pendingTelegramRetry = {
      message,
      retryAt: Date.now() + timeUntilNextSend,
    };

    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${response.status} - ${errorText}`);
    }

    // Update last send time on success
    lastTelegramSendTime = Date.now();
    pendingTelegramRetry = null;

    await logInfo(
      "telegram_sent",
      "Message sent successfully to Telegram",
      {
        messageLength: message.length,
        chatId,
      }
    );

    return true;
  } catch (error: any) {
    await logError("telegram_send_failed", error, {
      messageLength: message.length,
      chatId,
    });

    console.error("Telegram send failed, scheduling retry in 5 minutes:", error);

    // Schedule retry in 5 minutes
    pendingTelegramRetry = {
      message,
      retryAt: Date.now() + TELEGRAM_RETRY_DELAY_MS,
    };

    return false;
  }
}

/**
 * Process pending Telegram retry if available
 */
export async function processPendingTelegramRetry(
  botToken: string,
  chatId: string
): Promise<boolean> {
  if (!pendingTelegramRetry) {
    return false;
  }

  const now = Date.now();
  if (now < pendingTelegramRetry.retryAt) {
    return false;
  }

  console.log("Processing pending Telegram retry...");
  const message = pendingTelegramRetry.message;
  pendingTelegramRetry = null;

  return sendTelegramWithRetry(botToken, chatId, message);
}
