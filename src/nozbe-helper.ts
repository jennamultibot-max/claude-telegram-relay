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
