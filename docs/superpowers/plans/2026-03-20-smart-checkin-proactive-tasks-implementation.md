# Smart Check-in Enhancement Implementation Plan

**Date:** 2026-03-20
**Spec:** docs/superpowers/specs/2026-03-20-smart-checkin-proactive-tasks-design.md (v1.2)
**Estimated Duration:** 3-4 hours

---

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`[ ]`) syntax for tracking.

**Goal:** Enhance the existing `smart-checkin.ts` to proactively monitor user's pending tasks from Supabase and notify about urgent items with intelligent context awareness.

**Architecture:** Extend existing Supabase integration in `src/memory.ts` to support active goal retrieval and semantic context gathering for intelligent notification decisions.

**Tech Stack:**
- TypeScript + Bun runtime
- Supabase (existing integration via @supabase/supabase-js)
- Telegram Bot API (existing grammY integration)
- Claude Code CLI for decision making
- Edge Functions for embedding generation

---

## File Structure

```
claude-telegram-relay/
├── examples/
│   └── smart-checkin.ts (MODIFY)
├── src/
│   └── memory.ts (EXTEND - add goal functions)
├── config/
│   └── checkin-rules.ts (NEW)
└── tests/
    ├── integration/
    │   └── supabase.test.ts (NEW)
    └── unit/
        └── notification.test.ts (NEW)
```

---

## Task Breakdown

### Task 1: Verify Existing Supabase Integration (20 min)

**Files:**
- Read: `src/memory.ts`
- No new files created

**Goal:** Ensure existing Supabase connection and memory functions work correctly before extending them.

**Steps:**
- [ ] Test existing `getGoals()` function in `src/memory.ts`
- [ ] Verify `getRelevantContext()` function works with Edge Functions
- [ ] Confirm `USER_TIMEZONE` environment variable is available
- [ ] Test database connection with current credentials

**Verification:**
```bash
bun run tests/integration/supabase.test.ts
```

**Expected Output:** "All Supabase integration tests PASS"

---

### Task 2: Extend memory.ts with Goal Functions (30 min)

**Files:**
- Modify: `src/memory.ts`
- No new files created

**Goal:** Add goal-specific functions to existing memory module for active task retrieval.

**Implementation:**

In `src/memory.ts`, add these functions:

```typescript
// Goal interface
interface Goal {
  id: UUID;
  content: string;
  deadline: TIMESTAMP | null;
  priority: number;
  metadata: JSONB;
  completed_at: TIMESTAMP | null;
  created_at: TIMESTAMP;
}

// Get active goals (extends existing getGoals)
export async function getActiveGoals(): Promise<Goal[]> {
  const goals = await getGoals();
  return goals.filter(g =>
    g.type === 'goal' &&
    g.completed_at === null
  );
}

// Get goals by urgency level
export async function getUrgentGoals(hoursThreshold: number = 24): Promise<Goal[]> {
  const goals = await getActiveGoals();
  const now = new Date();

  return goals.filter(g => {
    if (!g.deadline) return false;

    const deadline = new Date(g.deadline);
    const hoursUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    return hoursUntil <= hoursThreshold;
  });
}
```

**Verification:**
```bash
bun run tests/unit/notification.test.ts
```

**Expected Output:** "Goal retrieval functions working correctly"

---

### Task 3: Create Notification Rules Configuration (25 min)

**Files:**
- Create: `config/checkin-rules.ts`

**Goal:** Define notification rules and templates for intelligent decision making.

**Implementation:**

