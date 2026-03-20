/**
 * Smart Check-in Rules Configuration
 *
 * Defines notification rules, priority thresholds, deadline rules,
 * rate limiting, and working hour considerations for proactive check-ins.
 *
 * This module provides:
 * - NotificationRule configuration object
 * - Enhanced prompt template function
 * - Easy customization for personal preferences
 */

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface TaskInfo {
  content: string;
  priority: number;
  deadline?: Date | null;
  lastActivity?: Date | null;
}

export interface CheckinContext {
  goals: TaskInfo[];
  relevantContext: string;
  lastMessageTime: Date;
  lastCheckinTime: Date;
  checkinsToday: number;
  currentTime: Date;
  userName: string;
}

export interface NotificationRules {
  // Priority thresholds
  highPriorityThreshold: number; // Notify even if 2+ days away
  urgentPriorityThreshold: number; // Immediate notification

  // Deadline rules (in hours)
  urgentDeadlineHours: number; // 24 hours = urgent
  reminderDeadlineDays: number; // 3 days = reminder

  // Rate limiting
  maxCheckinsPerDay: number; // Max 2-3 per day

  // Working hours (24h format)
  deepWorkStartMorning: number; // 9am
  deepWorkEndMorning: number; // 12pm
  deepWorkStartAfternoon: number; // 2pm
  deepWorkEndAfternoon: number; // 5pm

  // Inactivity rules (in days)
  inactivityReminderDays: number; // Notify if no activity for 3+ days

  // Notification types
  notificationTypes: {
    urgent: string; // 🚨
    reminder: string; // ⏰
    progress: string; // ✓
  };
}

export interface DecisionResult {
  decision: "YES" | "NO";
  message: string;
  reason: string;
}

// ============================================================
// DEFAULT CONFIGURATION
// ============================================================

export const DEFAULT_NOTIFICATION_RULES: NotificationRules = {
  // Priority thresholds (1-5 scale)
  highPriorityThreshold: 3, // Priority 3+ = notify even if 2+ days away
  urgentPriorityThreshold: 4, // Priority 4+ = immediate notification

  // Deadline rules
  urgentDeadlineHours: 24, // Deadline within 24h = urgent
  reminderDeadlineDays: 3, // Deadline within 3 days = reminder

  // Rate limiting
  maxCheckinsPerDay: 3, // Maximum 3 check-ins per day

  // Working hours (avoid deep work interruption)
  deepWorkStartMorning: 9, // 9:00 AM
  deepWorkEndMorning: 12, // 12:00 PM
  deepWorkStartAfternoon: 14, // 2:00 PM
  deepWorkEndAfternoon: 17, // 5:00 PM

  // Inactivity rules
  inactivityReminderDays: 3, // Notify if >3 days without activity

  // Notification type indicators
  notificationTypes: {
    urgent: "🚨",
    reminder: "⏰",
    progress: "✓",
  },
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Format a date for display in Spanish
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Format time for display
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Calculate time ago in Spanish
 */
export function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `hace ${diffDays} día${diffDays > 1 ? "s" : ""}`;
  if (diffHours > 0) return `hace ${diffHours} hora${diffHours > 1 ? "s" : ""}`;
  if (diffMins > 0) return `hace ${diffMins} minuto${diffMins > 1 ? "s" : ""}`;
  return "ahora mismo";
}

/**
 * Check if current time is during deep work hours
 */
export function isDeepWorkHours(currentTime: Date, rules: NotificationRules): boolean {
  const hour = currentTime.getHours();

  const morningBlock =
    hour >= rules.deepWorkStartMorning && hour < rules.deepWorkEndMorning;
  const afternoonBlock =
    hour >= rules.deepWorkStartAfternoon && hour < rules.deepWorkEndAfternoon;

  return morningBlock || afternoonBlock;
}

/**
 * Determine notification type based on task urgency
 */
export function getNotificationType(
  task: TaskInfo,
  rules: NotificationRules
): keyof NotificationRules["notificationTypes"] {
  const now = new Date();
  const hasDeadline = task.deadline !== null && task.deadline !== undefined;

  if (hasDeadline) {
    const hoursUntilDeadline =
      (task.deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDeadline <= rules.urgentDeadlineHours) {
      return "urgent";
    }
  }

  if (task.priority >= rules.urgentPriorityThreshold) {
    return "urgent";
  }

  if (hasDeadline) {
    const daysUntilDeadline =
      (task.deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntilDeadline <= rules.reminderDeadlineDays) {
      return "reminder";
    }
  }

  if (task.priority >= rules.highPriorityThreshold) {
    return "reminder";
  }

  return "progress";
}

/**
 * Format task for display in prompt
 */
export function formatTaskForPrompt(task: TaskInfo): string {
  const deadlineStr = task.deadline
    ? `deadline: ${formatDate(task.deadline)}`
    : "sin fecha";

  const icon = task.deadline && task.deadline < new Date() ? "⚠️" : "📅";

  return `${icon} ${task.content} (prioridad: ${task.priority}, ${deadlineStr})`;
}

