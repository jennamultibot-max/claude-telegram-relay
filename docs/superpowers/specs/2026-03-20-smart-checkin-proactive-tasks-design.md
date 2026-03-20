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

**File:** `src/memory.ts` (extend existing module)

**Functionality:**
The spec leverages existing Supabase integration patterns from `src/memory.ts` rather than creating duplicate modules. We'll extend the existing `memory.ts` with goal-specific functions.

```typescript
// Extend existing memory.ts with goal retrieval
interface Goal {
  id: UUID;
  content: string;
  deadline: TIMESTAMP | null;
  priority: number;
  metadata: JSONB;
  completed_at: TIMESTAMP | null;
}

async function getActiveGoals(): Promise<Goal[]> {
  // Use existing getGoals() from memory.ts with type filter
  const goals = await getGoals();
  return goals.filter(g =>
    g.type === 'goal' &&
    g.completed_at === null
  );
}
```

**Data Flow:**
- Reads from `memory` table where `type = 'goal'`
- Filters out completed goals (`completed_at IS NULL`)
- Returns with priority and deadline information
- Leverages existing Supabase client from memory.ts

### 2.2 Semantic Context Gathering

**File:** `src/memory.ts` (extend existing module)

**Functionality:**
The spec uses the existing Edge Function pattern from `src/memory.ts` rather than direct RPC calls to maintain the abstraction layer.

```typescript
// Extend existing memory.ts with enhanced context retrieval
async function getRelevantContext(tasks: Goal[]): Promise<string> {
  // Use existing getRelevantContext() from memory.ts
  // This already calls the search Edge Function
  const context = await getRelevantContext(
    tasks.map(t => t.content).join(' ')
  );

  return context;
}
```

**Context Sources:**
- Past conversations about these tasks
- Relevant facts mentioned previously
- User preferences about similar tasks
- Leverages existing `getRelevantContext()` implementation

### 2.3 Task Creation and Pattern Recognition

**Goal Creation Methods:**

1. **Intent Tags in Conversations:**
   The relay parses user messages for goal patterns: `[GOAL: task description | DEADLINE: date]`
   - Pattern: `[GOAL: "revisar informe" | DEADLINE: tomorrow]`
   - Parsed by relay in `src/memory.ts` and stored as `type='goal'`

2. **Manual Commands:**
   User can explicitly create tasks via Telegram commands
   - Example: `/tarea comprar leche`
   - Stored directly in `memory` table with appropriate priority/deadline

3. **Automatic Detection (Future Enhancement):**
   System can detect phrases like "necesito hacer", "tengo que terminar"
   - Currently requires manual creation or intent tags
   - Future: AI-powered detection using existing patterns

### 2.4 Intelligent Decision Engine

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

### 3.2 Edge Cases and Failure Modes

**No Goals Available:**
- What if `get_active_goals()` returns no goals but there are urgent items in conversation history?
  - **Fallback to Context Search:** Use semantic search to find urgent mentions
  - **Threshold:** Search for "urgente", "crítico", "hoy", "mañana"
  - **Action:** Prompt Claude about conversation urgency even without explicit goals

**Timezone Mismatches:**
- How does system handle timezone differences between server and user?
  - **Solution:** All datetime operations use `USER_TIMEZONE` from `.env`
  - **Consistency:** Match existing relay behavior in `src/memory.ts`
  - **Display:** Always show times in user's timezone

**Claude CLI Failures:**
- What if Claude CLI subprocess fails or hangs?
  - **Timeout:** 30 seconds maximum for Claude decision
  - **Fallback:** Use simple rule-based decision if Claude unavailable
  - **Logging:** Record all Claude CLI attempts in `logs` table

**Duplicate Notifications:**
- How are duplicate notifications prevented if check-in runs multiple times in quick succession?
  - **Tracking:** Store `lastNotificationTime` per task ID
  - **Deduplication:** Don't notify same task within 1 hour
  - **Rate Limiting:** Max 2 notifications per hour total