```typescript
// config/checkin-rules.ts
export interface NotificationConfig {
  urgencyThreshold: number; // hours
  reminderThreshold: number; // days
  maxDailyNotifications: number;
  workHours: { start: number; end: number };
}

export const notificationRules: NotificationConfig = {
  urgencyThreshold: 24,      // 24 hours = urgent
  reminderThreshold: 3,       // 3 days = reminder
  maxDailyNotifications: 2,
  workHours: {
    start: 9,
    end: 12
  }
};

export interface NotificationTemplate {
  type: 'urgent' | 'reminder' | 'progress' | 'assistance';
  emoji: string;
  template: (data: NotificationData) => string;
}

export interface NotificationData {
  task: string;
  hoursRemaining?: number;
  daysAgo?: number;
  taskCount: number;
}

export const notificationTemplates: NotificationTemplate[] = [
  {
    type: 'urgent',
    emoji: '🚨',
    template: (data) => `URGENTE: "${data.task}" vence en ${data.hoursRemaining} horas`
  },
  {
    type: 'reminder',
    emoji: '⏰',
    template: (data) => `Recordatorio: "${data.task}" pendiente desde hace ${data.daysAgo} días`
  },
  {
    type: 'progress',
    emoji: '✓',
    template: (data) => `Progreso: Tienes ${data.taskCount} tareas activas, ¿quieres ayuda con alguna?`
  },
  {
    type: 'assistance',
    emoji: '💡',
    template: (data) => `¿Te ayududo con alguna de tus ${data.taskCount} tareas pendientes?`
  }
];
```

**Verification:**
```bash
bun run tests/unit/notification.test.ts
```

**Expected Output:** "Notification rules configured correctly"

---

### Task 4: Update smart-checkin.ts with Supabase Integration (40 min)

**Files:**
- Modify: `examples/smart-checkin.ts`

**Goal:** Replace mock data with real Supabase integration using the extended memory functions.

**Implementation:**

In `examples/smart-checkin.ts`, replace the existing functions:

```typescript
// Before:
async function getGoals(): Promise<string[]> {
  return ["Finish video edit by 5pm", "Review PR"];
}

// After:
import { getActiveGoals, getRelevantContext } from '../src/memory';

async function getGoals(): Promise<string[]> {
  const goals = await getActiveGoals();
  return goals.map(g => g.content);
}
```

Also update the decision prompt to use real goal data and timezone awareness:

```typescript
const prompt = `
Tus tareas pendientes:
${goals.map(g => `- ${g.content} (prioridad: ${g.priority || 'N/A'}, deadline: ${g.deadline ? new Date(g.deadline).toLocaleDateString('es-ES', { timeZone: USER_TIMEZONE }) : 'sin fecha'})`).join('\n')}

Contexto relevante de conversaciones:
${relevantContext}

REGLAS DE AVISO:
1. Prioridad alta (3+) = notificar incluso si faltan 2+ días
2. Deadline en las próximas 24h = notificar urgente
3. Tasks sin deadline pero importantes = notificar si hace >3 días sin actividad
4. Máximo 2 notificaciones por día para no ser molesto
5. Considerar horario de trabajo: ${notificationRules.workHours.start}-${notificationRules.workHours.end} (no interrumpir horas profundas)
6. Adaptar mensaje según urgencia: 🚨 urgente, ⏰ recordatorio, ✓ progreso
7. Respetar zona horaria: ${USER_TIMEZONE}
`;
```

**Verification:**
```bash
bun run examples/smart-checkin.ts
# Test with sample data in Supabase
```

**Expected Output:** "Smart check-in retrieves real goals and makes decisions"

---

### Task 5: Implement Enhanced Claude Decision Logic (35 min)

**Files:**
- Modify: `examples/smart-checkin.ts`

**Goal:** Improve Claude decision making with enhanced context and timezone-aware logic.

**Implementation:**

Add timezone-aware deadline calculation:

```typescript
function getHoursUntilDeadline(deadline: string | null): number {
  if (!deadline) return Infinity;

  const now = new Date();
  const deadlineDate = new Date(deadline);
  const userTimezone = process.env.USER_TIMEZONE || 'Europe/Madrid';

  // Convert to user timezone
  return differenceInHours(now, deadlineDate, userTimezone);
}

function differenceInHours(date1: Date, date2: Date, timezone: string): number {
  const d1Zoned = toZonedTime(date1, timezone);
  const d2Zoned = toZonedTime(date2, timezone);

  return (d2Zoned.getTime() - d1Zoned.getTime()) / (1000 * 60 * 60);
}
```

