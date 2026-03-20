/**
 * Claude Code Telegram Relay
 *
 * Minimal relay that connects Telegram to Claude Code CLI.
 * Customize this for your own needs.
 *
 * Run: bun run src/relay.ts
 */

import { Bot, Context } from "grammy";
import { spawn } from "bun";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { transcribe } from "./transcribe.ts";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { GwsCommands } from "./gws-helper.ts";

// Load environment variables from .env file
import { config } from "dotenv";
config();
import {
  processMemoryIntents,
  getMemoryContext,
  getRecentMessages,
  getRelevantContext,
} from "./memory.ts";
import { searchWeb, formatSearchResults, shouldSearch } from "./websearch.ts";
import {
  startTerminalStatus,
  trackTerminalTokens,
  trackTerminalRequest,
  printTerminalStatus,
  getTerminalStatusBar,
} from "./status-terminal.ts";
import { getStatusBar } from "./status-bar.ts";
import { executeGws, GwsCommands, listInboxWithContent } from "./gws-helper.ts";
import { NozbeCommands, getTasks } from "./nozbe-helper.ts";

const PROJECT_ROOT = dirname(dirname(import.meta.path));

// ============================================================
// CONFIGURATION
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ALLOWED_USER_ID = process.env.TELEGRAM_USER_ID || "";
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";
const PROJECT_DIR = process.env.PROJECT_DIR || "";
const RELAY_DIR = process.env.RELAY_DIR || join(process.env.HOME || "~", ".claude-relay");

// Directories
const TEMP_DIR = join(RELAY_DIR, "temp");
const UPLOADS_DIR = PROJECT_DIR ? join(PROJECT_DIR, "uploads") : join(RELAY_DIR, "uploads");

// Session tracking for conversation continuity
const SESSION_FILE = join(RELAY_DIR, "session.json");

interface SessionState {
  sessionId: string | null;
  lastActivity: string;
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

async function loadSession(): Promise<SessionState> {
  try {
    const content = await readFile(SESSION_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { sessionId: null, lastActivity: new Date().toISOString() };
  }
}

async function saveSession(state: SessionState): Promise<void> {
  await writeFile(SESSION_FILE, JSON.stringify(state, null, 2));
}

let session = await loadSession();

// ============================================================
// LOCK FILE (prevent multiple instances)
// ============================================================

const LOCK_FILE = join(RELAY_DIR, "bot.lock");

async function acquireLock(): Promise<boolean> {
  try {
    const existingLock = await readFile(LOCK_FILE, "utf-8").catch(() => null);

    if (existingLock) {
      const pid = parseInt(existingLock);
      try {
        process.kill(pid, 0); // Check if process exists
        console.log(`Another instance running (PID: ${pid})`);
        return false;
      } catch {
        console.log("Stale lock found, taking over...");
      }
    }

    await writeFile(LOCK_FILE, process.pid.toString());
    return true;
  } catch (error) {
    console.error("Lock error:", error);
    return false;
  }
}

async function releaseLock(): Promise<void> {
  await unlink(LOCK_FILE).catch(() => {});
}

// Cleanup on exit
process.on("exit", () => {
  try {
    require("fs").unlinkSync(LOCK_FILE);
  } catch {}
});
process.on("SIGINT", async () => {
  await releaseLock();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await releaseLock();
  process.exit(0);
});

// ============================================================
// SETUP
// ============================================================

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set!");
  console.log("\nTo set up:");
  console.log("1. Message @BotFather on Telegram");
  console.log("2. Create a new bot with /newbot");
  console.log("3. Copy the token to .env");
  process.exit(1);
}

// Create directories
await mkdir(TEMP_DIR, { recursive: true });
await mkdir(UPLOADS_DIR, { recursive: true });

// ============================================================
// SUPABASE (optional — only if configured)
// ============================================================

const supabase: SupabaseClient | null =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    : null;

async function saveMessage(
  role: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("messages").insert({
      role,
      content,
      channel: "telegram",
      metadata: metadata || {},
    });
  } catch (error) {
    console.error("Supabase save error:", error);
  }
}

