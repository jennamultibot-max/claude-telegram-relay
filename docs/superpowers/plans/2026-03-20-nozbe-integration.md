# Nozbe Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Nozbe task management into the claude-telegram-relay project, enabling users to create, list, complete, and comment on tasks via Telegram commands and natural language, with Nozbe tasks appearing in the daily morning briefing.

**Scope Clarification:**
- ✅ In scope: Complete tasks (mark as done) - different from editing
- ❌ Out of scope: Edit task name, date, priority (requires PUT endpoint for general updates)
- ❌ Out of scope: Delete tasks

**Architecture:**
- Create `nozbe-helper.ts` as the API layer (similar to existing `gws-helper.ts`)
- Add Telegram command handlers in `relay.ts` for `/nozbe`, `/tarea`, `/tasks`, `/completar`, `/comentario`
- Implement natural language keyword detection in `fetchNozbeIfNeeded()` (pattern from `fetchGwsIfNeeded()`)
- Add Nozbe tasks section to `morning-briefing-personal.ts` with timezone-aware date filtering

**Tech Stack:**
- TypeScript with Bun runtime
- grammy for Telegram bot framework
- Nozbe REST API v1 (token-based authentication)
- fetch API with retry logic for rate limiting

---

## Chunk 1: Nozbe API Helper (nozbe-helper.ts)

This chunk creates the core API integration layer with TypeScript interfaces, error handling, retry logic, and all CRUD operations for tasks and comments.

This chunk creates the core API integration layer with TypeScript interfaces, error handling, retry logic, and all CRUD operations for tasks and comments.

### Task 1: Create TypeScript interfaces

**Files:**
- Create: `src/nozbe-helper.ts`

- [ ] **Step 1: Create file with interfaces**

```typescript
/**
 * Nozbe API Helper
 *
 * Integrates with Nozbe REST API for task management.
 * API Documentation: https://nozbe.help/advancedfeatures/api/
 */

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface NozbeTask {
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

export interface NozbeProject {
  id: string;
  name: string;
  color: string;
}

export interface NozbeComment {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
}

export interface NozbeApiResponse<T> {
  data?: T;
  error?: string;
}

// ============================================================
// CONFIGURATION
// ============================================================

const NOZBE_API_BASE = "https://api4.nozbe.com/v1/api";
const NOZBE_API_TOKEN = process.env.NOZBE_API_TOKEN;
const USER_TIMEZONE = process.env.USER_TIMEZONE || "Europe/Madrid";

if (!NOZBE_API_TOKEN) {
  console.warn("⚠️  NOZBE_API_TOKEN not set. Nozbe integration will be disabled.");
}

// ============================================================
// TIMEZONE HELPERS
// ============================================================

/**
 * Get current date in user's timezone for accurate day comparisons
 * @returns Date representing today at midnight in user's timezone
 */
function getUserToday(): Date {
  const now = new Date();
  const userNow = new Date(now.toLocaleString("en-US", { timeZone: USER_TIMEZONE }));
  userNow.setHours(0, 0, 0, 0);
  return userNow;
}

/**
 * Get current datetime in user's timezone
 * @returns Date representing now in user's timezone
 */
function getUserNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: USER_TIMEZONE }));
}
```

Run: `ls src/nozbe-helper.ts`
Expected: File exists

- [ ] **Step 2: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add TypeScript interfaces for Nozbe API

- Define NozbeTask, NozbeProject, NozbeComment interfaces
- Add API base URL and token configuration
- Add warning when token is not set

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2: Implement fetchNozbe with retry logic

**Files:**
- Modify: `src/nozbe-helper.ts`

- [ ] **Step 1: Add fetchNozbe function with error handling**

Add this after the configuration section:

```typescript
// ============================================================
// FETCH WITH RETRY LOGIC
// ============================================================

interface FetchNozbeOptions extends RequestInit {
  retries?: number;
}

async function fetchNozbe(
  endpoint: string,
  options: FetchNozbeOptions = {}
): Promise<Response> {
  const { retries = 3, ...fetchOptions } = options;

  if (!NOZBE_API_TOKEN) {
    throw new Error("NOZBE_API_TOKEN is not configured");
  }

  const url = `${NOZBE_API_BASE}${endpoint}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          "Authorization": `apikey ${NOZBE_API_TOKEN}`,
          "Content-Type": "application/json",
          ...fetchOptions.headers,
        },
      });

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`Rate limited, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // Handle authentication errors
      if (response.status === 401) {
        throw new Error(
          "Token de Nozbe inválido o expirado. Genera uno nuevo en nozbe.help/api"
        );
      }

      return response;
    } catch (error) {
      // If this is the last attempt, throw the error
      if (attempt === retries - 1) {
        throw error;
      }
      // Otherwise log and retry
      console.error(`Fetch attempt ${attempt + 1} failed:`, error);
    }
  }

  throw new Error("Max retries exceeded");
}
```

Run: `bun --eval 'import("./src/nozbe-helper.ts"); console.log("✅ Syntax OK")'`
Expected: "✅ Syntax OK"

- [ ] **Step 2: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add fetchNozbe with retry logic

- Implement exponential backoff for rate limiting (429)
- Handle authentication errors (401) with helpful message
- Retry failed requests up to 3 times
- Throw descriptive errors for token issues

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 3: Implement getProjects function

**Files:**
- Modify: `src/nozbe-helper.ts`

- [ ] **Step 1: Add getProjects function**

```typescript
// ============================================================
// PROJECTS API
// ============================================================

/**
 * Get all projects from Nozbe
 * @returns Promise<NozbeProject[]> Array of projects
 */
export async function getProjects(): Promise<NozbeProject[]> {
  try {
    const response = await fetchNozbe("/api/projects");

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data = await response.json();

    // Nozbe API returns { projects: [...] }
    return (data.projects as NozbeProject[]) || [];
  } catch (error) {
    console.error("Error fetching projects:", error);
    throw error;
  }
}
```