Enhance decision prompt with fallback behavior:

```typescript
const enhancedPrompt = `
${prompt}

SI NO PUEDO COMUNICARME CON CLAUDE (timeout, error):
- Analiza las reglas localmente y decide basado en prioridad y deadline
- Busca en el contexto conversacional si hay urgencias mencionadas

DECISIÓN_FINAL:
[DECISION]
[MESSAGE]
[REASON]
`;

const decision = await askClaudeToDecide(enhancedPrompt);
```

**Verification:**
```bash
# Test with various scenarios:
# - Urgent deadline
# - Multiple tasks with different priorities
# - No active goals
```

**Expected Output:** "Decision logic handles timeouts and edge cases"

---

### Task 6: Implement Error Handling and Fallback (30 min)

**Files:**
- Modify: `examples/smart-checkin.ts`

**Goal:** Add robust error handling for Supabase, Claude CLI, and Telegram API failures.

**Implementation:**

```typescript
// Supabase error handling with fallback
async function safeGoalRetrieval(): Promise<Goal[]> {
  try {
    return await getActiveGoals();
  } catch (error) {
    await logToDatabase('supabase_connection_failed', error);
    // Fallback to last known goals
    return await getLastKnownGoals();
  }
}

// Claude CLI error handling
async function safeClaudeDecision(prompt: string): Promise<DecisionResult> {
  try {
    return await askClaudeToDecide(prompt);
  } catch (error) {
    if (error.message.includes('timeout')) {
      // Fallback to rule-based decision
      return makeRuleBasedDecision(goals);
    }
    await logToDatabase('claude_timeout', error);
    return { shouldCheckin: false, message: '' };
  }
}

// Telegram API retry logic
async function safeTelegramSend(message: string): Promise<boolean> {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sendTelegram(message);
    } catch (error) {
      if (i === maxRetries - 1) {
        await logToDatabase('telegram_failed', error);
        return false;
      }
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
  return false;
}
```

**Verification:**
```bash
# Test with network failures
# Test with Supabase downtime
```

**Expected Output:** "Error handling prevents system crashes"

---

### Task 7: Add Logging and Metrics (25 min)

**Files:**
- Modify: `examples/smart-checkin.ts`

**Goal:** Implement observability with structured logging and performance metrics.

**Implementation:**

```typescript
interface CheckinMetrics {
  startTime: number;
  decisionTime: number;
  notificationTime: number;
  success: boolean;
  goalCount: number;
  urgencyLevel: string;
}

const metrics: CheckinMetrics[] = [];

async function logCheckinEvent(event: string, metadata: any = {}): Promise<void> {
  await supabase.from('logs').insert({
    created_at: new Date().toISOString(),
    level: 'info',
    event: `smart_checkin:${event}`,
    metadata: {
      ...metadata,
      timestamp: Date.now()
    }
  });
}

// Track execution time
async function trackExecution(action: string, fn: () => Promise<any>): Promise<any> {
  const startTime = Date.now();

  try {
    const result = await fn();

    await logCheckinEvent(`${action}_complete`, {
      duration_ms: Date.now() - startTime,
      success: true
    });

    return result;
  } catch (error) {
    await logCheckinEvent(`${action}_failed`, {
      error: error.message,
      duration_ms: Date.now() - startTime,
      success: false
    });

    throw error;
  }
}
```

Add performance tracking:

```typescript
async function updatePerformanceMetrics(metrics: CheckinMetrics): Promise<void> {
  await supabase.from('checkin_metrics').insert({
    created_at: new Date().toISOString(),
    execution_time_ms: metrics.decisionTime - metrics.startTime,
    decision_accuracy: metrics.success,
    goals_analyzed: metrics.goalCount,
    urgency_level: metrics.urgencyLevel
  });
}
```

