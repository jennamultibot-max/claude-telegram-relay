/**
 * Memory Module
 *
 * Persistent facts, goals, and preferences stored in Supabase.
 * Claude manages memory automatically via intent tags in its responses:
 *   [REMEMBER: fact]
 *   [GOAL: text | DEADLINE: date]
 *   [DONE: search text]
 *   [NOZBE_TASK: task name @project?]
 *   [NOZBE_COMMENT: task_id | comment]
 *
 * The relay parses these tags, saves to Supabase/Nozbe, and strips them
 * from the response before sending to the user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTask, addComment, getProjects, NozbeProject } from "./nozbe-helper.ts";

// Goal interface
interface Goal {
  id: string;
  content: string;
  deadline: string | null;
  priority: number;
  completed_at: string | null;
  created_at: string;
}

/**
 * Parse Claude's response for memory intent tags.
 * Saves facts/goals to Supabase and returns the cleaned response.
 */
export async function processMemoryIntents(
  supabase: SupabaseClient | null,
  response: string
): Promise<string> {
  let clean = response;

  // [NOZBE_TASK: task name @project?] - Create task in Nozbe (works without Supabase)
  for (const match of response.matchAll(/\[NOZBE_TASK:\s*(.+?)\]/gi)) {
    try {
      const taskInput = match[1].trim();
      let taskName = taskInput;
      let projectName: string | undefined;

      // Check for @project pattern
      const projectMatch = taskInput.match(/@(\w+)$/);
      if (projectMatch) {
        projectName = projectMatch[1];
        taskName = taskInput.replace(/@\w+$/, "").trim();
      }

      let projectId: string | undefined;

      // If project specified, find it
      if (projectName) {
        const projects = await getProjects();
        const project = projects.find((p: NozbeProject) =>
          p.name.toLowerCase().includes(projectName!.toLowerCase())
        );
        if (project) {
          projectId = project.id;
        }
      }

      // Get default project if none specified
      if (!projectId) {
        const projects = await getProjects();
        const openProjects = projects.filter((p: NozbeProject) =>
          p.is_open !== false && !p.is_single_actions
        );

        if (openProjects.length > 0) {
          const preferredProject = openProjects.find((p: NozbeProject) =>
            p.name.toLowerCase().includes("jenna")
          );
          projectId = preferredProject?.id || openProjects[0].id;
        }
      }

      if (projectId) {
        const task = await createTask({
          name: taskName,
          projectId: projectId,
        });
        clean = clean.replace(match[0], `✅ Tarea creada: **${task.name}** (ID: \`${task.id}\`)`);
      }
    } catch (error) {
      console.error("Nozbe task creation error:", error);
      clean = clean.replace(match[0], `⚠️ Error creando tarea: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  // [NOZBE_COMMENT: task_id | comment] - Add comment to task (works without Supabase)
  for (const match of response.matchAll(/\[NOZBE_COMMENT:\s*(.+?)\]/gi)) {
    try {
      const parts = match[1].split("|").map(s => s.trim());
      if (parts.length >= 2) {
        const taskId = parts[0];
        const comment = parts.slice(1).join("|").trim(); // Rejoin in case comment contains |

        if (comment.length < 2) {
          clean = clean.replace(match[0], `⚠️ El comentario debe tener al menos 2 caracteres`);
          continue;
        }

        await addComment(taskId, comment);
        clean = clean.replace(match[0], `✅ Comentario añadido a tarea \`${taskId}\``);
      } else {
        clean = clean.replace(match[0], `⚠️ Formato incorrecto. Usa: [NOZBE_COMMENT: task_id | comentario]`);
      }
    } catch (error) {
      console.error("Nozbe comment error:", error);
      clean = clean.replace(match[0], `⚠️ Error añadiendo comentario: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  // Skip Supabase operations if not available
  if (!supabase) return clean.trim();

  // [REMEMBER: fact to store]
  for (const match of response.matchAll(/\[REMEMBER:\s*(.+?)\]/gi)) {
    await supabase.from("memory").insert({
      type: "fact",
      content: match[1],
    });
    clean = clean.replace(match[0], "");
  }

  // [GOAL: text] or [GOAL: text | DEADLINE: date]
  for (const match of response.matchAll(
    /\[GOAL:\s*(.+?)(?:\s*\|\s*DEADLINE:\s*(.+?))?\]/gi
  )) {
    await supabase.from("memory").insert({
      type: "goal",
      content: match[1],
      deadline: match[2] || null,
    });
    clean = clean.replace(match[0], "");
  }

  // [DONE: search text for completed goal]
  for (const match of response.matchAll(/\[DONE:\s*(.+?)\]/gi)) {
    const { data } = await supabase
      .from("memory")
      .select("id")
      .eq("type", "goal")
      .ilike("content", `%${match[1]}%`)
      .limit(1);

    if (data?.[0]) {
      await supabase
        .from("memory")
        .update({
          type: "completed_goal",
          completed_at: new Date().toISOString(),
        })
        .eq("id", data[0].id);
    }
    clean = clean.replace(match[0], "");
  }

  return clean.trim();
}

/**
 * Get recent conversation messages for context.
 * This helps maintain conversation continuity between messages.
 */
export async function getRecentMessages(
  supabase: SupabaseClient | null,
  limit: number = 10
): Promise<string> {
  if (!supabase) return "";

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching recent messages:", error);
      return "";
    }

    if (!data || data.length === 0) return "";

    // Reverse to show oldest first (conversation order)
    const reversed = [...data].reverse();

    return (
      "RECENT CONVERSATION:\n" +
      reversed
        .map((m: any) => `[${m.role}]: ${m.content}`)
        .join("\n")
    );
  } catch (error) {
    console.error("Recent messages error:", error);
    return "";
  }
}

/**
 * Get all facts and active goals for prompt context.
 */
export async function getMemoryContext(
  supabase: SupabaseClient | null
): Promise<string> {
  if (!supabase) return "";

  try {
    const [factsResult, goalsResult] = await Promise.all([
      supabase.rpc("get_facts"),
      supabase.rpc("get_active_goals"),
    ]);

    const parts: string[] = [];

    if (factsResult.data?.length) {
      parts.push(
        "FACTS:\n" +
          factsResult.data.map((f: any) => `- ${f.content}`).join("\n")
      );
    }

    if (goalsResult.data?.length) {
      parts.push(
        "GOALS:\n" +
          goalsResult.data
            .map((g: any) => {
              const deadline = g.deadline
                ? ` (by ${new Date(g.deadline).toLocaleDateString()})`
                : "";
              return `- ${g.content}${deadline}`;
            })
            .join("\n")
      );
    }

    return parts.join("\n\n");
  } catch (error) {
    console.error("Memory context error:", error);
    return "";
  }
}

/**
 * Semantic search for relevant past messages via the search Edge Function.
 * The Edge Function handles embedding generation (OpenAI key stays in Supabase).
 */
export async function getRelevantContext(
  supabase: SupabaseClient | null,
  query: string
): Promise<string> {
  if (!supabase) return "";

  try {
    const { data, error } = await supabase.functions.invoke('search', {
      body: { query, match_count: 5, table: 'messages', match_threshold: 0.3 },
    });

    if (error) {
      console.error("Semantic search error:", error);
      return "";
    }

    if (!data?.length) {
      console.log("No relevant context found for query:", query);
      return "";
    }

    console.log(`Found ${data.length} relevant messages for query: ${query}`);
    return (
      "RELEVANT PAST MESSAGES:\n" +
      data
        .map((m: any) => `[${m.role}]: ${m.content}`)
        .join("\n")
    );
  } catch (err) {
    console.error("Semantic search error:", err);
    return "";
  }
}

// Get active goals from memory table
export async function getActiveGoals(): Promise<Goal[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("memory")
      .select("id, content, deadline, priority, completed_at, created_at")
      .eq("type", "goal")
      .is("completed_at", null)
      .order("priority", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      console.error("Error fetching active goals:", error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      content: row.content,
      deadline: row.deadline,
      priority: row.priority,
      completed_at: row.completed_at,
      created_at: row.created_at
    }));
  } catch (err) {
    console.error("Supabase connection error:", err);
    return [];
  }
}

// Get urgent goals (deadline within 24 hours)
export async function getUrgentGoals(hoursThreshold: number = 24): Promise<Goal[]> {
  const goals = await getActiveGoals();
  const now = new Date();

  return goals.filter(goal => {
    if (!goal.deadline) return false;

    const deadline = new Date(goal.deadline);
    const hoursUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    return hoursUntil <= hoursThreshold;
  });
}
