# Nozbe Integration Design

**Date:** 2026-03-20
**Author:** Claude (Brainstorming Skill)
**Status:** Draft

## Overview

Integrate Nozbe task management into the claude-telegram-relay project, enabling full task CRUD operations (create, read, update, delete, comment) through Telegram commands and natural language queries. Include Nozbe tasks in the daily morning briefing.

## Problem Statement

User needs to manage Nozbe tasks directly from Telegram bot:
- Create tasks
- Complete tasks
- List tasks (active, by project, by date)
- Edit tasks
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

**Key Endpoints:**
- `GET /api/tasks` - List tasks with filtering
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/comment` - Add comment
- `GET /api/projects` - List projects

**Filtering:** LHS bracket notation
- `ended_at=null` for active tasks
- `due_date<2026-03-21` for tasks due before date
- `project_id=<id>` for specific project

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

| Command | Description | Example |
|---------|-------------|---------|
| `/nozbe` | List active tasks | `/nozbe` |
| `/nozbe <project>` | List tasks in project | `/nozbe Trabajo` |
| `/tarea <name>` | Create task | `/tarea Revisar reporte` |
| `/tarea <name> @<project>` | Create in project | `/tarea Llamar cliente @Trabajo` |
| `/completar <id>` | Complete task | `/completar abc123` |
| `/comentario <id> <text>` | Add comment | `/comentario abc123 En progreso` |
| `/tasks` | Alias for /nozbe | `/tasks` |

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

## Morning Briefing Integration

### New Section in Briefing

```typescript
async function getNozbeTasks(): Promise<string> {
  if (!process.env.NOZBE_API_TOKEN) return "";

  try {
    const activeTasks = await getTasks({ status: "active" });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const overdue = activeTasks.filter(t =>
      t.due_date && new Date(t.due_date) < today
    );

    const dueToday = activeTasks.filter(t =>
      t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) < tomorrow
    );

    const dueThisWeek = activeTasks.filter(t =>
      t.due_date && new Date(t.due_date) >= tomorrow && new Date(t.due_date) < nextWeek
    );

    let output = `📋 **Tareas de Nozbe**\n\n`;

    if (overdue.length > 0) {
      output += `⚠️ **Vencidas (${overdue.length}):**\n`;
      overdue.forEach(t => output += `   • ${t.name}\n`);
      output += `\n`;
    }

    if (dueToday.length > 0) {
      output += `🔴 **Para hoy (${dueToday.length}):**\n`;
      dueToday.forEach(t => output += `   • ${t.name}\n`);
      output += `\n`;
    }

    if (dueThisWeek.length > 0) {
      output += `📅 **Esta semana (${dueThisWeek.length}):**\n`;
      dueThisWeek.slice(0, 5).forEach(t => output += `   • ${t.name}\n`);
    }

    if (overdue.length === 0 && dueToday.length === 0 && dueThisWeek.length === 0) {
      output += `✅ No hay tareas urgentes`;
    }

    return output;
  } catch (error) {
    console.error("Nozbe fetch failed:", error);
    return ""; // Don't break briefing if Nozbe fails
  }
}
```

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
- Show brief message: "⚠️ No se pudieron cargar las tareas de Nozbe"

## Testing

### test-nozbe-access.ts

Verify basic API access and operations:

1. **Connection Test**
   - Authenticate with token
   - List projects
   - List active tasks

2. **CRUD Operations**
   - Create test task
   - Add comment to test task ✨
   - Complete test task
   - Cleanup (delete test task)

3. **Edge Cases**
   - Invalid token
   - Non-existent task ID
   - Empty comment
   - Non-existent project ID

### test-nozbe-commands.ts

Test Telegram command handlers:

1. `/nozbe` - List tasks
2. `/tarea Test task` - Create task
3. `/comentario <id> Test comment` - Add comment ✨
4. `/completar <id>` - Complete task
5. Natural language detection

### Morning Briefing Test

Execute briefing and verify:
- Nozbe section appears
- Overdue tasks marked correctly
- Doesn't break if Nozbe API fails

### Test Command

```bash
bun run test:nozbe
```

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