// Acquire lock
if (!(await acquireLock())) {
  console.error("Could not acquire lock. Another instance may be running.");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// ============================================================
// SECURITY: Only respond to authorized user
// ============================================================

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id.toString();

  // If ALLOWED_USER_ID is set, enforce it
  if (ALLOWED_USER_ID && userId !== ALLOWED_USER_ID) {
    console.log(`Unauthorized: ${userId}`);
    await ctx.reply("This bot is private.");
    return;
  }

  // Log all incoming messages for debugging
  if (ctx.message) {
    console.log(`Message received from ${userId}:`, Object.keys(ctx.message));
  }

  await next();
});

// ============================================================
// GWS PRE-FETCHING FOR NATURAL LANGUAGE QUERIES
// ============================================================

/**
 * Detect if user is asking about Gmail/emails and fetch data directly
 * This prevents Claude from trying to execute gws commands that need approval
 */
async function fetchGwsIfNeeded(query: string): Promise<string | undefined> {
  const lowerQuery = query.toLowerCase();

  // Keywords that indicate email/Gmail interest
  const emailKeywords = [
    'email', 'e-mail', 'correo', 'correos', 'gmail', 'mail',
    'bandeja', 'entrada', 'inbox', 'mensajes pendientes',
    'emails', 'mails'
  ];

  const hasEmailKeyword = emailKeywords.some(keyword => lowerQuery.includes(keyword));

  if (!hasEmailKeyword) {
    return undefined;
  }

  console.log("Email-related query detected, fetching Gmail data with full content...");

  try {
    // Use listInboxWithContent to get full email details (subject, from, date, body preview)
    const result = await listInboxWithContent(10);

    if (result.success) {
      console.log("Gmail data with content fetched successfully");
      return `\n\n**GMAIL DATA (pre-fetched with full content):**\n${result.output}\n\nUse this data to answer the user's question about emails. Each email includes: subject, from, date, and body preview. Do NOT try to execute gws commands - the data is already provided above.`;
    } else {
      console.log("Gmail fetch failed:", result.error);
      return undefined;
    }
  } catch (error) {
    console.error("Error fetching Gmail data:", error);
    return undefined;
  }
}

// ============================================================
// CORE: Call Claude CLI
// ============================================================

async function callClaude(
  prompt: string,
  options?: { resume?: boolean; imagePath?: string }
): Promise<string> {
  const args = [CLAUDE_PATH, "-p", prompt];

  // Resume previous session if available and requested
  if (options?.resume && session.sessionId) {
    args.push("--resume", session.sessionId);
  }

  args.push("--output-format", "text");

  console.log(`Calling Claude: ${prompt.substring(0, 50)}...`);

  try {
    const proc = spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: PROJECT_DIR || undefined,
      env: {
        ...process.env,
        CLAUDECODE: undefined, // Unset to allow nested sessions
        // Pass through any env vars Claude might need
      },
    });

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.error("Claude error:", stderr);
      return `Error: ${stderr || "Claude exited with code " + exitCode}`;
    }

    // Extract session ID from output if present (for --resume)
    const sessionMatch = output.match(/Session ID: ([a-f0-9-]+)/i);
    if (sessionMatch) {
      session.sessionId = sessionMatch[1];
      session.lastActivity = new Date().toISOString();
      await saveSession(session);
    }

    // Track tokens for status bar
    const inputTokenMatch = stderr.match(/Input tokens: (\d+)/i) || output.match(/Input tokens: (\d+)/i);
    const outputTokenMatch = stderr.match(/Output tokens: (\d+)/i) || output.match(/Output tokens: (\d+)/i);

    if (inputTokenMatch && outputTokenMatch) {
      const inputTokens = parseInt(inputTokenMatch[1]);
      const outputTokens = parseInt(outputTokenMatch[1]);
      trackTerminalTokens(inputTokens, outputTokens);
      trackTerminalRequest();
    }

    return output.trim();
  } catch (error) {
    console.error("Spawn error:", error);
    return `Error: Could not run Claude CLI`;
  }
}

// ============================================================
// MESSAGE HANDLERS
// ============================================================

