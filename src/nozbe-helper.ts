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
