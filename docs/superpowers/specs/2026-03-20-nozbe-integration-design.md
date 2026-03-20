# Nozbe Integration Design

**Date:** 2026-03-20
**Author:** Claude (Brainstorming Skill)
**Status:** Draft

## Overview

Integrate Nozbe task management into the claude-telegram-relay project, enabling core task operations (create, read, complete, comment) through Telegram commands and natural language queries. Include Nozbe tasks in the daily morning briefing.

**Scope:** Create, list, complete, and comment on tasks. Task editing (name, date, priority updates) and deletion are explicitly out of scope for this implementation.

## Problem Statement

User needs to manage Nozbe tasks directly from Telegram bot:
- Create tasks
- Complete tasks
- List tasks (active, by project, by date)
- Add comments to tasks
- View tasks in morning briefing

Current bot only handles Supabase memory and Google Workspace (Gmail, Calendar, Drive). Nozbe is a critical part of user's workflow that is not integrated.

## Architecture

```
Telegram Bot → nozbe-helper.ts → Nozbe API
     ↓
relay.ts (command handlers + natural language detection)
     ↓
Morning Briefing → nozbe-helper.ts → Nozbe API
```

### Components

1. **`nozbe-helper.ts`** (new file)
   - Authentication via API token
   - CRUD functions for tasks and comments
   - Telegram output formatting
   - API error handling

2. **`relay.ts`** (modifications)
   - New commands: `/nozbe`, `/tarea`, `/tasks`, `/completar`
   - Natural language detection in `fetchNozbeIfNeeded()`
   - Keywords: "tarea", "nozbe", "pendiente", "completar"

3. **`morning-briefing-personal.ts`** (modification)
   - New section: "Tareas de Nozbe"
   - Show overdue, today, and this week tasks

4. **`.env`** (new variable)
   - `NOZBE_API_TOKEN` - Nozbe authentication token

## API Details

**Base URL:** `https://api4.nozbe.com/v1/api/`

**Authentication:** Token-based
```
Authorization: apikey <API_TOKEN>
```

**Endpoints used in this implementation:**
- `GET /api/tasks` - List tasks with filtering
- `POST /api/tasks` - Create task
- `POST /api/tasks/:id/comment` - Add comment to task
- `GET /api/tasks/:id` - Get single task details
- `GET /api/projects` - List projects

**Note:** Nozbe API supports `PUT /api/tasks/:id` (update) and `DELETE /api/tasks/:id` (delete), but these are out of scope for this implementation. See Future Enhancements.

**Filtering:** LHS bracket notation
- `ended_at=null` for active tasks
- `due_date<2026-03-21` for tasks due before date
- `project_id=<id>` for specific project

**Example API Responses:**

```json
// GET /api/tasks?ended_at=null
{
  "tasks": [
    {
      "id": "abc123",
      "name": "Comprar leche",
      "project_id": "proj456",
      "status": "active",
      "due_date": "2026-03-21T23:59:59Z",
      "priority": 1,
      "created_at": "2026-03-20T10:00:00Z",
      "comments_count": 2
    }
  ]
}

// GET /api/projects
{
  "projects": [
    {
      "id": "proj456",
      "name": "Personal",
      "color": "#3498db"
    }
  ]
}
```

## Data Structures

### TypeScript Interfaces

```typescript
interface NozbeTask {
  id: string;
  name: string;
  project_id: string;
  project_name?: string;
  status: "active" | "completed";
  due_date?: string;
  priority: number; // 0-3
  created_at: string;
  comments_count?: number;
}

interface NozbeProject {
  id: string;
  name: string;
  color: string;
}

interface NozbeComment {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
}
```

## nozbe-helper.ts API

### Core Functions