**Verification:**
```bash
# Run check-in and verify logs in Supabase
bun run examples/smart-checkin.ts
# Check logs table for structured events
```

**Expected Output:** "System logs all events with performance metrics"

---

### Task 8: Integration Testing (30 min)

**Files:**
- Create: `tests/integration/supabase.test.ts`
- Create: `tests/integration/telegram.test.ts`

**Goal:** Verify end-to-end functionality with real Supabase and Telegram connections.

**Implementation:**

```typescript
// tests/integration/supabase.test.ts
import { describe, test, expect } from 'bun:test';
import { getActiveGoals } from '../../src/memory';

describe('Supabase Integration', () => {
  test('should retrieve active goals', async () => {
    const goals = await getActiveGoals();

    expect(goals).toBeDefined();
    expect(goals.length).toBeGreaterThanOrEqual(0);
  });

  test('should filter out completed goals', async () => {
    const goals = await getActiveGoals();

    goals.forEach(goal => {
      expect(goal.completed_at).toBeNull();
    });
  });
});

// tests/integration/telegram.test.ts
import { describe, test, expect } from 'bun:test';

describe('Telegram Integration', () => {
  test('should send notification successfully', async () => {
    const result = await sendTelegram('Test message');

    expect(result).toBe(true);
  });

  test('should handle rate limiting', async () => {
    // Send multiple messages rapidly
    const messages = ['Msg 1', 'Msg 2', 'Msg 3'];

    for (const msg of messages) {
      await sendTelegram(msg);
    }

    // Last message should be rate-limited
    const lastResult = await sendTelegram('Should be limited');
    expect(lastResult).toBe(false);
  });
});
```

**Verification:**
```bash
bun test tests/integration/
```

**Expected Output:** "All integration tests PASS"

---

### Task 9: Manual Testing and Validation (25 min)

**Files:**
- No new files created
- Test with existing Supabase data

**Goal:** Verify system works correctly with real user data in Supabase.

**Steps:**
- [ ] Insert test goal in Supabase: "Tarea de prueba - revisión"
- [ ] Run smart check-in manually: `bun run examples/smart-checkin.ts`
- [ ] Verify it detects the test goal
- [ ] Check if notification is sent with correct urgency
- [ ] Test timezone handling (deadline displayed correctly)
- [ ] Verify logs in Supabase database

**Verification:**
- Goal is detected within 30 minutes of execution
- Notification uses correct template based on deadline
- Timezone is respected in all time calculations
- All events are logged to `logs` table

**Expected Output:** "Manual testing completed successfully"

---

### Task 10: Documentation and Cleanup (20 min)

**Files:**
- Create: `README-smart-checkin.md`
- Update: `examples/smart-checkin.ts` JSDoc comments

**Goal:** Document the enhanced functionality for future reference and maintenance.

**Implementation:**

```markdown
# Smart Check-in - Enhanced Proactive Tasks

## Overview

The smart check-in system proactively monitors user's pending tasks from Supabase and provides intelligent notifications about urgent items.

## Features

- **Active Goal Monitoring:** Retrieves tasks from Supabase memory table
- **Semantic Context:** Uses conversational memory for relevant context
- **Intelligent Decisions:** Claude AI analyzes priorities, deadlines, and user patterns
- **Timezone Aware:** All time calculations respect user's local timezone
- **Error Resilient:** Comprehensive error handling with fallback mechanisms
- **Performance Optimized:** Caching and rate limiting to minimize costs

## Usage

### Running Manually
```bash
bun run examples/smart-checkin.ts
```

### Scheduling

Run every 30 minutes using cron or launchd:

**macOS:**
```bash
bun run setup:launchd -- --service smart-checkin
```

**Linux:**
```bash
bun run setup:services -- --service smart-checkin
```

## Configuration

Environment variables in `.env`:

```bash
# Required (existing)
TELEGRAM_BOT_TOKEN=
TELEGRAM_USER_ID=
SUPABASE_URL=
SUPABASE_ANON_KEY=

