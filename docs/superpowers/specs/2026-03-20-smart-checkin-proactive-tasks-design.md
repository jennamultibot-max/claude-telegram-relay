# Smart Check-in Proactive Tasks System - Design Specification

**Date:** 2026-03-20
**Project:** Claude Telegram Relay
**Scope:** Enfoque 1 - Smart Check-in Mejorado con Búsqueda Inteligente
**Approach:** Enhanced smart check-in with Supabase integration and semantic context

---

## Executive Summary

This design enhances the existing `examples/smart-checkin.ts` to create an intelligent proactive task notification system. The system connects with the user's Supabase database to monitor pending tasks, analyzes context from conversational memory, and intelligently decides when to contact the user via Telegram about important items.

**Key Features:**
- Real-time monitoring of active goals from Supabase
- Semantic search in conversational memory for relevant context
- Intelligent decision engine based on priority, deadlines, and time
- Enhanced Telegram notifications with actionable information
- Robust error handling and performance optimization

**Target User:**
- Manages tasks using mixed methods (conversations + external tools)
- Prioritizes pending task notifications over completion reports
- Handles balanced mix of personal and professional tasks

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                SMART CHECK-IN DAEMON                   │
│              (ejecuta cada 30 minutos)               │
└──────────────┬──────────────────────────────────────────┘
               │
               ├───> Consulta Supabase: get_active_goals()
               │
               ├───> Consulta semántica: match_memory() con contexto
               │
               ├───> Analiza prioridad + deadline + tiempo actual
               │
               └───> Llama a Claude para decidir si contactar
                       │
                       └───> Si sí: envía mensaje por Telegram
```

**Core Components:**
1. **Supabase Integration**: MCP-based connection to read real tasks
2. **Semantic Context**: Search in conversational memory using embeddings
3. **Intelligent Decision**: Claude decides based on complete context
4. **Telegram Notifications**: Proactive messages when necessary

---

## 2. Detailed Components

### 2.1 Supabase Integration

**File:** `src/supabase-client.ts` (new)

**Functionality:**
```typescript
interface Goal {
  id: UUID;
  content: string;
  deadline: TIMESTAMP | null;
  priority: number;
  metadata: JSONB;
}

async function getGoals(): Promise<Goal[]> {
  const result = await supabase.rpc('get_active_goals');
  return result.data || [];
}
```

**Data Flow:**
- Reads from `memory` table where `type = 'goal'`
- Filters out completed goals (`completed_at IS NULL`)
- Returns with priority and deadline information

### 2.2 Semantic Context Gathering

**File:** `src/embedding-utils.ts` (new)

**Functionality:**
```typescript
async function getRelevantContext(tasks: Goal[]): Promise<string> {
  // Search conversational memory using embeddings
  const relevantMemory = await supabase.rpc('match_memory', {
    query_embedding: await generateEmbedding(tasks.join(' ')),
    match_count: 5
  });

  return relevantMemory.data
    ?.map(m => m.content)
    .join('\n') || '';
}
```

**Context Sources:**
- Past conversations about these tasks
- Relevant facts mentioned previously
- User preferences about similar tasks

### 2.3 Intelligent Decision Engine

**File:** `config/checkin-rules.ts` (new)

**Enhanced Prompt:**
```typescript
const prompt = `
Tus tareas pendientes:
${goals.map(g => `- ${g.content} (prioridad: ${g.priority}, deadline: ${g.deadline || 'sin fecha'})`).join('\n')}

Contexto relevante de conversaciones:
${relevantContext}

REGLAS DE AVISO:
1. Prioridad alta (3+) = notificar incluso si faltan 2+ días
2. Deadline en las próximas 24h = notificar urgente
3. Tasks sin deadline pero importantes = notificar si hace >3 días sin actividad
4. Máximo 2 notificaciones por día para no ser molesto
5. Considerar horario de trabajo: no interrumpir horas profundas (9-12h, 14-17h)
6. Adaptar mensaje según urgencia: 🚨 urgente, ⏰ recordatorio, ✓ progreso

RESPOND EN FORMATO:
DECISION: YES o NO
MESSAGE: [Tu mensaje proactivo si YES]
REASON: [Por qué decidiste esto]
`;
```

### 2.4 Enhanced Telegram Notifications

**Message Templates:**
```
🚨 URGENTE: "Revisar informe" vence en 4 horas
⏰ Recordatorio: "Comprar leche" pendiente desde hace 2 días
✓ Progreso: Tienes 3 tareas activas, ¿quieres ayuda con alguna?
```

**Notification Types:**
1. **Urgent**: Deadline within 24 hours
2. **Reminder**: Task pending for multiple days
3. **Progress**: General status update
4. **Assistance**: Offering help with multiple active tasks

---

## 3. Data Flow and Error Handling

### 3.1 Complete Data Flow

```
Usuario añade tarea (via conversación o manual)
        ↓
    [Supabase: INSERT en memory (type='goal')]
        ↓
