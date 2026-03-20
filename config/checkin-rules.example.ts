/**
 * Example: How to integrate checkin-rules.ts into smart-checkin-personal.ts
 *
 * This shows the minimal changes needed to use the new rules system.
 */

import {
  DEFAULT_NOTIFICATION_RULES,
  buildCheckinPrompt,
  type CheckinContext,
  type TaskInfo,
} from "../config/checkin-rules";

// In smart-checkin-personal.ts, replace the askClaudeToDecide function with:

async function askClaudeToDecide(): Promise<{
  shouldCheckin: boolean;
  message: string;
  reason: string;
}> {
  const state = await loadState();

  // Gather goals from Supabase (convert to TaskInfo format)
  const goalsData = await getActiveGoalsFromSupabase();
  const goals: TaskInfo[] = goalsData.map((goal: any) => ({
    content: goal.content,
    priority: goal.priority || 1,
    deadline: goal.deadline ? new Date(goal.deadline) : null,
  }));

  // Gather semantic context from search
  const relevantContext = await getSemanticContext();

  // Build the enhanced prompt using checkin-rules
  const context: CheckinContext = {
    goals,
    relevantContext,
    lastMessageTime: new Date(state.lastMessageTime),
    lastCheckinTime: state.lastCheckinTime ? new Date(state.lastCheckinTime) : new Date(0),
    checkinsToday: state.checkinsToday,
    currentTime: new Date(),
    userName: "Germán", // Could come from env or profile.md
  };

  const prompt = buildCheckinPrompt(context, DEFAULT_NOTIFICATION_RULES);

  // Rest of the function remains the same...
  try {
    const proc = spawn([CLAUDE_PATH, "-p", prompt, "--output-format", "text"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: "/Users/german/seconbrain",
      env: {
        ...process.env,
        CLAUDECODE: undefined,
      },
    });

    const output = await new Response(proc.stdout).text();

    const decisionMatch = output.match(/DECISION:\s*(YES|NO)/i);
    const messageMatch = output.match(/MESSAGE:\s*(.+?)(?=\nREASON:|$)/is);
    const reasonMatch = output.match(/REASON:\s*(.+)/is);

    const shouldCheckin = decisionMatch?.[1]?.toUpperCase() === "YES";
    const message = messageMatch?.[1]?.trim() || "";
    const reason = reasonMatch?.[1]?.trim() || "";

    console.log(`\n=== SMART CHECK-IN DECISION ===`);
    console.log(`Decision: ${shouldCheckin ? "YES" : "NO"}`);
    console.log(`Reason: ${reason}`);
    console.log(`Message: ${message ? message.substring(0, 100) + (message.length > 100 ? "..." : "") : "none"}`);
    console.log(`Check-ins today: ${state.checkinsToday}/3`);
    console.log(`============================\n`);

    return { shouldCheckin, message, reason };
  } catch (error) {
    console.error("Claude error:", error);
    return { shouldCheckin: false, message: "", reason: "Error contacting Claude" };
  }
}

// Helper to get goals from Supabase
async function getActiveGoalsFromSupabase() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("memory")
    .select("content, deadline, priority")
    .eq("type", "goal")
    .order("priority", { ascending: false });

  if (error) {
    console.error("Error fetching goals:", error);
    return [];
  }

  return data || [];
}

// Helper to get semantic context from search
async function getSemanticContext(): Promise<string> {
  // This would use the search Edge Function or semantic context
  // For now, return empty or use recent messages
  const recentMessages = await getRecentMessages();
  return recentMessages || "";
}