# For smart check-in (existing)
USER_TIMEZONE=Europe/Madrid
CLAUDE_PATH=
```

## Architecture

```
Smart Check-in Daemon
    ↓
    ├─> Supabase: getActiveGoals()
    │
    ├─> Semantic Search: getRelevantContext()
    │
    ├─> Decision Engine: Claude CLI
    │
    └───> If yes → Telegram Notification
```
```

---

## Adding JSDoc Comments

In `examples/smart-checkin.ts`, add comments:

```typescript
/**
 * Retrieves active goals from Supabase memory
 * @returns Promise<Goal[]> Array of active tasks
 * @throws {Error} If Supabase connection fails
 */
export async function getGoals(): Promise<Goal[]> {
  // Implementation here
}
```

**Verification:**
```bash
# Check documentation is complete
ls -la README-smart-checkin.md
```

**Expected Output:** "Documentation complete and code commented"

---

## Testing Strategy

### Unit Tests
- Run: `bun test tests/unit/`
- Coverage: Core functions (goal retrieval, notification rules)

### Integration Tests
- Run: `bun test tests/integration/`
- Coverage: Supabase + Telegram + Claude CLI integration

### Manual Tests
- Test with real Supabase data
- Verify timezone handling
- Test error scenarios
- Performance benchmarks

**Success Criteria:**
- All tests PASS
- Manual testing successful
- Performance targets met (< 30s execution time)
- Error handling verified

**Expected Output:** "All tests passing"

---

## Task 11: Final Integration and Deployment (25 min)

**Files:**
- Verify: `examples/smart-checkin.ts`
- Create: `.env` validation (if needed)

**Goal:** Deploy the complete system and verify it works end-to-end.

**Steps:**
- [ ] Run full health check: `bun run setup:verify`
- [ ] Test scheduling (launchd/cron)
- [ ] Verify logs are flowing to Supabase
- [ ] Test with real user data
- [ ] Confirm notifications are sent correctly

**Verification:**
```bash
bun run setup:verify
```

**Expected Output:** "System deployed and working correctly"

---

## Success Criteria

✅ All unit tests passing
✅ All integration tests passing
✅ Manual testing successful with real data
✅ Smart check-in retrieves active goals from Supabase
✅ Semantic context gathering working with Edge Functions
✅ Claude decisions are timezone-aware and context-informed
✅ Telegram notifications sent with correct urgency levels
✅ Error handling prevents system failures
✅ Performance metrics collected and logged
✅ Documentation complete and updated
✅ System integrates seamlessly with existing relay
✅ Health check passes without errors

---

## Rollback Plan

If any task fails, revert changes with:

```bash
# Revert changes to last working commit
git reset --hard HEAD~1

# Alternative: rollback specific files
git checkout HEAD~1 -- <affected-files>
```

---

## Implementation Notes

**Architectural Decisions Made:**
- Extended `src/memory.ts` instead of creating duplicate Supabase client
- Reused existing Edge Function pattern for embeddings
- Used environment variables for configuration
- Structured error handling with specific fallback strategies

**Known Limitations:**
- In-memory embedding cache is reset every 30 minutes (daemon lifecycle)
- No distributed locking for multiple check-in instances (avoid race conditions)
- Telegram rate limits may delay notifications during high activity

**Future Enhancements:**
- Database-backed state synchronization for multiple instances
- Redis for distributed caching
- More sophisticated notification patterns (predictive vs reactive)
- Direct integration with Gmail/Calendar APIs for task sources

---

**Plan Version:** 1.0
**Status:** Ready for Execution
**Author:** Claude Code (with writing-plans skill)