// Status command
bot.command("status", async (ctx) => {
  const metrics = getStatusBar().getMetrics();
  const limits = getStatusBar().getModelLimits();
  const contextUsage = getStatusBar().getContextUsage();
  const duration = getStatusBar().getSessionDuration();
  const cost = getStatusBar().getEstimatedCost();
  const costFormatted = cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`;

  const modelName = limits?.name || metrics.model;

  const statusMessage = `
📊 **CLOUD COACH STATUS**
━━━━━━━━━━━━━━━━━━━━━
🤖 Modelo: ${modelName}
📊 Tokens: ${metrics.inputTokens.toLocaleString()} input + ${metrics.outputTokens.toLocaleString()} output = ${metrics.totalTokens.toLocaleString()} total
📏 Contexto: ${contextUsage.toFixed(1)}% / 100%
⏱️ Sesión: ${duration} (${metrics.requests} requests)
💰 Costo est.: ${costFormatted}
━━━━━━━━━━━━━━━━━━━━━
`.trim();

  await ctx.reply(statusMessage, { parse_mode: "Markdown" });
});

// Reset status command
bot.command("reset", async (ctx) => {
  getStatusBar().reset();
  await ctx.reply("✅ Sesión reiniciada. Tokens y métricas han sido puestos a cero.");
});

// Gmail commands
bot.command("gmail", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  console.log(`Gmail command: ${args}`);

  await ctx.replyWithChatAction("typing");

  // Parse optional count
  const parts = args.trim().split(/\s+/);
  const count = parts.length > 0 ? parseInt(parts[0]) || 5 : 5;

  try {
    const result = await GwsCommands.listInbox(`{"userId": "me", "maxResults": ${count}}`);
    if (!result.success) {
      await ctx.reply(`❌ Error: ${result.error}`);
      return;
    }

    await ctx.reply(result.output, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

bot.command("email", async (ctx) => {
  await ctx.replyWithChatAction("typing");

  try {
    const result = await GwsCommands.listInbox('{"userId": "me", "maxResults": 1}');
    if (!result.success) {
      await ctx.reply(`❌ Error: ${result.error}`);
      return;
    }

    await ctx.reply(result.output, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

// New command: Full email content with details
bot.command("emails_full", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  console.log(`Emails full command: ${args}`);

  await ctx.replyWithChatAction("typing");

  // Parse optional count
  const parts = args.trim().split(/\s+/);
  const count = parts.length > 0 ? parseInt(parts[0]) || 5 : 5;

  try {
    const result = await listInboxWithContent(count);
    if (!result.success) {
      await ctx.reply(`❌ Error: ${result.error}`);
      return;
    }

    await ctx.reply(result.output, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

// New command: Summary of important emails
bot.command("resumen_emails", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  console.log(`Resumen emails command: ${args}`);

  await ctx.replyWithChatAction("typing");

  // Parse optional count
  const parts = args.trim().split(/\s+/);
  const count = parts.length > 0 ? parseInt(parts[0]) || 10 : 10;

  try {
    // Get emails with full content
    const result = await listInboxWithContent(count);
    if (!result.success) {
      await ctx.reply(`❌ Error: ${result.error}`);
      return;
    }

    // Add a header for the summary
    const summary = `📊 **Resumen de emails importantes:**\n\n${result.output}`;
    await ctx.reply(summary, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

// Calendar commands
bot.command("calendar", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  console.log(`Calendar command: ${args}`);

  await ctx.replyWithChatAction("typing");

  const command: any = {
    service: "calendar",
    resource: "events",
    method: "list",
    format: "json",
  };

  // Parse optional count
  const parts = args.trim().split(/\s+/);
  const count = parseInt(parts[0]) || 10;

  command.params = `{"maxResults": ${count}, "timeMin": "${new Date().toISOString()}"}`;

  try {
    const result = await executeGws(command);
    if (!result.success) {
      await ctx.reply(`❌ Error: ${result.error}`);
      return;
    }

    const data = JSON.parse(result.output);
    if (data.items && data.items.length > 0) {
      let response = `📅 **Próximos eventos (${data.items.length}):**\n\n`;
      for (const event of data.items) {
        const summary = (event.summary as string) || "(sin título)";
        const start = event.start as { dateTime?: string; date?: string };
        const time = start.dateTime || start.date || "Sin hora";
        response += `📌 ${summary}\n   🕐 ${time}\n\n`;
      }
      await ctx.reply(response, { parse_mode: "Markdown" });
    } else {
      await ctx.reply("📅 No hay eventos próximos en el calendario.");
    }
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

bot.command("drive", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  console.log(`Drive command: ${args}`);

  await ctx.replyWithChatAction("typing");

  const command: any = {
    service: "drive",
    resource: "files",
    method: "list",
    format: "json",
  };

  // Parse optional count
  const parts = args.trim().split(/\s+/);
  const count = parseInt(parts[0]) || 20;

  command.params = `{"pageSize": ${count}}`;

  try {
    const result = await executeGws(command);
    if (!result.success) {
      await ctx.reply(`❌ Error: ${result.error}`);
      return;
    }

    const data = JSON.parse(result.output);
    if (data.files && data.files.length > 0) {
      let response = `📁 **Archivos (${data.files.length}):**\n\n`;
      for (const file of data.files.slice(0, 10)) {
        const name = (file.name as string) || "(sin nombre)";
        response += `📄 ${name}\n`;
      }
      if (data.files.length > 10) {
        response += `\n... y ${data.files.length - 10} más`;
      }
      await ctx.reply(response, { parse_mode: "Markdown" });
    } else {
      await ctx.reply("📁 No hay archivos en Drive.");
    }
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

// GWS command - execute Google Workspace CLI commands
bot.command("gws", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  console.log(`GWS command: ${args}`);

  await ctx.replyWithChatAction("typing");

  // Parse gws command
  // Format: /gws <service> <resource> [sub-resource] <method> [flags]
  // Example: /gws gmail users messages list --params '{"pageSize": 10}'
  const parts = args.trim().split(/\s+/);
  if (parts.length < 3) {
    await ctx.reply(
      "❌ Invalid format. Usage:\n" +
        "/gws <service> <resource> <method> [flags]\n\n" +
        "Examples:\n" +
        "/gws gmail users messages list --params '{\"pageSize\": 10}'\n" +
        "/gws drive files list --params '{\"pageSize\": 20}'\n" +
        "/gws calendar events list --params '{\"maxResults\": 10}'\n" +
        "/gws sheets spreadsheets get --params '{\"spreadsheetId\": \"...\"}'"
    );
    return;
  }

  const [service, resource, ...rest] = parts;
  const method = rest[0] || "list";

  // Build command object
  const command: any = {
    service,
    resource,
    method,
    format: "json",
  };

  // Parse flags
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--params" && rest[i + 1]) {
      command.params = rest[i + 1];
      i++;
    } else if (rest[i] === "--json" && rest[i + 1]) {
      command.json = rest[i + 1];
      i++;
    }
  }

  try {
    const result = await executeGws(command);

    if (!result.success) {
      await ctx.reply(`❌ Error: ${result.error}`);
      return;
    }

    // Send response (split if too long)
    const output = result.output;
    if (output.length > 4000) {
      await ctx.reply("📄 Output too long, sending first part:");
      await ctx.reply(output.substring(0, 4000));
      await ctx.reply("... (truncated)");
    } else {
      await ctx.reply(output);
    }
  } catch (error) {
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

// Text messages
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  console.log(`Message: ${text.substring(0, 50)}...`);

  await ctx.replyWithChatAction("typing");

  await saveMessage("user", text);

  // Perform web search if query seems to need current information
  let webSearchResults: string | undefined;
  if (shouldSearch(text)) {
    console.log("Performing web search...");
    await ctx.replyWithChatAction("typing");
    const searchResponse = await searchWeb(text, 5);
    if (searchResponse.success && searchResponse.results.length > 0) {
      webSearchResults = formatSearchResults(searchResponse.results);
      console.log(`Found ${searchResponse.results.length} search results`);
    } else if (searchResponse.error) {
      console.log("Web search failed:", searchResponse.error);
    }
  }

  // Pre-fetch GWS data if user is asking about emails (prevents approval prompts)
  const gwsData = await fetchGwsIfNeeded(text);
  if (gwsData) {
    await ctx.replyWithChatAction("typing");
  }

  // Gather context: recent conversation + semantic search + facts/goals
  const [recentMessages, relevantContext, memoryContext] = await Promise.all([
    getRecentMessages(supabase, 10),
    getRelevantContext(supabase, text),
    getMemoryContext(supabase),
  ]);

  const enrichedPrompt = buildPrompt(text, recentMessages, relevantContext, memoryContext, webSearchResults, gwsData);
  const rawResponse = await callClaude(enrichedPrompt, { resume: true });

  // Parse and save any memory intents, strip tags from response
  const response = await processMemoryIntents(supabase, rawResponse);

  await saveMessage("assistant", response);
  await sendResponse(ctx, response);
});

// Voice messages
bot.on("message:voice", async (ctx) => {
  const voice = ctx.message.voice;
  console.log(`Voice message: ${voice.duration}s`);
  await ctx.replyWithChatAction("typing");

  if (!process.env.VOICE_PROVIDER) {
    await ctx.reply(
      "Voice transcription is not set up yet. " +
        "Run the setup again and choose a voice provider (Groq or local Whisper)."
    );
    return;
  }

  try {
    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());

    const transcription = await transcribe(buffer);
    if (!transcription) {
      await ctx.reply("Could not transcribe voice message.");
      return;
    }

    await saveMessage("user", `[Voice ${voice.duration}s]: ${transcription}`);

    // Perform web search if transcribed text seems to need current information
    let webSearchResults: string | undefined;
    if (shouldSearch(transcription)) {
      console.log("Performing web search for voice message...");
      await ctx.replyWithChatAction("typing");
      const searchResponse = await searchWeb(transcription, 5);
      if (searchResponse.success && searchResponse.results.length > 0) {
        webSearchResults = formatSearchResults(searchResponse.results);
        console.log(`Found ${searchResponse.results.length} search results`);
      } else if (searchResponse.error) {
        console.log("Web search failed:", searchResponse.error);
      }
    }

    // Pre-fetch GWS data if voice message is about emails
    const gwsData = await fetchGwsIfNeeded(transcription);
    if (gwsData) {
      await ctx.replyWithChatAction("typing");
    }

    const [recentMessages, relevantContext, memoryContext] = await Promise.all([
      getRecentMessages(supabase, 10),
      getRelevantContext(supabase, transcription),
      getMemoryContext(supabase),
    ]);

    const enrichedPrompt = buildPrompt(
      `[Voice message transcribed]: ${transcription}`,
      recentMessages,
      relevantContext,
      memoryContext,
      webSearchResults,
      gwsData
    );
    const rawResponse = await callClaude(enrichedPrompt, { resume: true });
    const claudeResponse = await processMemoryIntents(supabase, rawResponse);

    await saveMessage("assistant", claudeResponse);
    await sendResponse(ctx, claudeResponse);
  } catch (error) {
    console.error("Voice error:", error);
    await ctx.reply("Could not process voice message. Check logs for details.");
  }
});

// Photos/Images
bot.on("message:photo", async (ctx) => {
  console.log("Image received - processing...");
  await ctx.replyWithChatAction("typing");

  try {
    // Get highest resolution photo
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];
    console.log(`Photo file_id: ${photo.file_id}`);
    const file = await ctx.api.getFile(photo.file_id);
    console.log(`File path: ${file.file_path}`);

    // Download the image
    const timestamp = Date.now();
    const fileName = `image_${timestamp}.jpg`;
    const filePath = join(UPLOADS_DIR, fileName);
    console.log(`Downloading to: ${filePath}`);

    const response = await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
    );
    console.log(`Response status: ${response.status}`);
    const buffer = await response.arrayBuffer();
    await writeFile(filePath, Buffer.from(buffer));
    console.log(`Image saved successfully (${buffer.byteLength} bytes)`);

    // Use absolute path for Claude to access the image
    const imagePathForClaude = filePath;

    // Claude Code can see images via file path
    const caption = ctx.message.caption || "Analyze this image.";
    const prompt = `[Image: ${imagePathForClaude}]\n\n${caption}`;

    await saveMessage("user", `[Image]: ${caption}`);

    const claudeResponse = await callClaude(prompt, { resume: true });

    // Cleanup after processing
    await unlink(filePath).catch(() => {});

    const cleanResponse = await processMemoryIntents(supabase, claudeResponse);
    await saveMessage("assistant", cleanResponse);
    await sendResponse(ctx, cleanResponse);
  } catch (error) {
    console.error("Image error:", error);
    await ctx.reply("Could not process image.");
  }
});

// Documents
bot.on("message:document", async (ctx) => {
  const doc = ctx.message.document;
  console.log(`Document received: ${doc.file_name}`);
  await ctx.replyWithChatAction("typing");

  try {
    const file = await ctx.getFile();
    console.log(`Document file_id: ${file.file_id}, path: ${file.file_path}`);
    const timestamp = Date.now();
    const fileName = doc.file_name || `file_${timestamp}`;
    const filePath = join(UPLOADS_DIR, `${timestamp}_${fileName}`);

    const response = await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
    );
    const buffer = await response.arrayBuffer();
    await writeFile(filePath, Buffer.from(buffer));
    console.log(`Document saved: ${filePath} (${buffer.byteLength} bytes)`);

    // Verify file exists
    try {
      const { stat } = await import("fs/promises");
      await stat(filePath);
      console.log("File verified - exists and is accessible");
    } catch (statError) {
      console.error("File verification failed:", statError);
      throw new Error("File could not be saved or accessed");
    }

    // Extract content based on file type
    let documentContent = "";
    if (doc.mime_type?.includes("pdf")) {
      console.log("Attempting to extract text from PDF...");

      // Use pdfjs-dist library for text extraction
      try {
        const pdfBuffer = await readFile(filePath);
        console.log("PDF file read successfully, extracting text...");

        const pdfData = await pdfjsLib.getDocument({
          data: pdfBuffer,
        useWorkerFetch: false,
        disableFontFace: false,
        fontExtraProperties: null
        }).promise;

        let fullText = "";
        const numPages = pdfData.numPages;

        for (let i = 1; i <= numPages; i++) {
          const page = await pdfData.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          fullText += pageText + '\n';
        }

        documentContent = fullText.trim();

        if (documentContent.length === 0) {
          console.log("PDF extraction returned empty text");
          await ctx.reply("The PDF appears to contain only images or the text could not be extracted. The PDF might be scanned or use a special encoding.");
          throw new Error("PDF extraction returned empty text");
        }

        console.log(`PDF text extracted: ${documentContent.length} characters from ${numPages} pages`);
      } catch (pdfError) {
        console.error("PDF parsing error:", pdfError);
        console.error("Error details:", pdfError instanceof Error ? pdfError.stack : String(pdfError));

        // Provide more specific error messages
        const errorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError);

        if (errorMsg.includes("password") || errorMsg.includes("encrypted")) {
          await ctx.reply("This PDF is password-protected. Please remove the password protection and try again.");
        } else if (errorMsg.includes("corrupt") || errorMsg.includes("damaged")) {
          await ctx.reply("The PDF file appears to be corrupted or damaged. Please try with a different file.");
        } else if (errorMsg.includes("image") || errorMsg.includes("scanned")) {
          await ctx.reply("This PDF appears to contain only images (scanned document). Text extraction is not possible for this type of PDF.");
        } else {
          await ctx.reply(`Could not extract text from PDF. Error: ${errorMsg.substring(0, 100)}...`);
        }
        throw new Error("PDF extraction failed");
      }
    } else {
      // For other file types, try to read as text
      try {
        documentContent = await readFile(filePath, "utf-8");
        console.log(`Text file read: ${documentContent.length} characters`);
      } catch (textError) {
        console.error("Text file read error:", textError);
        documentContent = "[Could not extract content from this file type]";
      }
    }

    const caption = ctx.message.caption || `Analyze: ${doc.file_name}`;

    // Build prompt with actual document content
    const prompt = `Document Analysis Request

File Information:
- Filename: ${doc.file_name}
- Type: ${doc.mime_type}
- Size: ${doc.file_size} bytes

Task: ${caption}

--- ACTUAL DOCUMENT CONTENT BELOW ---
${documentContent}
--- END OF DOCUMENT CONTENT ---

Please analyze the content above. Only use the information that is actually present in the document.`;

    await saveMessage("user", `[Document: ${doc.file_name}]: ${caption}`);

    const claudeResponse = await callClaude(prompt, { resume: true });

    await unlink(filePath).catch(() => {});

    const cleanResponse = await processMemoryIntents(supabase, claudeResponse);
    await saveMessage("assistant", cleanResponse);
    await sendResponse(ctx, cleanResponse);
  } catch (error) {
    console.error("Document error:", error);
    await ctx.reply("Could not process document.");
  }
});

// ============================================================
// HELPERS
// ============================================================

// Load profile once at startup
let profileContext = "";
try {
  profileContext = await readFile(join(PROJECT_ROOT, "config", "profile.md"), "utf-8");
} catch {
  // No profile yet — that's fine
}

const USER_NAME = process.env.USER_NAME || "";
const USER_TIMEZONE = process.env.USER_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;

function buildPrompt(
  userMessage: string,
  recentMessages?: string,
  relevantContext?: string,
  memoryContext?: string,
  webSearchResults?: string,
  gwsData?: string
): string {
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", {
    timeZone: USER_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = [
    "You are a personal AI assistant responding via Telegram. Keep responses concise and conversational.",
  ];

  if (USER_NAME) parts.push(`You are speaking with ${USER_NAME}.`);
  parts.push(`Current time: ${timeStr}`);
  if (profileContext) parts.push(`\nProfile:\n${profileContext}`);

  // Add recent conversation history FIRST (most important for context)
  if (recentMessages) {
    parts.push(`\n${recentMessages}`);
    parts.push("\nThis is the recent conversation history. Use this to understand what we were discussing.");
  }

  if (webSearchResults) {
    parts.push(`\n${webSearchResults}`);
    parts.push("\nIMPORTANT: Use the web search results above to answer the user's question. The results provide current information that may be more relevant than your training data.");
  }
  if (gwsData) {
    parts.push(`\n${gwsData}`);
  }
  if (memoryContext) parts.push(`\n${memoryContext}`);
  if (relevantContext) parts.push(`\n${relevantContext}`);

  parts.push(
    "\nMEMORY MANAGEMENT:" +
      "\nWhen the user shares something worth remembering, sets goals, or completes goals, " +
      "include these tags in your response (they are processed automatically and hidden from the user):" +
      "\n[REMEMBER: fact to store]" +
      "\n[GOAL: goal text | DEADLINE: optional date]" +
      "\n[DONE: search text for completed goal]"
  );

  parts.push(
    "\n\nGOOGLE WORKSPACE INTEGRATION:" +
      "\nWhen the user asks about Gmail, Calendar, Drive, or other Google services, the relevant data will be provided above (prefetched)." +
      "\nUse the provided data to answer the user's question." +
      "\nDO NOT try to execute gws commands yourself - the data is already included in the prompt if relevant." +
      "\nPresent Google Workspace data in a user-friendly way." +
      "\n\nThe user can also use the /gws command directly for specific operations."
  );

  parts.push(`\nUser: ${userMessage}`);

  return parts.join("\n");
}

async function sendResponse(ctx: Context, response: string): Promise<void> {
  // Telegram has a 4096 character limit
  const MAX_LENGTH = 4000;

  if (response.length <= MAX_LENGTH) {
    await ctx.reply(response);
    return;
  }

  // Split long responses
  const chunks = [];
  let remaining = response;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a natural boundary
    let splitIndex = remaining.lastIndexOf("\n\n", MAX_LENGTH);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf("\n", MAX_LENGTH);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf(" ", MAX_LENGTH);
    if (splitIndex === -1) splitIndex = MAX_LENGTH;

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

// ============================================================
// START
// ============================================================

console.log("Starting Claude Telegram Relay...");
console.log(`Authorized user: ${ALLOWED_USER_ID || "ANY (not recommended)"}`);
console.log(`Project directory: ${PROJECT_DIR || "(relay working directory)"}`);

// Start status bar
startTerminalStatus("claude-sonnet-4-6");
console.log("📊 Status bar activated - tokens will be tracked");

bot.start({
  onStart: () => {
    console.log("Bot is running!");
  },
});
