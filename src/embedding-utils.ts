/**
 * Semantic Search Utilities for Smart Check-in
 *
 * Provides intelligent context retrieval from conversational memory
 * to inform proactive notification decisions.
 */

import { createClient } from "@supabase/supabase-js";

// Configuration constants
const DEFAULT_MATCH_COUNT = 5;
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

/**
 * Goal interface matching Supabase memory table structure
 * for rows where type = "goal"
 */
export interface Goal {
  id: string;
  content: string;
  deadline: string | null;
  priority: number;
}

/**
 * Memory match result from match_memory RPC
 */
interface MemoryMatch {
  content: string;
  type: string;
  similarity: number;
}

/**
 * Generates an embedding for the given text using the embed Edge Function.
 *
 * @param text - Text to generate embedding for
 * @returns Embedding vector as number array, or null on failure
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
    return null;
  }

  try {
    // Call the embed Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ content: text }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Embed Edge Function error:", error);
      return null;
    }

    // The embed function returns "ok" but we need to generate the embedding ourselves
    // since the Edge Function is designed for webhooks. Let's call Gemini directly.
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.error("GEMINI_API_KEY not configured");
      return null;
    }

    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: {
            parts: [{ text }],
          },
        }),
      }
    );

    if (!embeddingResponse.ok) {
      const error = await embeddingResponse.text();
      console.error("Gemini embedding error:", error);
      return null;
    }

    const result = await embeddingResponse.json();
    return result.embedding.values;
  } catch (error) {
    console.error("Error generating embedding:", error);
    return null;
  }
}

/**
 * Retrieves conversational context relevant to the provided tasks.
 *
 * This function enables smart check-ins to understand what has been
 * discussed previously about these tasks, helping Claude make more
 * informed decisions about when and how to proactively reach out.
 *
 * @param tasks - Array of Goal objects to find context for
 * @returns Formatted string with relevant conversational context, or empty string on failure
 *
 * Example usage:
 * ```typescript
 * const goals = await getActiveGoals(); // from Supabase
 * const context = await getRelevantContext(goals);
 * // context: "Task 1 content\nTask 2 content\nTask 3 content"
 * ```
 */
export async function getRelevantContext(tasks: Goal[]): Promise<string> {
  // Guard clause: no tasks to search for
  if (!tasks || tasks.length === 0) {
    console.log("No tasks provided, skipping semantic context search");
    return "";
  }

  // Create Supabase client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("Missing Supabase credentials, skipping semantic context search");
    return "";
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // Build search query from task content
    const queryText = tasks.map((task) => task.content).join(" ");

    // Generate embedding for the query
    const embedding = await generateEmbedding(queryText);

    if (!embedding) {
      console.log("Failed to generate embedding, skipping semantic context search");
      return "";
    }

    // Search conversational memory using embeddings via match_memory RPC
    const { data: relevantMemory, error } = await supabase.rpc("match_memory", {
      query_embedding: embedding,
      match_count: DEFAULT_MATCH_COUNT,
    });

    if (error) {
      console.error("match_memory RPC error:", error);
      return "";
    }

    if (!relevantMemory || relevantMemory.length === 0) {
      console.log("No relevant conversational context found for these tasks");
      return "";
    }

    console.log(`Found ${relevantMemory.length} relevant memory entries for context`);

    // Format results as a simple string of content
    return (
      relevantMemory
        .map((m: MemoryMatch) => m.content)
        .join("\n") || ""
    );
  } catch (error) {
    console.error("Unexpected error in getRelevantContext:", error);
    return "";
  }
}