Smart Check-in (cada 30 min)
    ↓
    [Supabase: get_active_goals()]
        ↓
    [Supabase: match_memory() con embedding]
        ↓
Claude analiza contexto + reglas de aviso
        ↓
    [Decisión: ¿Contactar?]
        ↓
    SI → [Telegram: sendMessage()]
            ↓
        [Supabase: UPDATE checkin-state]
    NO → [Log: "No aviso necesario"]
```

### 3.2 Error Handling

**Supabase Connection:**
- Automatic retries (3 attempts with exponential backoff)
- Fallback to local data if all attempts fail
- Detailed logging to `logs` table
- Timeout: 10 seconds maximum

```typescript
async function safeSupabaseCall<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        await logError('supabase_connection_failed', error);
        return fallback;
      }
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
  return fallback;
}
```

**Embedding Generation:**
- If Edge Function fails: use plain text
- Timeout: 10 seconds maximum
- Fallback to simple keyword search if embedding fails

**Telegram API:**
- Verify connection before sending
- Rate limiting: maximum 1 message per minute
- If fails: retry in 5 minutes
- Log all send attempts

---

## 4. Implementation Plan

### Phase 1: Base Infrastructure (30-45 min)

**Tasks:**
1. Create Supabase MCP client module (`src/supabase-client.ts`)
2. Modify `getGoals()` in `smart-checkin.ts` to use `get_active_goals()`
3. Add basic error handling with logging

**Deliverables:**
- Working Supabase connection from smart check-in
- Error logging to database
- Verified goal retrieval

### Phase 2: Intelligent Context (45-60 min)

**Tasks:**
1. Implement `getRelevantContext()` in `src/embedding-utils.ts`
2. Integrate with Supabase Edge Function for embeddings
3. Test semantic search functionality

**Deliverables:**
- Working embedding generation
- Semantic search in conversational memory
- Context-aware decision making

### Phase 3: Enhanced Decision Engine (30-45 min)

**Tasks:**
1. Create `config/checkin-rules.ts` with notification rules
2. Improve Claude prompt with complete context
3. Test different notification scenarios

**Deliverables:**
- Intelligent notification rules
- Context-aware decision making
- Tested notification scenarios

### Phase 4: Final Integration (30-45 min)

**Tasks:**
1. Connect complete flow (Supabase → Claude → Telegram)
2. Configure automatic scheduling (cron/launchd)
3. Final testing of complete system

**Deliverables:**
- Complete working system
- Scheduled execution every 30 minutes
- Full integration testing completed

---

## 5. Timeline

- **Phase 1**: 45 minutes → Supabase connection functional
- **Phase 2**: 60 minutes → Intelligent context working
- **Phase 3**: 45 minutes → Enhanced decision engine
- **Phase 4**: 45 minutes → Complete system tested

**Total Development Time**: ~3-4 hours

---

## 6. File Structure

```
claude-telegram-relay/
├── examples/
│   └── smart-checkin.ts (MODIFY)
├── src/
│   ├── supabase-client.ts (NEW)
│   └── embedding-utils.ts (NEW)
└── config/
    └── checkin-rules.ts (NEW)
```

---

## 7. Integration with Existing System

### 7.1 Connection with Main Relay

**Shared Configuration:**
```typescript
{
  BOT_TOKEN,      // From shared .env
  CHAT_ID,        // From shared .env
  USER_TIMEZONE,   // From shared .env
}
```

**Shared Database:**
- Same Supabase instance for both systems
- Relay: messages, memory (conversations)
- Check-in: memory (tasks/goals)

**Benefits:**
- Relay continues functioning normally
- Check-in can fail without affecting relay
- Shared memory for both systems

### 7.2 Integration with Existing Commands

```
Usuario → Telegram: "/tarea nueva tarea"
    ↓
