/**
 * Auto-Embedding Edge Function
 *
 * Called via database webhook on INSERT to messages/memory tables.
 * Generates a Gemini embedding and stores it on the row.
 *
 * Secrets required:
 *   GEMINI_API_KEY — stored in Supabase Edge Function secrets
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { record, table } = await req.json();

    if (!record?.content || !record?.id) {
      return new Response("Missing record data", { status: 400 });
    }

    // Skip if embedding already exists
    if (record.embedding) {
      return new Response("Already embedded", { status: 200 });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("gemini_api_key");
    if (!geminiKey) {
      return new Response("GEMINI_API_KEY not configured", { status: 500 });
    }

    // Generate embedding via Gemini
    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: {
            parts: [{ text: record.content }]
          }
        }),
      }
    );

    if (!embeddingResponse.ok) {
      const err = await embeddingResponse.text();
      return new Response(`Gemini error: ${err}`, { status: 500 });
    }

    const result = await embeddingResponse.json();
    const embedding = result.embedding.values;

    // Update the row with the embedding
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase
      .from(table)
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", record.id);

    if (error) {
      return new Response(`Supabase update error: ${error.message}`, {
        status: 500,
      });
    }

    return new Response("ok");
  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
});
