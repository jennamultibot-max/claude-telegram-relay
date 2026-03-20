/**
 * Smart Check-in Personalizado para Germán
 *
 * Sistema proactivo donde Claude decide:
 * - SI debe contactarte (basado en contexto)
 * - QUÉ decir (basado en goals, tiempo, etc.)
 *
 * Se ejecuta cada 30 minutos y Claude decide inteligentemente
 * si debe enviarte un mensaje.
 *
 * Run: bun run examples/smart-checkin-personal.ts
 */

import { spawn } from "bun";
import { readFile, writeFile } from "fs/promises";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { join, dirname } from "path";
import { getRelevantContext, Goal } from "../src/embedding-utils.js";
import { buildCheckinPrompt, CheckinContext, TaskInfo, DEFAULT_NOTIFICATION_RULES } from "../config/checkin-rules.js";
import { safeSupabaseCall, logError, logInfo, sendTelegramWithRetry, processPendingTelegramRetry } from "../src/error-handling.js";

const PROJECT_ROOT = dirname(dirname(import.meta.path));

// ============================================================
// CONFIGURACIÓN
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_USER_ID || "";
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";
const STATE_FILE =
  process.env.CHECKIN_STATE_FILE || "/tmp/checkin-state.json";

// Supabase integration
const supabase: SupabaseClient | null =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    : null;

// ============================================================
// STATE MANAGEMENT
// ============================================================

interface CheckinState {
  lastMessageTime: string; // Última vez que el usuario escribió
  lastCheckinTime: string; // Última vez que hicimos check-in
  checkinsToday: number; // Cuántos check-ins hoy
  pendingItems: string[]; // Cosas para hacer follow-up
  lastResetDate: string; // Última fecha de reset de contador
}

async function loadState(): Promise<CheckinState> {
  try {
    const content = await readFile(STATE_FILE, "utf-8");
    const state = JSON.parse(content);

    // Reset contador de check-ins si es un nuevo día
    const today = new Date().toDateString();
    if (state.lastResetDate !== today) {
      state.checkinsToday = 0;
      state.lastResetDate = today;
    }

    return state;
  } catch {
    return {
      lastMessageTime: new Date().toISOString(),
      lastCheckinTime: "",
      checkinsToday: 0,
      pendingItems: [],
      lastResetDate: new Date().toDateString(),
    };
  }
}

async function saveState(state: CheckinState): Promise<void> {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function updateLastMessageTime(): Promise<void> {
  const state = await loadState();
  state.lastMessageTime = new Date().toISOString();
  await saveState(state);
}

// ============================================================
// SUPABASE CONTEXT GATHERING
// ============================================================

/**
 * Map Goal[] to TaskInfo[] for checkin-rules compatibility
 */
function goalsToTaskInfo(goals: Goal[]): TaskInfo[] {
  return goals.map((goal) => ({
    content: goal.content,
    priority: goal.priority,
    deadline: goal.deadline ? new Date(goal.deadline) : null,
    lastActivity: null, // We don't track this yet
  }));
}

async function getActiveGoals(): Promise<Goal[]> {
  if (!supabase) return [];

  return safeSupabaseCall(
    async () => {
      const { data, error } = await supabase
        .from("memory")
        .select("id, content, deadline, priority")
        .eq("type", "goal")
        .order("priority", { ascending: false });

      if (error) throw error;

      return (data || []).map((goal) => ({
        id: goal.id,
        content: goal.content,
        deadline: goal.deadline,
        priority: goal.priority || 1,
      }));
    },
    [],
    "get_active_goals"
  );
}

// ============================================================
// TELEGRAM
// ============================================================

async function sendTelegram(message: string): Promise<boolean> {
  return sendTelegramWithRetry(BOT_TOKEN, CHAT_ID, message);
}

// ============================================================
// CLAUDE DECISION
// ============================================================

async function askClaudeToDecide(): Promise<{
  shouldCheckin: boolean;
  message: string;
  reason: string;
}> {
  const state = await loadState();
  const goals = await getActiveGoals();
  const now = new Date();

  // Get semantic context from conversational memory
  console.log("Fetching semantic context from conversational memory...");
  const relevantContext = await getRelevantContext(goals);
  console.log(`Semantic context: ${relevantContext ? "Found" : "Not found"}`);

  // Map goals to TaskInfo for checkin-rules
  const tasks = goalsToTaskInfo(goals);

  // Build check-in context
  const checkinContext: CheckinContext = {
    goals: tasks,
    relevantContext: relevantContext,
    lastMessageTime: new Date(state.lastMessageTime),
    lastCheckinTime: state.lastCheckinTime ? new Date(state.lastCheckinTime) : new Date(0),
    checkinsToday: state.checkinsToday,
    currentTime: now,
    userName: "Germán",
  };

  // Build enhanced prompt using checkin-rules
  const prompt = buildCheckinPrompt(checkinContext, DEFAULT_NOTIFICATION_RULES);

  try {
    const proc = spawn([CLAUDE_PATH, "-p", prompt, "--output-format", "text"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: "/Users/german/seconbrain",
      env: {
        ...process.env,
        CLAUDECODE: undefined, // Unset to allow nested sessions
      },
    });

    const output = await new Response(proc.stdout).text();

    // Parse Claude's response
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
    console.log(`Goals found: ${goals.length}`);
    console.log(`Semantic context: ${relevantContext ? "Yes" : "No"}`);
    console.log(`Check-ins today: ${state.checkinsToday}/${DEFAULT_NOTIFICATION_RULES.maxCheckinsPerDay}`);
    console.log(`============================\n`);

    return { shouldCheckin, message, reason };
  } catch (error) {
    console.error("Claude error:", error);
    return { shouldCheckin: false, message: "", reason: "Error contacting Claude" };
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("🤖 Smart Check-in running...");
  console.log(`Time: ${new Date().toLocaleString('es-ES')}\n`);

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_USER_ID");
    process.exit(1);
  }

  // Process any pending Telegram retries first
  const retryProcessed = await processPendingTelegramRetry(BOT_TOKEN, CHAT_ID);
  if (retryProcessed) {
    console.log("✅ Pending Telegram retry processed");
  }

  // Actualizar el tiempo del último mensaje (llamado por el bot cuando hay actividad)
  // Esto se puede invocar externamente: node -e "require('./examples/smart-checkin-personal.ts').updateLastMessageTime()"

  const { shouldCheckin, message } = await askClaudeToDecide();

  if (shouldCheckin && message && message !== "none") {
    console.log("✅ Sending check-in to Germán...");

    const success = await sendTelegram(message);

    if (success) {
      // Update state
      const state = await loadState();
      state.lastCheckinTime = new Date().toISOString();
      state.checkinsToday += 1;
      await saveState(state);

      console.log("✅ Check-in sent successfully!");
    } else {
      console.error("❌ Failed to send check-in (will retry in 5 minutes)");
      await logInfo(
        "checkin_deferred",
        "Check-in message deferred due to Telegram failure",
        { messageLength: message.length }
      );
    }
  } else {
    console.log("ℹ️  No check-in needed");
  }
}

// Exponer función para actualización externa del tiempo de último mensaje
export { updateLastMessageTime };

// Run if called directly
if (import.meta.main) {
  main();
}