**Supabase Complete Failure:**
- What if Supabase is completely down?
  - **Fallback Mode:** Operate with limited functionality
  - **Cached Data:** Use last known goal list from memory
  - **Notification:** Alert user: "Sistema limitado: no puedo acceder a tareas recientes"
  - **Retry Strategy:** Exponential backoff: 30s, 1m, 5m, 15m

**Goal Priority Conflicts:**
- What if multiple goals have conflicting priorities?
  - **Resolution:** Prioritize by deadline first, then priority score
  - **Display:** Show multiple tasks with clear ordering
  - **User Control:** Allow user to override via commands

### 3.3 Error Handling

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
1. Extend `src/memory.ts` with `getActiveGoals()` function leveraging existing Supabase client
2. Modify `getGoals()` in `smart-checkin.ts` to use `get_active_goals()` RPC
3. Add basic error handling with logging to `logs` table

**Deliverables:**
- Working Supabase connection from smart check-in
- Error logging to database
- Verified goal retrieval via existing patterns

### Phase 0: Verify Existing Integration (15-20 min)

**Tasks:**
1. Test `get_active_goals()` RPC function with existing goals
2. Verify `getRelevantContext()` works with conversation data
3. Confirm timezone handling matches relay behavior

**Deliverables:**
- Verified Supabase integration and data quality
- Confirmed existing patterns work correctly

### Phase 1: Base Infrastructure (30-45 min)

**Tasks:**
1. Extend `src/memory.ts` with `getActiveGoals()` function leveraging existing Supabase client
2. Modify `getGoals()` in `smart-checkin.ts` to use `get_active_goals()` RPC
3. Add basic error handling with logging to `logs` table

**Deliverables:**
- Working Supabase connection from smart check-in
- Error logging to database
- Verified goal retrieval via existing patterns

### Phase 2: Intelligent Context (45-60 min)

**Tasks:**
1. Extend `src/memory.ts` with enhanced `getRelevantContext()` leveraging existing Edge Function
2. Test semantic search functionality with conversation data
3. Implement context aggregation for Claude decision making

**Deliverables:**
- Working embedding generation via existing pattern
- Semantic search in conversational memory
- Context-aware decision making

### Phase 3: Enhanced Decision Engine (30-45 min)

**Tasks:**
1. Create `config/checkin-rules.ts` with notification rules aligned with existing state management
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
4. Setup metrics collection and logging

**Deliverables:**
- Complete working system
- Scheduled execution every 30 minutes
- Full integration testing completed
- Active metrics collection

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

### 7.3 State Synchronization with Main Relay

**Last Message Time Tracking:**
- Relay updates `lastMessageTime` when user sends messages
- Smart check-in reads this value from database or shared state
- Used to determine if user is active or away

**Synchronization Methods:**

1. **Database-Based Tracking (Preferred):**
```typescript
// Query latest user activity
async function getLastActivity(): Promise<string> {
  const result = await supabase
    .from('messages')
    .select('created_at')
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const lastMsg = new Date(result.data.created_at);
  const hoursSince = (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60);

  return `Último mensaje: hace ${hoursSince.toFixed(1)} horas`;
}
```

2. **Shared State File (Alternative):**
```typescript
// Read/write shared state file
interface SharedState {
  lastUserMessage: string;
  lastCheckinTime: string;
  pendingNotifications: string[];
}
```

**Integration Point:**
```typescript
// In smart-checkin.ts
const lastActivity = await getLastActivity();
const context = {
  ...relevantContext,
  lastActivity,
  userTimezone: process.env.USER_TIMEZONE
};
```

**Benefits of Database-Based Tracking:**
- Single source of truth for user activity
- Automatic persistence without file management
- Works across multiple check-in instances
- Consistent with relay's message tracking

### 7.4 Future Scalability

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

## 9. Metrics and Observability

### 9.1 Key Performance Indicators (KPIs)

**Success Rate Metrics:**
- `notification_success_rate`: % of successful Telegram sends / total attempts
- `claude_decision_accuracy`: % of decisions that match expected user behavior
- `relevant_context_quality`: Average semantic similarity score for context retrieved

**Performance Metrics:**
- `avg_execution_time`: Time from check-in start to decision (target < 30s)
- `supabase_query_latency`: Time for RPC calls (target < 2s)
- `embedding_cache_hit_rate`: % of embeddings served from cache (target > 70%)

