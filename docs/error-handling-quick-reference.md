# Error Handling - Quick Reference Guide

## Import

```typescript
import {
  safeSupabaseCall,
  withTimeout,
  logError,
  logInfo,
  safeEmbeddingGeneration,
  sendTelegramWithRetry,
  processPendingTelegramRetry
} from "../src/error-handling.js";
```

## Common Patterns

### 1. Supabase Query with Retry

```typescript
const goals = await safeSupabaseCall(
  async () => {
    const { data, error } = await supabase
      .from("memory")
      .select("*")
      .eq("type", "goal");
    if (error) throw error;
    return data;
  },
  [],  // Fallback value
  "get_goals"  // Context for logging
);
```

### 2. Supabase RPC Call with Retry

```typescript
const matches = await safeSupabaseCall(
  async () => {
    const { data, error } = await supabase.rpc("match_memory", {
      query_embedding: embedding,
      match_count: 5,
    });
    if (error) throw error;
    return data;
  },
  null,
  "semantic_search"
);
```

### 3. Embedding with Timeout and Fallback

```typescript
const embedding = await safeEmbeddingGeneration(
  queryText,
  generateEmbedding  // Your embedding function
);

if (!embedding) {
  // Use plain text fallback
  console.log("Using plain text search");
}
```

### 4. Telegram Message with Rate Limiting

```typescript
const success = await sendTelegramWithRetry(
  botToken,
  chatId,
  message
);

if (!success) {
  console.log("Will retry automatically");
}
```

### 5. Process Pending Telegram Retries

```typescript
// Call this on each smart check-in run
await processPendingTelegramRetry(botToken, chatId);
```

### 6. Generic Timeout

```typescript
const result = await withTimeout(
  someAsyncOperation(),
  5000,  // 5 second timeout
  new Error("Operation took too long")
);
```

### 7. Logging

```typescript
// Info logging
await logInfo(
  "checkin_sent",
  "Check-in message sent successfully",
  { userId, messageLength: message.length }
);

// Error logging
await logError(
  "embedding_failed",
  error,
  { textLength: text.length, model: "gemini-embedding-001" }
);
```

## Configuration

```typescript
// Timeouts (in milliseconds)
SUPABASE_TIMEOUT_MS = 10000        // 10 seconds
EMBEDDING_TIMEOUT_MS = 10000       // 10 seconds
TELEGRAM_RATE_LIMIT_MS = 60000     // 1 minute
TELEGRAM_RETRY_DELAY_MS = 300000   // 5 minutes

// Retries
MAX_RETRIES = 3  // With exponential backoff: 1s, 2s, 4s
```

## Error Recovery

### Supabase
- **Failure**: Retry 3 times with exponential backoff
- **Final Failure**: Use provided fallback value, log to `logs` table
- **Example**: If goals can't be fetched, return empty array `[]`

### Embedding
- **Failure**: Timeout after 10 seconds
- **Fallback**: Return `null`, use plain text search
- **Logging**: Log to `logs` table with error details

### Telegram
- **Rate Limited**: Wait until rate limit expires (max 1 minute)
- **Send Failed**: Retry in 5 minutes
- **Pending Retry**: Stored in memory, processed on next run

## Best Practices

1. **Always provide fallbacks**: Think about what value makes sense if the operation fails
2. **Use descriptive context**: Context strings help with debugging logs
3. **Log important events**: Use `logInfo` for important state changes
4. **Log all errors**: Use `logError` for any caught errors
5. **Handle timeouts**: Use `withTimeout` for any operation that might hang
6. **Check for nulls**: After `safeEmbeddingGeneration`, always check if result is null
7. **Process pending retries**: Call `processPendingTelegramRetry` on each run

## Testing

Test the error handling:
```bash
bun run examples/test-error-handling.ts
```

## Troubleshooting

### Logs not appearing in Supabase
- Check SUPABASE_URL and SUPABASE_ANON_KEY are set
- Check logs table exists in database
- Check RLS policies allow inserts

### Telegram messages not sending
- Check TELEGRAM_BOT_TOKEN and TELEGRAM_USER_ID are set
- Check bot is not blocked by user
- Check rate limit (1 message per minute)
- Check logs table for error details

### Embeddings timing out
- Check GEMINI_API_KEY is set in Supabase Edge Function secrets
- Check network connectivity to generativelanguage.googleapis.com
- Check text length (very long texts may timeout)
