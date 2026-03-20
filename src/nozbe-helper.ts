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

// ============================================================
// FETCH WITH RETRY LOGIC
// ============================================================

interface FetchNozbeOptions extends RequestInit {
  retries?: number;
}

export async function fetchNozbe(
  endpoint: string,
  options: FetchNozbeOptions = {}
): Promise<Response> {
  const { retries = 3, ...fetchOptions } = options;

  if (!NOZBE_API_TOKEN) {
    throw new Error("NOZBE_API_TOKEN is not configured");
  }

  const url = `${NOZBE_API_BASE}${endpoint}`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Log retry attempt (if not first attempt)
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt + 1}/${retries}...`);
      }

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
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 2}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // Handle authentication errors
      if (response.status === 401) {
        throw new Error(
          "Token de Nozbe inválido o expirado. Genera uno nuevo en nozbe.help/api"
        );
      }

      // Successful response
      return response;
    } catch (error) {
      // Store error for final throw if all retries fail
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this is the last attempt, we'll throw after the loop
      if (attempt < retries - 1) {
        console.error(`Fetch attempt ${attempt + 1} failed:`, lastError.message);
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error("Max retries exceeded");
}

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

// ============================================================
// TASKS API
// ============================================================

/**
 * Options for filtering tasks from Nozbe API
 */
export interface GetTasksOptions {
  /** Filter by project ID */
  projectId?: string;
  /** Filter by status: "active" or "completed" */
  status?: "active" | "completed";
  /** Filter tasks due before this date (ISO format: YYYY-MM-DD) */
  dueBefore?: string;
  /** Maximum number of tasks to return */
  limit?: number;
}

/**
 * Get tasks from Nozbe with optional filtering
 * @param options Filter options for tasks query
 * @returns Promise<NozbeTask[]> Array of tasks matching filters
 */
export async function getTasks(options?: GetTasksOptions): Promise<NozbeTask[]> {
  try {
    // Build query string using URLSearchParams
    const params = new URLSearchParams();

    if (options?.projectId) {
      params.append("project_id", options.projectId);
    }

    if (options?.status) {
      params.append("status", options.status);
    }

    // LHS bracket notation for Nozbe API filtering
    // Example: "due_date<2026-03-21" filters tasks due before March 21, 2026
    if (options?.dueBefore) {
      params.append("due_date<", options.dueBefore);
    }

    if (options?.limit) {
      params.append("limit", String(options.limit));
    }

    // Build endpoint with query string
    const queryString = params.toString();
    const endpoint = queryString ? `/api/tasks?${queryString}` : "/api/tasks";

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

/**
 * Data for creating a new task
 */
export interface CreateTaskData {
  /** Task name/title (required) */
  name: string;
  /** Project ID to assign task to (required) */
  projectId: string;
  /** Optional due date in ISO format */
  dueDate?: string;
  /** Optional priority level (0-3) */
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

/**
 * Get status emoji for a task
 * @param task Task to get emoji for
 * @returns Emoji string representing task status
 */
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

// ============================================================
// COMMON COMMANDS (like GwsCommands)
// ============================================================

/**
 * Convenience export for common Nozbe operations
 * Pattern matches existing GwsCommands for consistency
 */
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