// ============================================================
// PROMPT TEMPLATE FUNCTION
// ============================================================

/**
 * Build enhanced prompt for Claude's check-in decision
 *
 * @param context - Current check-in context
 * @param rules - Notification rules to apply
 * @returns Complete prompt string for Claude
 */
export function buildCheckinPrompt(
  context: CheckinContext,
  rules: NotificationRules = DEFAULT_NOTIFICATION_RULES
): string {
  const now = context.currentTime;
  const hour = now.getHours();
  const weekday = now.toLocaleDateString("es-ES", { weekday: "long" });
  const dateStr = now.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
  });
  const timeStr = formatTime(now);

  const timeOfDay =
    hour < 12 ? "mañana" : hour < 17 ? "tarde" : hour < 21 ? "noche" : "noche tarde";

  const hoursSinceLastMessage =
    (now.getTime() - context.lastMessageTime.getTime()) / (1000 * 60 * 60);
  const hoursSinceLastCheckin = context.lastCheckinTime
    ? (now.getTime() - context.lastCheckinTime.getTime()) / (1000 * 60 * 60)
    : 999;

  const isDeepWork = isDeepWorkHours(now, rules);

  const goalsList =
    context.goals.length > 0
      ? context.goals.map(formatTaskForPrompt).join("\n- ")
      : "Ninguno";

  const relevantContext = context.relevantContext || "Sin contexto adicional";

  return `Eres un asistente de IA proactivo para ${context.userName}. Decide si debes hacer un check-in.

CONTEXTO ACTUAL:
- Fecha y hora: ${weekday} ${dateStr}, ${timeStr} (${timeOfDay})
- Último mensaje: ${getTimeAgo(context.lastMessageTime)}
- Último check-in: ${context.lastCheckinTime ? getTimeAgo(context.lastCheckinTime) : "Nunca"}
- Check-ins hoy: ${context.checkinsToday}/${rules.maxCheckinsPerDay} (máximo ${rules.maxCheckinsPerDay} por día)
- Horas de trabajo profundo: ${isDeepWork ? "SÍ (evitar interrumpir)" : "No"}

TUS TAREAS PENDIENTES:
- ${goalsList}

CONTEXTO RELEVANTE DE CONVERSACIONES:
${relevantContext}

REGLAS DE AVISO:
1. Prioridad alta (${rules.highPriorityThreshold}+) = notificar incluso si faltan 2+ días
2. Deadline en las próximas ${rules.urgentDeadlineHours}h = notificar urgente ${rules.notificationTypes.urgent}
3. Tasks sin deadline pero importantes = notificar si hace >${rules.inactivityReminderDays} días sin actividad
4. Máximo ${rules.maxCheckinsPerDay} notificaciones por día para no ser molesto (actualmente: ${context.checkinsToday})
5. Considerar horario de trabajo: no interrumpir horas profundas (${rules.deepWorkStartMorning}:00-${rules.deepWorkEndMorning}:00h, ${rules.deepWorkStartAfternoon}:00-${rules.deepWorkEndAfternoon}:00h)
6. Adaptar mensaje según urgencia:
   - ${rules.notificationTypes.urgent} urgente (deadline < ${rules.urgentDeadlineHours}h o prioridad ${rules.urgentPriorityThreshold}+)
   - ${rules.notificationTypes.reminder} recordatorio (deadline < ${rules.reminderDeadlineDays} días o prioridad ${rules.highPriorityThreshold}+)
   - ${rules.notificationTypes.progress} progreso (actualización amigable)

PRIORIDAD MÁXIMA:
- Deadlines cercanos (< ${rules.urgentDeadlineHours} horas) = ${rules.notificationTypes.urgent} URGENTE
- Tasks vencidas = ${rules.notificationTypes.urgent} URGENTE
- Ha pasado más de 24h sin contacto = check-in amigable
- ${rules.inactivityReminderDays}+ días sin actividad en task importante = ${rules.notificationTypes.reminder} recordatorio

TONO DEL MENSAJE:
- Conversacional y amigable (como un buen amigo)
- Breve y directo, no intrusivo
- En español
- Sin emojis excesivos (máximo 2-3 por mensaje)
- Adaptado al tipo de notificación (${rules.notificationTypes.urgent}/${rules.notificationTypes.reminder}/${rules.notificationTypes.progress})

CUÁNDO NO CHECK-IN:
- Si ya enviaste ${rules.maxCheckinsPerDay} mensajes hoy
- Si es hora de trabajo profundo y no es urgente
- Si no hay nada importante que decir
- Si el último mensaje fue hace < 2 horas

RESPONDE EN ESTE FORMATO EXACTO:
DECISION: YES o NO
MESSAGE: [Tu mensaje proactivo si YES, o "none" si NO]
REASON: [Por qué decidiste esto]`;
}

// ============================================================
// EXPORT DEFAULT CONFIG
// ============================================================

export default {
  rules: DEFAULT_NOTIFICATION_RULES,
  buildPrompt: buildCheckinPrompt,
  isDeepWorkHours,
  getNotificationType,
  getTimeAgo,
  formatTaskForPrompt,
};
