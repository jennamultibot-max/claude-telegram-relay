/**
 * Morning Briefing Personalizado para Germán
 *
 * Envía un resumen diario vía Telegram a una hora programada.
 * Personalizado para incluir información de Supabase y contexto relevante.
 *
 * Schedule con launchd: ~/Library/LaunchAgents/com.claude.morning-briefing-personal.plist
 *
 * Run manual: bun run examples/morning-briefing-personal.ts
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// CONFIGURACIÓN
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_USER_ID || "";
const USER_NAME = process.env.USER_NAME || "Germán";
const USER_TIMEZONE = process.env.USER_TIMEZONE || "Europe/Madrid";

// Supabase integration
const supabase: SupabaseClient | null =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    : null;

// ============================================================
// TELEGRAM HELPER
// ============================================================

async function sendTelegram(message: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: "Markdown",
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error("Telegram error:", error);
    return false;
  }
}

// ============================================================
// DATA FETCHERS DESDE SUPABASE
// ============================================================

async function getActiveGoals(): Promise<string> {
  if (!supabase) return "No hay acceso a goals";

  try {
    const { data, error } = await supabase
      .from("memory")
      .select("content, deadline, priority")
      .eq("type", "goal")
      .order("priority", { ascending: false })
      .order("deadline", { ascending: true });

    if (error) {
      console.error("Error fetching goals:", error);
      return "Error cargando goals";
    }

    if (!data || data.length === 0) {
      return "📌 No hay goals activos";
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const goalsList = data.map(goal => {
      const deadline = goal.deadline ? new Date(goal.deadline) : null;

      if (deadline && deadline < now) {
        return `⚠️ ${goal.content} (VENCIDO)`;
      } else if (deadline && deadline <= tomorrow) {
        return `🔴 ${goal.content} (Hoy o mañana)`;
      } else if (deadline) {
        return `📅 ${goal.content} (${deadline.toLocaleDateString('es-ES')})`;
      } else {
        return `✅ ${goal.content}`;
      }
    });

    return goalsList.join("\n");
  } catch (error) {
    console.error("Error loading goals:", error);
    return "Error cargando goals";
  }
}

async function getFacts(): Promise<string> {
  if (!supabase) return "";

  try {
    const { data, error } = await supabase
      .from("memory")
      .select("content")
      .eq("type", "fact")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) return "";

    if (!data || data.length === 0) return "";

    return data.map(fact => `• ${fact.content}`).join("\n");
  } catch (error) {
    console.error("Error loading facts:", error);
    return "";
  }
}

async function getRecentConversations(): Promise<string> {
  if (!supabase) return "No hay acceso al historial";

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("content, role, created_at")
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      console.error("Error fetching conversations:", error);
      return "Error cargando conversaciones";
    }

    if (!data || data.length === 0) {
      return "No hay conversaciones recientes";
    }

    const now = new Date();
    const conversations = data.map(msg => {
      const timeAgo = getTimeAgo(new Date(msg.created_at));
      const roleEmoji = msg.role === "user" ? "👤" : "🤖";
      const preview = msg.content.substring(0, 50) + (msg.content.length > 50 ? "..." : "");
      return `${roleEmoji} ${preview} (${timeAgo})`;
    });

    return conversations.join("\n");
  } catch (error) {
    console.error("Error loading conversations:", error);
    return "Error cargando conversaciones";
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
  if (diffHours > 0) return `hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
  if (diffMins > 0) return `hace ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
  return "ahora mismo";
}

async function getYesterdaySummary(): Promise<string> {
  if (!supabase) return "";

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("messages")
      .select("content, role")
      .gte("created_at", yesterday.toISOString())
      .lt("created_at", today.toISOString());

    if (error) return "";

    if (!data || data.length === 0) return "Sin actividad ayer";

    const userMessages = data.filter(m => m.role === "user").length;
    const assistantMessages = data.filter(m => m.role === "assistant").length;

    return `${userMessages} mensajes tuyos, ${assistantMessages} respuestas del asistente`;
  } catch (error) {
    console.error("Error loading yesterday summary:", error);
    return "";
  }
}

// ============================================================
// BUILD BRIEFING
// ============================================================

async function buildBriefing(): Promise<string> {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-ES", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  const timeStr = now.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const sections: string[] = [];

  // Header
  sections.push(`🌅 **¡Buenos días, ${USER_NAME}!**`);
  sections.push(`📅 ${dateStr}`);
  sections.push(`🕐 ${timeStr}\n`);

  // Goals urgentes
  try {
    const goals = await getActiveGoals();
    sections.push(`🎯 **Goals Activos**`);
    sections.push(`${goals}\n`);
  } catch (e) {
    console.error("Goals fetch failed:", e);
  }

  // Hechos relevantes
  try {
    const facts = await getFacts();
    if (facts) {
      sections.push(`💡 **Cosas Importantes para Recordar**`);
      sections.push(`${facts}\n`);
    }
  } catch (e) {
    console.error("Facts fetch failed:", e);
  }

  // Resumen de ayer
  try {
    const summary = await getYesterdaySummary();
    if (summary) {
      sections.push(`📊 **Actividad de Ayer**`);
      sections.push(`${summary}\n`);
    }
  } catch (e) {
    console.error("Yesterday summary failed:", e);
  }

  // Conversaciones recientes
  try {
    const conversations = await getRecentConversations();
    if (conversations) {
      sections.push(`💬 **Últimas Conversaciones**`);
      sections.push(`${conversations}\n`);
    }
  } catch (e) {
    console.error("Conversations fetch failed:", e);
  }

  // Footer
  sections.push(`---`);
  sections.push(`💬 *Responde cuando quieras continuar cualquier conversación*`);
  sections.push(`🤖 *O di "resumen" si necesitas un resumen más detallado*`);

  return sections.join("\n");
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("📋 Building morning briefing...");

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_USER_ID");
    process.exit(1);
  }

  if (!supabase) {
    console.error("❌ Supabase not configured");
    process.exit(1);
  }

  try {
    const briefing = await buildBriefing();

    console.log("📤 Sending briefing...");
    const success = await sendTelegram(briefing);

    if (success) {
      console.log("✅ Briefing sent successfully!");
    } else {
      console.error("❌ Failed to send briefing");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error building or sending briefing:", error);
    process.exit(1);
  }
}

main();