```typescript
// List tasks with optional filters
export async function getTasks(options?: {
  projectId?: string;
  status?: "active" | "completed";
  dueBefore?: string;
  limit?: number;
}): Promise<NozbeTask[]>

// Create a new task
export async function createTask(data: {
  name: string;
  projectId: string;
  dueDate?: string;
  priority?: number;
}): Promise<NozbeTask>

// Complete a task (set ended_at)
export async function completeTask(taskId: string): Promise<boolean>

// Add comment to task
export async function addComment(taskId: string, text: string): Promise<boolean>

// List all projects
export async function getProjects(): Promise<NozbeProject[]>

// Get single task with details
export async function getTaskDetails(taskId: string): Promise<NozbeTask>

// Format tasks for Telegram display
export function formatTasksList(tasks: NozbeTask[]): string

// Common commands (like GwsCommands)
export const NozbeCommands = {
  listActive: () => getTasks({ status: "active" }),
  listByProject: (projectId: string) => getTasks({ projectId }),
  listDueToday: () => getTasks({ dueBefore: today() }),
  listOverdue: () => getTasks({ dueBefore: now(), status: "active" }),
  create: createTask,
  complete: completeTask,
  comment: addComment,
}
```

## Telegram Commands

### Command List

| Command | Description | Example | Validation |
|---------|-------------|---------|------------|
| `/nozbe` | List active tasks | `/nozbe` | None |
| `/nozbe <project>` | List tasks in project | `/nozbe Trabajo` | Project name required |
| `/tarea <name>` | Create task | `/tarea Revisar reporte` | Name required (min 2 chars) |
| `/tarea <name> @<project>` | Create in project | `/tarea Llamar cliente @Trabajo` | Name required, project optional |
| `/completar <id>` | Complete task | `/completar abc123` | Valid task ID required |
| `/comentario <id> <text>` | Add comment | `/comentario abc123 En progreso` | Task ID + text (min 2 chars) required |
| `/tasks` | Alias for /nozbe | `/tasks` | None |

### Command Parsing Specifications

**`/comentario <id> <text>`:**
- Parse by splitting on first space after command
- First argument: task ID (required, alphanumeric string)
- Second argument onwards: comment text (required, min 2 characters, rest of line)
- Error handling:
  - Missing task ID: "❌ Necesito el ID de la tarea. Ej: `/comentario abc123 Tu texto`"
  - Missing comment text: "❌ Necesito el texto del comentario. Ej: `/comentario abc123 Tu texto`"
  - Invalid task ID: "❌ No encontré esa tarea. Verifica el ID"

**`/tarea <name> [@<project>]`:**
- Parse entire line as task name
- Check for `@project` pattern at end using regex: `/@(\w+)$/`
- Extract project name if present, otherwise use default project
- Error handling:
  - Empty task name: "❌ La tarea necesita un nombre. Ej: `/tarea Comprar leche`"
  - Project name not found: "⚠️ Proyecto '@{name}' no encontrado. Creando en proyecto por defecto."

### Natural Language Triggers

Keywords that trigger `fetchNozbeIfNeeded()`:
- "tarea", "tareas", "nozbe", "pendiente"
- "completar", "terminar", "acabar"
- "proyecto", "proyectos"

Query examples:
- "¿qué tareas tengo?"
- "tareas pendientes de hoy"
- "completa la tarea del proyecto X"
- "añade un comentario a la tarea..."

**Note:** Natural language processing delegates to Claude. When user says "completa la tarea del proyecto X", Claude will identify which task based on conversation context and available task list.

## Morning Briefing Integration

### New Section in Briefing

**Section Title:** "📋 **Tareas de Nozbe**"

**Purpose:** Display urgent and upcoming tasks from Nozbe to help user prioritize their day.

**Data to Display:**

