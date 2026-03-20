/**
 * Google Workspace CLI Helper
 *
 * Executes gws commands and returns structured results.
 */

import { spawn } from "bun";

interface GwsCommand {
  service: string;
  resource: string;
  method: string;
  submethod?: string; // For nested commands like "messages list"
  params?: string;
  json?: string;
  upload?: string;
  output?: string;
  format?: "json" | "table" | "yaml" | "csv";
  apiVersion?: string;
  pageAll?: boolean;
  pageLimit?: number;
  pageDelay?: number;
}

/**
 * Execute a gws command and return the output
 */
export async function executeGws(command: GwsCommand): Promise<{
  success: boolean;
  output: string;
  error?: string;
}> {
  const args: string[] = [];

  console.log(`DEBUG GWS INPUT:`, {
    service: command.service,
    resource: command.resource,
    method: command.method,
    submethod: command.submethod,
  });

  // Build command arguments
  if (command.service) args.push(command.service);
  if (command.resource) args.push(command.resource);
  if (command.method) args.push(command.method);
  if (command.submethod) {
    console.log(`DEBUG: Adding submethod "${command.submethod}" as separate arg`);
    args.push(command.submethod);
  }

  console.log(`DEBUG ARGS ARRAY:`, args);

  // Add optional flags
  if (command.params) args.push("--params", command.params);
  if (command.json) args.push("--json", command.json);
  if (command.upload) args.push("--upload", command.upload);
  if (command.output) args.push("--output", command.output);
  if (command.format) args.push("--format", command.format);
  if (command.apiVersion) args.push("--api-version", command.apiVersion);
  if (command.pageAll) args.push("--page-all");
  if (command.pageLimit) args.push("--page-limit", command.pageLimit.toString());
  if (command.pageDelay) args.push("--page-delay", command.pageDelay.toString());

  console.log(`Executing gws: ${args.join(" ")}`);

  try {
    const proc = spawn(["gws", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        // Pass through gws environment variables
        GOOGLE_WORKSPACE_CLI_TOKEN: process.env.GOOGLE_WORKSPACE_CLI_TOKEN,
        GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE,
        GOOGLE_WORKSPACE_CLI_CLIENT_ID: process.env.GOOGLE_WORKSPACE_CLI_CLIENT_ID,
        GOOGLE_WORKSPACE_CLI_CLIENT_SECRET: process.env.GOOGLE_WORKSPACE_CLI_CLIENT_SECRET,
      },
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        output: "",
        error: stderr || `gws exited with code ${exitCode}`,
      };
    }

    // Try to parse JSON output for formatting
    if (command.format === "json" || (!command.format && args.length > 3)) {
      try {
        const parsed = JSON.parse(stdout);
        return {
          success: true,
          output: formatJsonOutput(parsed, command.service),
        };
      } catch {
        // Not valid JSON, return as is
      }
    }

    return {
      success: true,
      output: stdout,
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Format JSON output for better readability
 */
function formatJsonOutput(data: unknown, service: string): string {
  if (typeof data !== "object" || data === null) {
    return JSON.stringify(data, null, 2);
  }

  // Handle different response structures
  if (service === "gmail") {
    return formatGmailOutput(data);
  } else if (service === "drive") {
    return formatDriveOutput(data);
  } else if (service === "calendar") {
    return formatCalendarOutput(data);
  } else if (service === "sheets") {
    return formatSheetsOutput(data);
  }

  // Default formatting
  return JSON.stringify(data, null, 2);
}

function formatGmailOutput(data: unknown): string {
  const obj = data as Record<string, unknown>;

  // List of messages
  if (obj.messages && Array.isArray(obj.messages)) {
    const messages = obj.messages;
    if (messages.length === 0) {
      return "📭 No se encontraron mensajes.";
    }
    return `📧 **${messages.length} mensajes encontrados**\n\n${JSON.stringify(data, null, 2)}`;
  }

  // Single message with payload
  if (obj.payload && typeof obj.payload === "object") {
    const payload = obj.payload as Record<string, unknown>;
    const headers = payload.headers as Array<Record<string, unknown>> || [];

    const extractHeader = (name: string): string => {
      const header = headers.find((h) => h.name === name);
      return header ? String(header.value) : "(no encontrado)";
    };

    const from = extractHeader("From");
    const subject = extractHeader("Subject");
    const date = extractHeader("Date");
    const snippet = obj.snippet as string || "";

    let output = `📧 **${subject}**\n\n`;
    output += `📤 De: ${from}\n`;
    output += `📅 Fecha: ${date}\n`;
    if (snippet) {
      output += `\n📝 Preview: ${snippet.substring(0, 200)}${snippet.length > 200 ? "..." : ""}\n`;
    }

    return output;
  }

  return JSON.stringify(data, null, 2);
}

function formatDriveOutput(data: unknown): string {
  const obj = data as Record<string, unknown>;
  if (obj.files && Array.isArray(obj.files)) {
    const files = obj.files as Array<Record<string, unknown>>;
    if (files.length === 0) {
      return "📁 No se encontraron archivos.";
    }

    let output = `📁 **${files.length} archivos:**\n\n`;

    files.forEach((file, i) => {
      const name = file.name as string;
      const mimeType = file.mimeType as string || "desconocido";

      // Icon based on type
      let icon = "📄";
      if (mimeType.includes("folder")) icon = "📁";
      else if (mimeType.includes("pdf")) icon = "📕";
      else if (mimeType.includes("image")) icon = "🖼️";
      else if (mimeType.includes("video")) icon = "🎬";
      else if (mimeType.includes("spreadsheet")) icon = "📊";
      else if (mimeType.includes("document")) icon = "📝";
      else if (mimeType.includes("presentation")) icon = "📽️";

      output += `${i + 1}. ${icon} **${name}**\n`;

      if (file.modifiedTime) {
        const modDate = new Date(file.modifiedTime as string);
        output += `   📅 Modificado: ${modDate.toLocaleDateString("es-ES")}\n`;
      }

      if (file.size) {
        const sizeMB = (Number(file.size) / 1024 / 1024).toFixed(2);
        output += `   📦 Tamaño: ${sizeMB} MB\n`;
      }

      output += `\n`;
    });

    return output;
  }
  return JSON.stringify(data, null, 2);
}

function formatCalendarOutput(data: unknown): string {
  const obj = data as Record<string, unknown>;
  if (obj.items && Array.isArray(obj.items)) {
    const items = obj.items as Array<Record<string, unknown>>;
    if (items.length === 0) {
      return "📅 No hay eventos próximos en el calendario.";
    }

    let output = `📅 **${items.length} eventos próximos:**\n\n`;

    items.forEach((item, i) => {
      const summary = (item.summary as string) || "(sin título)";
      const start = item.start as Record<string, unknown>;
      const end = item.end as Record<string, unknown>;
      const dateTime = (start.dateTime || start.date) as string;
      const endDate = (end.dateTime || end.date) as string;

      // Format date for display
      const startDate = new Date(dateTime);
      const formattedDate = startDate.toLocaleDateString("es-ES", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      output += `${i + 1}. 📌 **${summary}**\n`;
      output += `   🕐 ${formattedDate}\n`;

      if (item.description) {
        const desc = (item.description as string).substring(0, 100);
        output += `   📝 ${desc}${desc.length === 100 ? "..." : ""}\n`;
      }
      output += `\n`;
    });

    return output;
  }
  return JSON.stringify(data, null, 2);
}

function formatSheetsOutput(data: unknown): string {
  const obj = data as Record<string, unknown>;
  if (obj.sheets && Array.isArray(obj.sheets)) {
    const sheets = obj.sheets as Array<Record<string, unknown>>;
    let output = `📊 Found ${sheets.length} sheet(s)\n\n`;
    sheets.forEach((sheet, i) => {
      const title = (sheet.properties as Record<string, unknown>).title as string;
      output += `${i + 1}. ${title}\n`;
    });
    return output;
  }
  return JSON.stringify(data, null, 2);
}

/**
 * Helper function to get detailed info for multiple messages
 * Exported for use in relay.ts
 */
export async function getMessagesDetailed(messageIds: string[]): Promise<string> {
  let output = "";

  for (const messageId of messageIds) {
    const result = await executeGws({
      service: "gmail",
      resource: "users",
      method: "messages",
      submethod: "get",
      params: `{"userId": "me", "id": "${messageId}", "format": "full"}`,
      format: "json",
    });

    if (result.success) {
      output += result.output + "\n\n";
    }
  }

  return output;
}

/**
 * Helper function to list inbox with full content
 * Exported for use in relay.ts
 */
export async function listInboxWithContent(maxResults = 10): Promise<{
  success: boolean;
  output: string;
  error?: string;
}> {
  // First, get the list of messages (raw JSON without formatting)
  const args = ["gmail", "users", "messages", "list", "--params", `{"userId": "me", "maxResults": ${maxResults}}`, "--format", "json"];

  try {
    const proc = spawn(["gws", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE,
      },
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        output: "",
        error: stderr || `gws exited with code ${exitCode}`,
      };
    }

    // Parse raw JSON output
    const listData = JSON.parse(stdout);

    if (!listData.messages || listData.messages.length === 0) {
      return {
        success: true,
        output: "📭 No hay mensajes.",
      };
    }

    // Get detailed content for each message
    const messageIds = listData.messages.map((msg: any) => msg.id);
    const detailedContent = await getMessagesDetailed(messageIds);

    return {
      success: true,
      output: `📧 **${listData.messages.length} mensajes recientes:**\n\n${detailedContent}`,
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Error fetching messages",
    };
  }
}

/**
 * Common gws commands for quick access
 */
export const GwsCommands = {
  // Gmail
  listInbox: (params = '{"userId": "me", "maxResults": 10}') =>
    executeGws({ service: "gmail", resource: "users", method: "messages", submethod: "list", params, format: "json" }),

  getMessage: (messageId: string) =>
    executeGws({
      service: "gmail",
      resource: "users",
      method: "messages",
      submethod: "get",
      params: `{"userId": "me", "id": "${messageId}", "format": "full"}`,
      format: "json",
    }),

  searchMessages: (query: string, maxResults = 10) =>
    executeGws({
      service: "gmail",
      resource: "users",
      method: "messages",
      submethod: "list",
      params: `{"userId": "me", "q": "${query}", "maxResults": ${maxResults}}`,
      format: "json",
    }),

  listUnread: (maxResults = 20) =>
    executeGws({
      service: "gmail",
      resource: "users",
      method: "messages",
      submethod: "list",
      params: `{"userId": "me", "q": "is:unread", "maxResults": ${maxResults}}`,
      format: "json",
    }),

  listInboxWithContent: listInboxWithContent,

  // Drive
  listFiles: (params = '{"pageSize": 20}') =>
    executeGws({ service: "drive", resource: "files", method: "list", params, format: "json" }),

  searchFiles: (query: string, pageSize = 20) =>
    executeGws({
      service: "drive",
      resource: "files",
      method: "list",
      params: `{"q": "name contains '${query}'", "pageSize": ${pageSize}}`,
      format: "json",
    }),

  // Calendar
  listEvents: (params = '{"maxResults": 10}') =>
    executeGws({ service: "calendar", resource: "events", method: "list", params, format: "json" }),

  getEventsToday: () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return executeGws({
      service: "calendar",
      resource: "events",
      method: "list",
      params: JSON.stringify({
        calendarId: "primary",
        timeMin: today.toISOString(),
        timeMax: tomorrow.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }),
      format: "json",
    });
  },

  getEventsThisWeek: () => {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    return executeGws({
      service: "calendar",
      resource: "events",
      method: "list",
      params: JSON.stringify({
        calendarId: "primary",
        timeMin: today.toISOString(),
        timeMax: nextWeek.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }),
      format: "json",
    });
  },

  // Sheets
  getSheet: (spreadsheetId: string) =>
    executeGws({ service: "sheets", resource: "spreadsheets", method: "get", params: `{"spreadsheetId": "${spreadsheetId}"}` }),

  // Generic schema
  getSchema: (serviceResourceMethod: string) =>
    executeGws({ service: "schema", resource: serviceResourceMethod.split(".")[0], method: serviceResourceMethod.split(".").slice(1).join(".") }),
};