Run: `bun --eval 'import("./src/nozbe-helper.ts"); console.log("✅ Syntax OK")'`
Expected: "✅ Syntax OK"

- [ ] **Step 2: Runtime verification (requires valid NOZBE_API_TOKEN)**

Run: `bun --eval 'import("./src/nozbe-helper.ts").then(m => m.getProjects()).then(projects => console.log("✅ Got", projects.length, "projects")).catch(e => console.error("Expected if NOZBE_API_TOKEN not set:", e.message))'`
Expected: Either "✅ Got N projects" or error about missing token (which is OK for now)

- [ ] **Step 3: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add getProjects function

- Fetch all projects from Nozbe API
- Handle errors gracefully
- Return empty array if no projects

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 4: Implement getTasks function with filtering

**Files:**
- Modify: `src/nozbe-helper.ts`

- [ ] **Step 1: Add getTasks interface and function**

```typescript
// ============================================================
// TASKS API
// ============================================================

export interface GetTasksOptions {
  projectId?: string;
  status?: "active" | "completed";
  dueBefore?: string;
  limit?: number;
}

/**
 * Get tasks from Nozbe with optional filters
 * @param options Filter options
 * @returns Promise<NozbeTask[]> Array of tasks
 */
export async function getTasks(options: GetTasksOptions = {}): Promise<NozbeTask[]> {
  try {
    const params = new URLSearchParams();

    // Build LHS bracket notation filters
    if (options.status === "active") {
      params.append("ended_at", "null");
    }

    if (options.projectId) {
      params.append("project_id", options.projectId);
    }

    if (options.dueBefore) {
      params.append("due_date<", options.dueBefore);
    }

    if (options.limit) {
      params.append("limit", options.limit.toString());
    }

    const queryString = params.toString();
    const endpoint = `/api/tasks${queryString ? `?${queryString}` : ""}`;

    const response = await fetchNozbe(endpoint);

    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.statusText}`);
    }

    const data = await response.json();

    // Nozbe API returns { tasks: [...] }
    return (data.tasks as NozbeTask[]) || [];
  } catch (error) {
    console.error("Error fetching tasks:", error);
    throw error;
  }
}
```

Run: `bun --eval 'import("./src/nozbe-helper.ts"); console.log("✅ Syntax OK")'`
Expected: "✅ Syntax OK"

- [ ] **Step 2: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add getTasks with filtering

- Support filtering by project, status, due date, limit
- Use LHS bracket notation for Nozbe API filters
- Return empty array if no tasks found
- Handle errors gracefully

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 5: Implement getTaskDetails function

**Files:**
- Modify: `src/nozbe-helper.ts`

- [ ] **Step 1: Add getTaskDetails function**

```typescript
/**
 * Get details for a single task
 * @param taskId Task ID
 * @returns Promise<NozbeTask> Task details
 */