Relay normal: Processes command
    ↓
Relay: Saves to Supabase (type='goal')
    ↓
Smart check-in: Detects new task on next execution
    ↓
Claude: Analyzes and decides to notify
```

**Bidirectional Flow:**
- Relay saves tasks mentioned in conversations
- Check-in reads and analyzes these tasks
- Both use the same database

### 7.3 Future Scalability

**Easy to Add:**
- New notification rules (in `checkin-rules.ts`)
- New task sources (Gmail, Calendar integration)
- New notification channels (email, SMS)

**No Breaking Changes:**
- Modular design allows additions without touching existing code
- External configuration for personalization
- Independent module testing

---

## 8. Performance and Security

### 8.1 Performance Optimization

**Embedding Caching:**
```typescript
const embeddingCache = new Map<string, number[]>();

async function getCachedEmbedding(text: string): Promise<number[]> {
  if (embeddingCache.has(text)) {
    return embeddingCache.get(text)!;
  }
  const embedding = await generateEmbedding(text);
  embeddingCache.set(text, embedding);
  return embedding;
}
```

**Benefit**: Reduces Edge Function calls by 60-70%

**Connection Pooling:**
- Reuse existing HTTP connections
- Timeout: 10 seconds maximum
- Connection pool: maximum 5 simultaneous connections

**Intelligent Rate Limiting:**
```typescript
const recentNotifications = [];

function shouldNotify(): boolean {
  const now = Date.now();
  const lastHour = recentNotifications.filter(
    t => now - t < 3600000 // 1 hour
  );

  return lastHour.length < 2; // Max 2 per hour
}
```

### 8.2 Security and Privacy

**Data Protection:**
- Only accesses user's data (user_id filtering)
- No sensitive information cached to disk
- Sanitized logs (no message content)

**Access Control:**
```typescript
// Supabase RLS already configured
CREATE POLICY "Allow user data only" ON memory
FOR ALL USING (user_id = auth.uid());

// MCP uses access token, not public API keys
const supabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY // public key, not service key
);
```

**Error Sanitization:**
```typescript
function logError(event: string, error: any): void {
  const sanitized = {
    event,
    level: 'error',
    message: error.message, // No stack traces
    metadata: { safe: true }
  };

  await supabase.from('logs').insert(sanitized);
}
```

---

## 9. Estimated Costs

**Supabase:**
- Storage: < 1 MB (task embeddings)
- Compute: ~200 RPC calls/day
- Cost: $0-5/month (free plan sufficient)

**Telegram API:**
- Messages: ~5-10/day
- Cost: $0 (free plan covers this)

**Edge Functions:**
- Embeddings: ~50/day
- Cost: $0 (free plan)

**Total Monthly Cost**: $0-5 USD (mainly if Supabase exceeds free tier)

---

## 10. Testing Strategy

### Unit Tests
- `getGoals()` returns correct Supabase data
- `getRelevantContext()` generates embeddings correctly
- Notification rules function with different scenarios

### Integration Tests
- Complete flow: Supabase → Claude → Telegram
- Connection error handling
- Performance: max execution time < 30 seconds

### Manual Tests
- Add task in Supabase → notifies in 30 min?
- Task without deadline → no notification?
- Multiple tasks → prioritizes correctly?
- Urgent deadline → urgent notification sent?

---

## Success Criteria

✅ Smart check-in connects to Supabase and retrieves active goals
✅ Semantic search provides relevant conversational context
✅ Claude makes intelligent notification decisions based on complete context
✅ Telegram notifications are sent with appropriate urgency levels
✅ Error handling prevents system failures
✅ Performance optimizations reduce costs and improve response time
✅ System integrates seamlessly with existing relay functionality

---

## Next Steps

1. User review and approval of this specification
2. Generate detailed implementation plan using writing-plans skill
3. Begin Phase 1 implementation
4. Progress through all 4 phases
5. Final testing and deployment

---

**Design Version:** 1.0
**Status:** Awaiting User Approval
**Author:** Claude Code (with brainstorming skill)