**User Experience Metrics:**
- `false_positive_rate`: % of notifications that user considered unnecessary
- `task_completion_correlation`: % of completed tasks that were proactively mentioned
- `daily_notification_count`: Average notifications per day (target 1-2)

### 9.2 Logging Strategy

**Event Types to Track:**
```typescript
interface CheckinLog {
  timestamp: TIMESTAMP;
  event: 'checkin_start' | 'checkin_complete' | 'claude_decision' | 'notification_sent' | 'error';
  duration_ms?: number;
  metadata: {
    goalCount?: number;
    decision?: 'YES' | 'NO';
    urgency?: 'urgent' | 'reminder' | 'progress';
    errorType?: string;
  };
}
```

**Critical Events to Log:**
- Every check-in execution start and completion
- All Claude decisions with reasoning
- All Telegram notifications with status
- All errors with retry attempts
- Cache hit/miss statistics

**Log Retention:**
- Store in `logs` table with `event = 'smart_checkin'`
- Retention: 30 days (configurable via environment)
- Index: `created_at DESC` for performance queries

### 9.3 Alerting Strategy

**System Health Alerts:**
- `error_rate > 10%`: Alert about potential infrastructure issues
- `avg_execution_time > 30s`: Performance degradation alert
- `notification_success_rate < 90%`: Delivery system problem alert
- `claude_decision_accuracy < 70%`: Decision quality degradation alert

**User Feedback Collection:**
- Simple feedback mechanism: `?bueno` or `?mal` after notifications
- Track sentiment of user responses
- Use feedback to tune notification rules over time

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

✅ Smart check-in extends existing `src/memory.ts` with goal retrieval functions
✅ Semantic search uses existing Edge Function pattern for consistency
✅ Claude makes intelligent notification decisions based on complete context
✅ Telegram notifications are sent with appropriate urgency levels
✅ Error handling prevents system failures with fallback mechanisms
✅ Performance optimizations reduce costs and improve response time
✅ System integrates seamlessly with existing relay functionality
✅ State synchronization works correctly with main relay
✅ Metrics collection enables monitoring and optimization

---

## 11. Migration Considerations

**Existing Data Compatibility:**
- Users may have existing goals in `memory` table without priority/deadline fields
- **Solution:** Graceful handling of missing fields with default values
- **Migration Path:** Gradual enhancement with backwards compatibility

**Goal Structure Evolution:**
```typescript
// Support both legacy and new goal structures
interface LegacyGoal {
  id: UUID;
  content: string;
  type: 'goal';
  created_at: TIMESTAMP;
  // May not have priority/deadline
}

interface EnhancedGoal extends LegacyGoal {
  deadline: TIMESTAMP | null;
  priority: number;
  metadata: JSONB;
}

function normalizeGoal(goal: LegacyGoal | EnhancedGoal): EnhancedGoal {
  return {
    ...goal,
    deadline: goal.deadline || null,
    priority: goal.priority || 1,
    metadata: goal.metadata || {}
  };
}
```

**Backwards Compatibility:**
- Smart check-in works with existing goals (priority/deadline optional)
- Notification rules use defaults for missing fields
- No breaking changes to existing relay functionality

**User Experience Considerations:**
- Gradual rollout: Start with low-priority notifications, increase volume
- User education: Explain system changes before first notifications
- Feedback mechanism: Easy way to provide feedback on notifications

---

## Next Steps

1. User review and approval of this specification
2. Generate detailed implementation plan using writing-plans skill
3. Begin Phase 1 implementation
4. Progress through all 4 phases
5. Final testing and deployment

---

**Design Version:** 1.1 (Updated based on reviewer feedback)
**Status:** Awaiting User Approval
**Author:** Claude Code (with brainstorming skill)
**Changes from v1.0:**
- Leveraged existing `src/memory.ts` patterns instead of creating duplicate modules
- Added task creation and pattern recognition section
- Added edge cases and failure modes specification
- Added metrics and observability section
- Added state synchronization with main relay
- Updated implementation phases to include verification phase
- Added migration considerations for backwards compatibility