export async function getTaskDetails(taskId: string): Promise<NozbeTask> {
  try {
    const response = await fetchNozbe(`/api/tasks/${taskId}`);

    if (response.status === 404) {
      throw new Error("No encontré esa tarea. Verifica el ID");
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch task: ${response.statusText}`);
    }

    return (await response.json()) as NozbeTask;
  } catch (error) {
    console.error("Error fetching task details:", error);
    throw error;
  }
}
```

Run: `bun --eval 'import("./src/nozbe-helper.ts"); console.log("✅ Syntax OK")'`
Expected: "✅ Syntax OK"

- [ ] **Step 2: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add getTaskDetails function

- Fetch single task by ID
- Return 404 error if task not found
- Return helpful error message for user

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 6: Implement createTask function

**Files:**
- Modify: `src/nozbe-helper.ts`

- [ ] **Step 1: Add createTask interface and function**

```typescript
export interface CreateTaskData {
  name: string;
  projectId: string;
  dueDate?: string;
  priority?: number;
}

/**
 * Create a new task in Nozbe
 * @param data Task data
 * @returns Promise<NozbeTask> Created task
 */
export async function createTask(data: CreateTaskData): Promise<NozbeTask> {
  try {
    const body: Record<string, unknown> = {
      name: data.name,
      project_id: data.projectId,
    };

    if (data.dueDate) {
      body.due_date = data.dueDate;
    }

    if (data.priority !== undefined) {
      body.priority = data.priority;
    }

    const response = await fetchNozbe("/api/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (response.status === 400) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Falta el nombre de la tarea");
    }

    if (!response.ok) {
      throw new Error(`Failed to create task: ${response.statusText}`);
    }

    return (await response.json()) as NozbeTask;
  } catch (error) {
    console.error("Error creating task:", error);
    throw error;
  }
}
```

Run: `bun --eval 'import("./src/nozbe-helper.ts"); console.log("✅ Syntax OK")'`
Expected: "✅ Syntax OK"

- [ ] **Step 2: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add createTask function

- Create new tasks in Nozbe
- Support optional due date and priority
- Handle validation errors (400)
- Return helpful error message for missing fields

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 7: Implement completeTask function

**Files:**
- Modify: `src/nozbe-helper.ts`

- [ ] **Step 1: Add completeTask function**

```typescript
/**
 * Mark a task as completed by setting ended_at
 * @param taskId Task ID
 * @returns Promise<boolean> True if successful
 */
export async function completeTask(taskId: string): Promise<boolean> {
  try {
    const response = await fetchNozbe(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({
        ended_at: new Date().toISOString(),
      }),
    });

    if (response.status === 404) {
      throw new Error("No encontré esa tarea. Verifica el ID");
    }

    if (!response.ok) {
      throw new Error(`Failed to complete task: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error("Error completing task:", error);
    throw error;
  }
}
```

Run: `bun --eval 'import("./src/nozbe-helper.ts"); console.log("✅ Syntax OK")'`
Expected: "✅ Syntax OK"

- [ ] **Step 2: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add completeTask function

- Mark tasks as completed by setting ended_at
- Return 404 error if task not found
- Return boolean success indicator

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 8: Implement addComment function

**Files:**
- Modify: `src/nozbe-helper.ts`

- [ ] **Step 1: Add addComment function**

```typescript
/**
 * Add a comment to a task
 * @param taskId Task ID
 * @param text Comment text
 * @returns Promise<boolean> True if successful
 */
export async function addComment(taskId: string, text: string): Promise<boolean> {
  try {
    if (text.length < 2) {
      throw new Error("El comentario debe tener al menos 2 caracteres");
    }

    const response = await fetchNozbe(`/api/tasks/${taskId}/comment`, {
      method: "POST",
      body: JSON.stringify({
        body: text,
      }),
    });

    if (response.status === 404) {
      throw new Error("No encontré esa tarea. Verifica el ID");
    }

    if (response.status === 400) {
      throw new Error("El comentario no puede estar vacío");
    }

    if (!response.ok) {
      throw new Error(`Failed to add comment: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error("Error adding comment:", error);
    throw error;
  }
}
```

Run: `bun --eval 'import("./src/nozbe-helper.ts"); console.log("✅ Syntax OK")'`
Expected: "✅ Syntax OK"

- [ ] **Step 2: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add addComment function

- Add comments to tasks
- Validate minimum length (2 characters)
- Return helpful error messages for validation failures
- Return 404 if task not found

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 9: Implement formatTasksList function

**Files:**
- Modify: `src/nozbe-helper.ts`

- [ ] **Step 1: Add formatTasksList function**

```typescript
// ============================================================
// FORMATTING FOR TELEGRAM
// ============================================================

/**
 * Format tasks list for Telegram display
 * @param tasks Array of tasks to format
 * @returns Formatted string with emojis and task details
 */
export function formatTasksList(tasks: NozbeTask[]): string {
  if (tasks.length === 0) {
    return "📭 No hay tareas.";
  }

  let output = `📧 **${tasks.length} tareas encontradas**\n\n`;

  tasks.forEach((task, index) => {
    const emoji = getStatusEmoji(task);
    const priority = task.priority > 0 ? ` ${"⭐".repeat(task.priority)}` : "";
    const due = task.due_date ? ` 📅 ${new Date(task.due_date).toLocaleDateString("es-ES")}` : "";
    const project = task.project_name ? ` 📁 ${task.project_name}` : "";

    output += `${index + 1}. ${emoji} **${task.name}**${priority}${due}${project}\n`;
    output += `   ID: \`${task.id}\`\n\n`;
  });

  return output;
}

function getStatusEmoji(task: NozbeTask): string {
  if (task.status === "completed") return "✅";

  if (task.due_date) {
    const dueDate = new Date(new Date(task.due_date).toLocaleString("en-US", { timeZone: USER_TIMEZONE }));
    const today = getUserToday();

    if (dueDate < today) return "⚠️";
    if (dueDate.toDateString() === today.toDateString()) return "🔴";
  }

  return "📋";
}
```

Run: `bun --eval 'import("./src/nozbe-helper.ts"); console.log("✅ Syntax OK")'`
Expected: "✅ Syntax OK"

- [ ] **Step 2: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add formatTasksList for Telegram

- Format task lists with emojis and details
- Show status indicators (overdue, due today, active, completed)
- Display priority as stars
- Include due date and project name
- Show task ID for reference in commands

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 10: Implement NozbeCommands export

**Files:**
- Modify: `src/nozbe-helper.ts`

- [ ] **Step 1: Add NozbeCommands convenience export**

```typescript
// ============================================================
// COMMON COMMANDS (like GwsCommands)
// ============================================================

export const NozbeCommands = {
  listActive: () => getTasks({ status: "active" }),
  listByProject: (projectId: string) => getTasks({ projectId }),
  listDueToday: () => {
    const today = getUserToday();
    today.setHours(23, 59, 59, 999);
    return getTasks({ dueBefore: today.toISOString(), status: "active" });
  },
  listOverdue: () => {
    const now = getUserNow();
    return getTasks({ dueBefore: now.toISOString(), status: "active" });
  },
  create: createTask,
  complete: completeTask,
  comment: addComment,
  getProjects,
  getTasks,
  formatTasksList,
};
```

Run: `bun --eval 'import("./src/nozbe-helper.ts"); console.log("✅ NozbeCommands export OK")'`
Expected: "✅ NozbeCommands export OK"

- [ ] **Step 2: Commit**

```bash
git add src/nozbe-helper.ts
git commit -m "feat(nozbe): Add NozbeCommands convenience export

- Export common commands like GwsCommands pattern
- Include listActive, listByProject, listDueToday, listOverdue
- Include create, complete, comment operations
- Include getProjects, getTasks, formatTasksList
- Match existing codebase patterns for consistency

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: Relay Integration (relay.ts)

This chunk adds Telegram command handlers and natural language detection for Nozbe tasks.

### Task 11: Import NozbeCommands in relay.ts

**Files:**
- Modify: `src/relay.ts`
- Line: ~38 (after gws-helper import)

- [ ] **Step 1: Add NozbeCommands import**

Find this line:
```typescript
import { executeGws, GwsCommands, listInboxWithContent } from "./gws-helper.ts";
```

Add immediately after:
```typescript
import { NozbeCommands, getTasks } from "./nozbe-helper.ts";
```

Run: `bun --eval 'import("./src/relay.ts"); console.log("✅ Import OK")'`
Expected: No import errors

- [ ] **Step 2: Commit**

```bash
git add src/relay.ts
git commit -m "feat(nozbe): Import NozbeCommands in relay

- Import NozbeCommands and getTasks from nozbe-helper
- Prepare for command handlers and natural language detection

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 12: Implement fetchNozbeIfNeeded for natural language

**Files:**
- Modify: `src/relay.ts`
- Line: ~233 (after fetchGwsIfNeeded function)

- [ ] **Step 1: Add fetchNozbeIfNeeded function**

Find the fetchGwsIfNeeded function (around line 213) and add this immediately after it:

```typescript
/**
 * Detect if user is asking about Nozbe tasks and fetch data directly
 * This prevents Claude from needing to know Nozbe command syntax
 */
async function fetchNozbeIfNeeded(query: string): Promise<string | undefined> {
  const lowerQuery = query.toLowerCase();

  // Keywords that indicate task/Nozbe interest
  const taskKeywords = [
    'tarea', 'tareas', 'nozbe', 'pendiente', 'pendientes',
    'completar', 'terminar', 'acabar', 'proyecto', 'proyectos'
  ];

  const hasTaskKeyword = taskKeywords.some(keyword => lowerQuery.includes(keyword));

  if (!hasTaskKeyword) {
    return undefined;
  }

  console.log("Task-related query detected, fetching Nozbe data...");

  try {
    // Get active tasks
    const tasks = await getTasks({ status: "active" });

    if (tasks.length === 0) {
      return "**NOZBE DATA (pre-fetched):**\n\nNo hay tareas activas en este momento.";
    }

    // Format tasks for context
    const tasksList = NozbeCommands.formatTasksList(tasks);

    return `**NOZBE DATA (pre-fetched):**\n\n${tasksList}\n\n...`;
  } catch (error) {
    console.error("Nozbe fetch failed:", error);
    // Don't include error in response, just log it
    return undefined;
  }
}
```

Run: `bun --eval 'import("./src/relay.ts"); console.log("✅ fetchNozbeIfNeeded OK")'`
Expected: "✅ fetchNozbeIfNeeded OK"

- [ ] **Step 2: Commit**

```bash
git add src/relay.ts
git commit -m "feat(nozbe): Add fetchNozbeIfNeeded for natural language

- Detect task-related keywords in user queries
- Fetch active tasks when keywords found
- Format tasks for Claude context
- Graceful degradation on errors
- Pattern matches fetchGwsIfNeeded

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 13: Wire fetchNozbeIfNeeded into message handlers

**Files:**
- Modify: `src/relay.ts`
- Line: ~623 and ~688 (where fetchGwsIfNeeded is called)

- [ ] **Step 1: Add Nozbe fetch to text message handler**

Find this line in the text message handler (around line 623):
```typescript
const gwsData = await fetchGwsIfNeeded(text);
```

Add immediately after:
```typescript
// Pre-fetch Nozbe data if user is asking about tasks
const nozbeData = await fetchNozbeIfNeeded(text);
if (nozbeData) {
  await ctx.replyWithChatAction("typing");
}
```

- [ ] **Step 2: Add Nozbe fetch to voice message handler**

Find this line in the voice message handler (around line 688):
```typescript
const gwsData = await fetchGwsIfNeeded(transcription);
```

Add immediately after:
```typescript
// Pre-fetch Nozbe data if voice message is about tasks
const nozbeData = await fetchNozbeIfNeeded(transcription);
if (nozbeData) {
  await ctx.replyWithChatAction("typing");
}
```

- [ ] **Step 3: Update buildPrompt calls to include nozbeData**

Find both buildPrompt calls and update them:

First (text handler, around line 635):
```typescript
const enrichedPrompt = buildPrompt(text, recentMessages, relevantContext, memoryContext, webSearchResults, gwsData, nozbeData);
```

Second (voice handler, around line 699):
```typescript
const enrichedPrompt = buildPrompt(
  `[Voice message transcribed]: ${transcription}`,
  recentMessages,
  relevantContext,
  memoryContext,
  webSearchResults,
  gwsData,
  nozbeData
);
```

- [ ] **Step 4: Update buildPrompt function signature**

Find the buildPrompt function and update its signature to accept nozbeData parameter.

Run: `bun --eval 'import("./src/relay.ts"); console.log("✅ Relay integration OK")'`
Expected: "✅ Relay integration OK"

- [ ] **Step 5: Commit**

```bash
git add src/relay.ts
git commit -m "feat(nozbe): Wire fetchNozbeIfNeeded into message flow

- Call fetchNozbeIfNeeded in text and voice handlers
- Pass nozbeData to buildPrompt
- Include Nozbe data in Claude context
- Matches existing GWS pattern

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 14: Add /nozbe command handler

**Files:**
- Modify: `src/relay.ts`
- Line: ~540 (after gws command handler)

- [ ] **Step 1: Add /nozbe command**

Find the gws command handler (around line 532) and add this after it:

```typescript
// Nozbe commands
bot.command("nozbe", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  console.log(`Nozbe command: ${args}`);

  await ctx.replyWithChatAction("typing");

  try {
    // If project name provided, list tasks for that project
    if (args) {
      const projects = await NozbeCommands.getProjects();
      const project = projects.find((p: NozbeProject) =>
        p.name.toLowerCase().includes(args.toLowerCase())
      );

      if (!project) {
        await ctx.reply(`❌ Proyecto "${args}" no encontrado. Proyectos disponibles:\n${projects.map((p: NozbeProject) => p.name).join(", ")}`);
        return;
      }

      const tasks = await NozbeCommands.listByProject(project.id);
      const output = NozbeCommands.formatTasksList(tasks);
      await ctx.reply(output, { parse_mode: "Markdown" });
      return;
    }

    // List all active tasks
    const tasks = await NozbeCommands.listActive();
    const output = NozbeCommands.formatTasksList(tasks);
    await ctx.reply(output, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

// Alias for /nozbe
bot.command("tasks", async (ctx) => {
  // Reuse the nozbe command handler
  // Trigger by simulating the nozbe command
  ctx.message.text = "/nozbe";
  // Will be handled by the nozbe command above
});
```

Wait - the alias approach won't work with grammy. Let me fix this:

```typescript
// Nozbe commands
bot.command("nozbe", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  console.log(`Nozbe command: ${args}`);

  await ctx.replyWithChatAction("typing");

  try {
    // If project name provided, list tasks for that project
    if (args) {
      const projects = await NozbeCommands.getProjects();
      const project = projects.find((p: NozbeProject) =>
        p.name.toLowerCase().includes(args.toLowerCase())
      );

      if (!project) {
        await ctx.reply(`❌ Proyecto "${args}" no encontrado. Proyectos disponibles:\n${projects.map((p: NozbeProject) => p.name).join(", ")}`);
        return;
      }

      const tasks = await NozbeCommands.listByProject(project.id);
      const output = NozbeCommands.formatTasksList(tasks);
      await ctx.reply(output, { parse_mode: "Markdown" });
      return;
    }

    // List all active tasks
    const tasks = await NozbeCommands.listActive();
    const output = NozbeCommands.formatTasksList(tasks);
    await ctx.reply(output, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

// Alias for /nozbe
bot.command("tasks", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  console.log(`Tasks command: ${args}`);

  await ctx.replyWithChatAction("typing");

  try {
    const tasks = await NozbeCommands.listActive();
    const output = NozbeCommands.formatTasksList(tasks);
    await ctx.reply(output, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});
```

Run: `bun --eval 'import("./src/relay.ts"); console.log("✅ Commands OK")'`
Expected: "✅ Commands OK"

- [ ] **Step 2: Commit**

```bash
git add src/relay.ts
git commit -m "feat(nozbe): Add /nozbe and /tasks commands

- /nozbe - List all active tasks or tasks in specific project
- /tasks - Alias for /nozbe
- Fuzzy match project names when filtering
- Show error if project not found
- Format output with emojis and task details

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 15: Add /tarea command handler

**Files:**
- Modify: `src/relay.ts`
- Line: ~600 (after tasks command)

- [ ] **Step 1: Add /tarea command**

```typescript
bot.command("tarea", async (ctx) => {
  const text = ctx.message.text.split(" ").slice(1).join(" ").trim();
  console.log(`Tarea command: ${text}`);

  await ctx.replyWithChatAction("typing");

  // Validate task name
  if (!text || text.length < 2) {
    await ctx.reply("❌ La tarea necesita un nombre. Ej: `/tarea Comprar leche`");
    return;
  }

  try {
    // Check for @project pattern
    const projectMatch = text.match(/@(\w+)$/);
    let taskName = text;
    let projectName: string | undefined;

    if (projectMatch) {
      projectName = projectMatch[1];
      taskName = text.replace(/@\w+$/, "").trim();
    }

    let projectId: string | undefined;

    // If project specified, find it
    if (projectName) {
      const projects = await NozbeCommands.getProjects();
      const project = projects.find((p: NozbeProject) =>
        p.name.toLowerCase().includes(projectName!.toLowerCase())
      );

      if (project) {
        projectId = project.id;
      } else {
        await ctx.reply(`⚠️ Proyecto '@${projectName}' no encontrado. Creando en proyecto por defecto.`);
      }
    }

    // Get default project if none specified
    if (!projectId) {
      const projects = await NozbeCommands.getProjects();
      if (projects.length > 0) {
        projectId = projects[0].id; // Use first project as default
      } else {
        await ctx.reply("❌ No hay proyectos en Nozbe. Crea uno primero.");
        return;
      }
    }

    // Create the task
    const task = await NozbeCommands.create({
      name: taskName,
      projectId: projectId,
    });

    await ctx.reply(`✅ Tarea creada:\n\n**${task.name}**\nID: \`${task.id}\``, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});
```

Run: `bun --eval 'import("./src/relay.ts"); console.log("✅ Tarea command OK")'`
Expected: "✅ Tarea command OK"

- [ ] **Step 2: Commit**

```bash
git add src/relay.ts
git commit -m "feat(nozbe): Add /tarea command

- Create tasks with /tarea <name> [@project]
- Parse project name using regex pattern
- Fuzzy match project names
- Use first project as default if none specified
- Validate task name minimum length
- Return helpful error messages

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 16: Add /completar command handler

**Files:**
- Modify: `src/relay.ts`
- Line: ~660 (after tarea command)

- [ ] **Step 1: Add /completar command**

```typescript
bot.command("completar", async (ctx) => {
  const taskId = ctx.message.text.split(" ")[1]?.trim();
  console.log(`Completar command: ${taskId}`);

  await ctx.replyWithChatAction("typing");

  // Validate task ID
  if (!taskId) {
    await ctx.reply("❌ Necesito el ID de la tarea. Ej: `/completar abc123`");
    return;
  }

  try {
    const success = await NozbeCommands.complete(taskId);

    if (success) {
      await ctx.reply("✅ Tarea completada");
    } else {
      await ctx.reply("❌ No se pudo completar la tarea");
    }
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});
```

Run: `bun --eval 'import("./src/relay.ts"); console.log("✅ Completar command OK")'`
Expected: "✅ Completar command OK"

- [ ] **Step 2: Commit**

```bash
git add src/relay.ts
git commit -m "feat(nozbe): Add /completar command

- Mark tasks as completed with /completar <id>
- Validate task ID is provided
- Return success/error messages
- Handle not found errors gracefully

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 17: Add /comentario command handler

**Files:**
- Modify: `src/relay.ts`
- Line: ~680 (after completar command)

- [ ] **Step 1: Add /comentario command**

```typescript
bot.command("comentario", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const taskId = parts[1]?.trim();
  const text = parts.slice(2).join(" ").trim();
  console.log(`Comentario command: taskId=${taskId}, text=${text}`);

  await ctx.replyWithChatAction("typing");

  // Validate task ID
  if (!taskId) {
    await ctx.reply("❌ Necesito el ID de la tarea. Ej: `/comentario abc123 Tu texto`");
    return;
  }

  // Validate comment text
  if (!text || text.length < 2) {
    await ctx.reply("❌ Necesito el texto del comentario. Ej: `/comentario abc123 Tu texto`");
    return;
  }

  try {
    const success = await NozbeCommands.comment(taskId, text);

    if (success) {
      await ctx.reply("✅ Comentario añadido");
    } else {
      await ctx.reply("❌ No se pudo añadir el comentario");
    }
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});
```

Run: `bun --eval 'import("./src/relay.ts"); console.log("✅ Comentario command OK")'`
Expected: "✅ Comentario command OK"

- [ ] **Step 2: Commit**

```bash
git add src/relay.ts
git commit -m "feat(nozbe): Add /comentario command

- Add comments to tasks with /comentario <id> <text>
- Parse task ID and text by splitting on first space
- Validate both ID and text are provided
- Return helpful error messages for missing data

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: Morning Briefing Integration

This chunk adds Nozbe tasks to the daily morning briefing with timezone-aware date filtering.

### Task 18: Add getNozbeTasks function to morning briefing

**Files:**
- Modify: `examples/morning-briefing-personal.ts`
- Line: ~202 (after getYesterdaySummary function)

- [ ] **Step 1: Add imports**

Find the imports section and add:
```typescript
import { getTasks } from "../src/nozbe-helper.ts";
```

- [ ] **Step 2: Add getNozbeTasks function**

Add after getYesterdaySummary function:

```typescript
async function getNozbeTasks(): Promise<string> {
  if (!process.env.NOZBE_API_TOKEN) {
    return "";
  }

  try {
    const activeTasks = await getTasks({ status: "active" });

    if (activeTasks.length === 0) {
      return "✅ No hay tareas urgentes";
    }

    // Get timezone from env or default to Europe/Madrid
    const timezone = process.env.USER_TIMEZONE || "Europe/Madrid";

    const now = new Date();
    // Convert to user's timezone for accurate day comparisons
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Categorize tasks
    const overdue = activeTasks.filter(t => {
      if (!t.due_date) return false;
      const dueDate = new Date(new Date(t.due_date).toLocaleString("en-US", { timeZone: timezone }));
      return dueDate < today;
    });

    const dueToday = activeTasks.filter(t => {
      if (!t.due_date) return false;
      const dueDate = new Date(new Date(t.due_date).toLocaleString("en-US", { timeZone: timezone }));
      return dueDate >= today && dueDate < tomorrow;
    });

    const dueThisWeek = activeTasks.filter(t => {
      if (!t.due_date) return false;
      const dueDate = new Date(new Date(t.due_date).toLocaleString("en-US", { timeZone: timezone }));
      return dueDate >= tomorrow && dueDate < nextWeek;
    });

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
      const shown = dueThisWeek.slice(0, 5);
      shown.forEach(t => output += `   • ${t.name}\n`);
      if (dueThisWeek.length > 5) {
        output += `   ... y ${dueThisWeek.length - 5} más\n`;
      }
    }

    if (overdue.length === 0 && dueToday.length === 0 && dueThisWeek.length === 0) {
      output = "✅ No hay tareas urgentes";
    }

    return output;
  } catch (error) {
    console.error("Nozbe fetch failed:", error);
    return ""; // Don't break briefing if Nozbe fails
  }
}
```

Run: `bun --eval 'import("./examples/morning-briefing-personal.ts"); console.log("✅ Function OK")'`
Expected: "✅ Function OK"

- [ ] **Step 3: Commit**

```bash
git add examples/morning-briefing-personal.ts
git commit -m "feat(nozbe): Add getNozbeTasks to morning briefing

- Fetch active tasks from Nozbe
- Categorize by overdue, today, this week
- Use USER_TIMEZONE for accurate date comparisons
- Limit to 5 tasks for this week category
- Return empty string on error (graceful degradation)
- Tasks without due dates are excluded from briefing

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 19: Integrate Nozbe tasks into buildBriefing

**Files:**
- Modify: `examples/morning-briefing-personal.ts`
- Line: ~230 (in buildBriefing function, after goals section)

- [ ] **Step 1: Add Nozbe section to buildBriefing**

Find the buildBriefing function and add this after the goals section (after the "Goals urgentes" try-catch block):

```typescript
  // Nozbe tasks
  try {
    const nozbeTasks = await getNozbeTasks();
    if (nozbeTasks) {
      sections.push(`${nozbeTasks}\n`);
    }
  } catch (e) {
    console.error("Nozbe tasks fetch failed:", e);
  }
```

Run: `bun --eval 'import("./examples/morning-briefing-personal.ts"); console.log("✅ Integration OK")'`
Expected: "✅ Integration OK"

- [ ] **Step 2: Commit**

```bash
git add examples/morning-briefing-personal.ts
git commit -m "feat(nozbe): Integrate tasks into morning briefing

- Add Nozbe tasks section after Goals
- Only show section if data available
- Graceful error handling
- Section appears between Goals and Facts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: Testing

This chunk creates comprehensive test files to verify API access, command handlers, and morning briefing integration.

### Task 20: Create test-nozbe-access.ts

**Files:**
- Create: `test-nozbe-access.ts`

- [ ] **Step 1: Write the test file**

```typescript
/**
 * Test script for Nozbe API access
 * Verifies that Nozbe integration works correctly
 */

import { config } from "dotenv";
config();

import {
  getProjects,
  getTasks,
  createTask,
  completeTask,
  addComment,
  getTaskDetails,
  NozbeCommands,
} from "./src/nozbe-helper.ts";

console.log("=".repeat(60));
console.log("🧪 Testing Nozbe API Access");
console.log("=".repeat(60));

console.log("\n🔑 Credentials check:");
console.log("NOZBE_API_TOKEN:", process.env.NOZBE_API_TOKEN ? "SET ✓" : "NOT SET ✗");

if (!process.env.NOZBE_API_TOKEN) {
  console.error("\n❌ NOZBE_API_TOKEN is required. Set it in .env file.");
  process.exit(1);
}

// Test 1: Connection
async function testConnection() {
  console.log("\n📡 Testing connection...");

  try {
    const projects = await getProjects();
    console.log(`✅ Connection OK. Found ${projects.length} projects`);

    if (projects.length > 0) {
      console.log("Projects:", projects.map((p) => p.name).join(", "));
    }

    return true;
  } catch (error) {
    console.log("❌ Connection FAILED:", error);
    return false;
  }
}

// Test 2: List active tasks
async function testListTasks() {
  console.log("\n📋 Testing list tasks...");

  try {
    const tasks = await getTasks({ status: "active" });
    console.log(`✅ List tasks OK. Found ${tasks.length} active tasks`);
    return true;
  } catch (error) {
    console.log("❌ List tasks FAILED:", error);
    return false;
  }
}

// Test 3: Create task
async function testCreateTask() {
  console.log("\n➕ Testing create task...");

  try {
    const projects = await getProjects();
    if (projects.length === 0) {
      console.log("⚠️  No projects available, skipping task creation");
      return null;
    }

    const testTaskName = `Claude Test Task ${Date.now()}`;
    const task = await createTask({
      name: testTaskName,
      projectId: projects[0].id,
    });

    console.log("✅ Create task OK:", task.name);
    console.log("   Task ID:", task.id);
    return task;
  } catch (error) {
    console.log("❌ Create task FAILED:", error);
    return null;
  }
}

// Test 4: Add comment
async function testAddComment(taskId: string) {
  console.log("\n💬 Testing add comment...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping comment test");
    return false;
  }

  try {
    const success = await addComment(taskId, "Test comment from automated test");
    if (success) {
      console.log("✅ Add comment OK");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ Add comment FAILED:", error);
    return false;
  }
}

// Test 5: Verify comment in task details
async function testTaskDetails(taskId: string) {
  console.log("\n🔍 Testing task details...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping details test");
    return false;
  }

  try {
    const task = await getTaskDetails(taskId);
    console.log(`✅ Task details OK. Comments: ${task.comments_count || 0}`);
    return true;
  } catch (error) {
    console.log("❌ Task details FAILED:", error);
    return false;
  }
}

// Test 6: Complete task
async function testCompleteTask(taskId: string) {
  console.log("\n✅ Testing complete task...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping complete test");
    return false;
  }

  try {
    const success = await completeTask(taskId);
    if (success) {
      console.log("✅ Complete task OK");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ Complete task FAILED:", error);
    return false;
  }
}

// Test 7: Edge cases
async function testEdgeCases() {
  console.log("\n⚠️  Testing edge cases...");

  let allPassed = true;

  // Invalid token (skip this test as it would require changing env)
  // Non-existent task ID
  try {
    await getTaskDetails("nonexistent-id");
    console.log("❌ Should have thrown for non-existent task");
    allPassed = false;
  } catch (error) {
    if (error instanceof Error && error.message.includes("No encontré")) {
      console.log("✅ Non-existent task ID handled correctly");
    } else {
      console.log("❌ Wrong error message:", error);
      allPassed = false;
    }
  }

  return allPassed;
}

// Main test runner
async function main() {
  const tests = [
    { name: "Connection", fn: testConnection },
    { name: "List tasks", fn: testListTasks },
    { name: "Create task", fn: testCreateTask },
    { name: "Add comment", fn: () => testCreateTask().then(task => task ? testAddComment(task.id) : false) },
    { name: "Task details", fn: () => testCreateTask().then(task => task ? testTaskDetails(task.id) : false) },
    { name: "Complete task", fn: () => testCreateTask().then(task => task ? testCompleteTask(task.id) : false) },
    { name: "Edge cases", fn: testEdgeCases },
  ];

  const results = await Promise.all(
    tests.map(async (test) => {
      try {
        const passed = await test.fn();
        return { name: test.name, passed };
      } catch (error) {
        console.error(`\n❌ ${test.name} threw error:`, error);
        return { name: test.name, passed: false };
      }
    })
  );

  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Results Summary:");
  console.log("=".repeat(60));

  results.forEach((result) => {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}: ${result.name}`);
  });

  const allPassed = results.every((r) => r.passed);
  console.log("=".repeat(60));

  if (allPassed) {
    console.log("\n🎉 All Nozbe API tests passed!");
    console.log("\n✅ Nozbe integration is working correctly");
  } else {
    console.log("\n⚠️  Some tests failed. Check the errors above.");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
```

Run: `cat test-nozbe-access.ts | head -20`
Expected: File content displayed

- [ ] **Step 2: Commit**

```bash
git add test-nozbe-access.ts
git commit -m "test(nozbe): Add API access test suite

- Test connection and authentication
- Test list projects and tasks
- Test create, comment, complete operations
- Test edge cases (non-existent task)
- Verify error messages
- Detailed test result summary

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 21: Create test-nozbe-commands.ts

**Files:**
- Create: `test-nozbe-commands.ts`

- [ ] **Step 1: Write the test file**

```typescript
/**
 * Test script for Nozbe Telegram commands
 * Simulates what happens when the user sends commands via Telegram
 */

import { config } from "dotenv";
config();

import {
  getProjects,
  getTasks,
  createTask,
  completeTask,
  addComment,
  NozbeCommands,
} from "./src/nozbe-helper.ts";

console.log("=".repeat(60));
console.log("🤖 Testing Nozbe Bot Commands");
console.log("=".repeat(60));

// Test /nozbe command
async function testNozbeCommand() {
  console.log("\n📋 Testing /nozbe command...");

  try {
    const result = await NozbeCommands.listActive();
    const output = NozbeCommands.formatTasksList(result);

    console.log("✅ /nozbe command works");
    console.log("Output preview:");
    console.log(output.substring(0, 300) + "...\n");
    return true;
  } catch (error) {
    console.log("❌ /nozbe command failed:", error);
    return false;
  }
}

// Test /tarea command (create task)
async function testTareaCommand() {
  console.log("\n➕ Testing /tarea command...");

  try {
    const projects = await getProjects();
    if (projects.length === 0) {
      console.log("⚠️  No projects available, skipping task creation");
      return false;
    }

    const testTaskName = `Test task from commands ${Date.now()}`;
    const task = await createTask({
      name: testTaskName,
      projectId: projects[0].id,
    });

    if (task) {
      console.log("✅ /tarea command works");
      console.log("Created task:", task.name);
      console.log("Task ID:", task.id);
      return { success: true, taskId: task.id };
    }
    return { success: false, taskId: null };
  } catch (error) {
    console.log("❌ /tarea command failed:", error);
    return { success: false, taskId: null };
  }
}

// Test /comentario command
async function testComentarioCommand(taskId: string) {
  console.log("\n💬 Testing /comentario command...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping comment test");
    return false;
  }

  try {
    const result = await addComment(taskId, "Test comment from command test");

    if (result) {
      console.log("✅ /comentario command works");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ /comentario command failed:", error);
    return false;
  }
}

// Test /completar command
async function testCompletarCommand(taskId: string) {
  console.log("\n✅ Testing /completar command...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping complete test");
    return false;
  }

  try {
    const result = await completeTask(taskId);

    if (result) {
      console.log("✅ /completar command works");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ /completar command failed:", error);
    return false;
  }
}

// Test natural language detection
async function testNaturalLanguageDetection() {
  console.log("\n🔮 Testing natural language detection...");

  try {
    const result = await getTasks({ status: "active" });

    if (result) {
      console.log("✅ Natural language pre-fetch works");
      console.log("Would return tasks for queries like '¿qué tareas tengo?'");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ Natural language detection failed:", error);
    return false;
  }
}

async function main() {
  console.log("\n🔑 Credentials check:");
  console.log("NOZBE_API_TOKEN:", process.env.NOZBE_API_TOKEN ? "SET ✓" : "NOT SET ✗");

  const tests = [
    { name: "Nozbe list", fn: testNozbeCommand },
    { name: "Tarea create", fn: testTareaCommand },
    { name: "Comment add", fn: () => testTareaCommand().then(r => r.success && r.taskId ? testComentarioCommand(r.taskId) : false) },
    { name: "Task complete", fn: () => testTareaCommand().then(r => r.success && r.taskId ? testCompletarCommand(r.taskId) : false) },
    { name: "Natural language", fn: testNaturalLanguageDetection },
  ];

  const results = await Promise.all(
    tests.map(async (test) => {
      try {
        const passed = await test.fn();
        return { name: test.name, passed };
      } catch (error) {
        console.error(`\n❌ ${test.name} threw error:`, error);
        return { name: test.name, passed: false };
      }
    })
  );

  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Results Summary:");
  console.log("=".repeat(60));

  results.forEach((result) => {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}: ${result.name}`);
  });

  const allPassed = results.every((r) => r.passed);
  console.log("=".repeat(60));

  if (allPassed) {
    console.log("\n🎉 All bot commands are working correctly!");
    console.log("\n✅ You can now use your Telegram bot:");
    console.log("   • /nozbe [project] - List tasks");
    console.log("   • /tarea <name> [@project] - Create task");
    console.log("   • /completar <id> - Complete task");
    console.log("   • /comentario <id> <text> - Add comment");
    console.log("   • Natural queries like \"¿qué tareas tengo?\" work too!");
  } else {
    console.log("\n⚠️  Some commands failed. Check the errors above.");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
```

Run: `cat test-nozbe-commands.ts | head -20`
Expected: File content displayed

- [ ] **Step 2: Commit**

```bash
git add test-nozbe-commands.ts
git commit -m "test(nozbe): Add command handler test suite

- Test /nozbe command (list tasks)
- Test /tarea command (create task)
- Test /comentario command (add comment)
- Test /completar command (complete task)
- Test natural language detection
- Simulate Telegram command flow
- Detailed test result summary

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 22: Add test:nozbe script to package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add test script**

Find the "scripts" section and add this line:
```json
"test:nozbe": "bun run test-nozbe-access.ts && bun run test-nozbe-commands.ts",
```

Place it after the "test:websearch" line for alphabetical ordering.

Run: `cat package.json | grep test:`
Expected: All test scripts listed including test:nozbe

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "test(nozbe): Add test:nozbe script to package.json

- Run both test files in sequence
- Exit with error if either test fails
- Consistent with existing test script patterns

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 23: Verify .gitignore ignores .env

**Files:**
- Check: `.gitignore`

- [ ] **Step 1: Verify .env is ignored**

Run: `cat .gitignore | grep "\.env"`
Expected: `.env` is in the ignore list

If not found, add it:
```bash
echo ".env" >> .gitignore
git add .gitignore
git commit -m "chore: Ensure .env is in .gitignore

- NOZBE_API_TOKEN should not be committed
- .env file contains sensitive credentials

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 24: Run tests to verify implementation

**Files:**
- None (verification only)

- [ ] **Step 1: Run Nozbe tests**

Run: `bun run test:nozbe`
Expected: All tests pass

If tests fail, debug and fix before proceeding.

- [ ] **Step 2: Test morning briefing manually**

Run: `bun run examples/morning-briefing-personal.ts`
Expected: Briefing sent with Nozbe tasks section

- [ ] **Step 3: Commit final verification**

```bash
git add docs/superpowers/plans/2026-03-20-nozbe-integration.md
git commit -m "docs: Add Nozbe integration implementation plan

- Comprehensive plan with 24 tasks across 4 chunks
- TDD approach with tests before implementation
- Detailed code snippets and exact commands
- Verification steps for each task
- Ready for agentic execution

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Success Criteria

After completing all tasks:

✅ `src/nozbe-helper.ts` exists with full API integration
✅ Telegram commands `/nozbe`, `/tarea`, `/tasks`, `/completar`, `/comentario` work
✅ Natural language queries like "¿qué tareas tengo?" return task data
✅ Morning briefing includes Nozbe tasks section
✅ `bun run test:nozbe` passes all tests
✅ Graceful error handling (bot doesn't crash if Nozbe API fails)

## Documentation Updates Needed

After implementation, update:
1. `README.md` - Add Nozbe integration section
2. `.env.example` - Add `NOZBE_API_TOKEN` placeholder
3. `CLAUDE.md` - Add setup instructions for Nozbe token