1. **Overdue Tasks** (⚠️ icon)
   - All active tasks with `due_date < today` (in user's timezone)
   - Format: "⚠️ **Vencidas (N):**" followed by bulleted list
   - Show task name only (not full details to keep briefing concise)

2. **Due Today** (🔴 icon)
   - All active tasks with `today <= due_date < tomorrow` (in user's timezone)
   - Format: "🔴 **Para hoy (N):**" followed by bulleted list

3. **Due This Week** (📅 icon)
   - All active tasks with `tomorrow <= due_date < today + 7 days`
   - Limit to 5 tasks max (show "y X más..." if more)
   - Format: "📅 **Esta semana (N):**" followed by bulleted list

4. **No Urgent Tasks**
   - If all categories are empty, show: "✅ No hay tareas urgentes"

**Timezone Handling:**
- Use `USER_TIMEZONE` from `.env` for date comparisons
- Nozbe dates are assumed to be in user's local timezone
- Convert Nozbe dates to midnight in user's timezone for accurate day comparisons

**Error Handling:**
- If `NOZBE_API_TOKEN` is not set, omit section silently (no error message)
- If API call fails, log error and omit section (don't break entire briefing)
- Return empty string (section will not appear in briefing)

**Function Signature:**
```typescript
async function getNozbeTasks(): Promise<string>
```

**Behavior:**
- Returns formatted section string as shown above
- Returns empty string if no data or on error
- Section should be inserted after "Goals Activos" and before "Cosas Importantes para Recordar"

## Error Handling

### Error Types

1. **Authentication Failure** (401)
   - Message: "Token de Nozbe inválido o expirado. Genera uno nuevo en nozbe.help/api"
   - Action: Stop execution, show instructions

2. **Rate Limiting** (429)
   - Retry with exponential backoff (1s, 2s, 4s)
   - Max 3 attempts
   - Message to user if all fail: "Nozbe está saturado, intenta más tarde"

3. **Not Found** (404)
   - Task or project ID not found
   - Message: "No encontré esa tarea/proyecto. Verifica el ID"

4. **Validation Error** (400)
   - Missing required fields
   - Message: "Falta el nombre de la tarea" or similar

### Retry Strategy

```typescript
async function fetchNozbe(
  url: string,
  options?: RequestInit,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Authorization": `apikey ${process.env.NOZBE_API_TOKEN}`,
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      if (response.status === 429) {
        const waitTime = Math.pow(2, i) * 1000;
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
```

### Graceful Degradation

- Morning briefing continues if Nozbe API fails
- Log error but don't crash
- Return empty string (section will be omitted from briefing, not show error)
- Bot commands show user-friendly error messages on failures

## Testing

### test-nozbe-access.ts

Verify basic API access and operations:

1. **Connection Test**
   - Authenticate with token from `.env`
   - List projects (verify API returns 200 and array)
   - List active tasks (verify filter `ended_at=null` works)

2. **CRUD Operations**
   - Create test task with known name "Claude Test Task [timestamp]"
   - Retrieve created task to verify it exists
   - Add comment "Test comment from automated test"
   - Verify comment appears in task details (check `comments_count` increased)
   - Complete task (set `ended_at`)
   - Cleanup: delete completed test task

3. **Edge Cases**
   - Invalid token: expect 401, show helpful error
   - Non-existent task ID: expect 404, show "task not found" message
   - Empty comment: expect 400 or 422, show validation error
   - Non-existent project ID when creating task: expect 400, show error

### test-nozbe-commands.ts

Test Telegram command parsing and execution:

1. **`/nozbe` command**
   - Verify it calls `getTasks({ status: "active" })`
   - Verify output is formatted with emojis and task names
   - Test with no tasks: verify empty state message

2. **`/tarea` command**
   - Test basic task creation: `/tarea Test task from commands`
   - Verify task is created in default project
   - Test with project: `/tarea Test @ProjectName`
   - Verify project name is parsed correctly using regex
   - Test empty name: verify validation error message
   - Test project name not found: verify fallback to default

3. **`/comentario` command**
   - Test with valid ID and text: `/comentario abc123 Test comment`
   - Verify parsing splits on first space after command
   - Test missing task ID: verify error "Necesito el ID de la tarea"
   - Test missing comment text: verify error "Necesito el texto del comentario"
   - Test invalid task ID: verify "No encontré esa tarea" message

4. **`/completar` command**
   - Test with valid task ID: verify task is marked completed
   - Test with invalid ID: verify error message

5. **Natural language detection**
   - Test query "¿qué tareas tengo?" triggers `fetchNozbeIfNeeded()`
   - Verify active tasks are included in Claude context
   - Test query "tareas pendientes de hoy" filters by today
   - Test keywords: "tarea", "nozbe", "pendiente", "completar"

### Morning Briefing Test

Execute `morning-briefing-personal.ts` and verify:

1. **Nozbe section appears**
   - Verify section title "📋 **Tareas de Nozbe**" appears
   - Verify section appears after Goals and before Facts
   - Test with `NOZBE_API_TOKEN` unset: verify section is omitted (not error)

2. **Task categorization**
   - Create overdue task (yesterday): verify appears in ⚠️ Vencidas
   - Create task due today: verify appears in 🔴 Para hoy
   - Create task due in 3 days: verify appears in 📅 Esta semana
   - Create task with no due date: verify does NOT appear in briefing
   - Create completed task: verify does NOT appear in briefing

3. **Timezone handling**
   - Set `USER_TIMEZONE=Europe/Madrid`
   - Create task due at 23:59 local time: verify appears in correct day
   - Create task due at 00:01 local time: verify appears in next day

4. **Error handling**
   - Temporarily invalidate API token: verify briefing completes without Nozbe section
   - Check logs for error message: "Nozbe fetch failed"
   - Verify other sections (Goals, Facts) still appear

5. **Edge cases**
   - Empty task list: verify "✅ No hay tareas urgentes" message
   - More than 5 tasks this week: verify only 5 shown with "y X más..."
   - All categories empty: verify message instead of empty section

### Test Command

```bash
bun run test:nozbe
```

Runs both test files in sequence. Both must pass (exit code 0).

## Implementation Steps

1. Create `nozbe-helper.ts` with:
   - TypeScript interfaces
   - `fetchNozbe()` with retry logic
   - `getTasks()`, `createTask()`, `completeTask()`, `addComment()`
   - `getProjects()`
   - `formatTasksList()`
   - `NozbeCommands` export

2. Add to `.env`:
   ```
   NOZBE_API_TOKEN=your_token_here
   ```

3. Update `relay.ts`:
   - Import `NozbeCommands`
   - Add command handlers: `/nozbe`, `/tarea`, `/tasks`, `/completar`
   - Implement `fetchNozbeIfNeeded()` with keyword detection
   - Handle comment command

4. Update `morning-briefing-personal.ts`:
   - Import `getTasks`, `formatTasksList`
   - Add `getNozbeTasks()` function
   - Include in `buildBriefing()`

5. Create test files:
   - `test-nozbe-access.ts`
   - `test-nozbe-commands.ts`

6. Add to `package.json`:
   ```json
   "scripts": {
     "test:nozbe": "bun run test-nozbe-access.ts && bun run test-nozbe-commands.ts"
   }
   ```

7. Run tests and verify

8. Update `.gitignore`:
   - Ensure `.env` is already ignored (NOZBE_API_TOKEN inside)

## Environment Variables

```bash
# Add to .env
NOZBE_API_TOKEN=your_nozbe_api_token_here
```

**How to get token:**
1. Go to nozbe.help/api
2. Generate API token
3. Add to `.env` file

## Future Enhancements

Out of scope for initial implementation:

- Task editing (update name, date, priority)
- Task deletion
- Project management commands
- Task attachments
- Task delegation/assignment
- Webhook integration for real-time updates
- Sync Nozbe tasks to Supabase for backup

## Success Criteria

✅ Can list active tasks via `/nozbe`
✅ Can create task via `/tarea <name>`
✅ Can complete task via `/completar <id>`
✅ Can add comment via `/comentario <id> <text>`
✅ Natural language queries work ("¿qué tareas tengo?")
✅ Morning briefing shows Nozbe tasks
✅ Tests pass (`bun run test:nozbe`)
✅ Graceful error handling (doesn't crash bot if Nozbe fails)
