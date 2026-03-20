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

  // Build command arguments
  if (command.service) args.push(command.service);
  if (command.resource) args.push(command.resource);
  if (command.method) args.push(command.method);
  if (command.submethod) args.push(command.submethod);

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
  // Check if it's a list of messages
  const obj = data as Record<string, unknown>;
  if (obj.messages && Array.isArray(obj.messages)) {
    const count = obj.messages.length;
    return `📧 Found ${count} message(s)\n\n${JSON.stringify(data, null, 2)}`;
  }
  return JSON.stringify(data, null, 2);
}

function formatDriveOutput(data: unknown): string {
  const obj = data as Record<string, unknown>;
  if (obj.files && Array.isArray(obj.files)) {
    const files = obj.files as Array<Record<string, unknown>>;
    let output = `📁 Found ${files.length} file(s)\n\n`;
    files.forEach((file, i) => {
      output += `${i + 1}. ${file.name as string} (${file.id as string})\n`;
    });
    return output;
  }
  return JSON.stringify(data, null, 2);
}

function formatCalendarOutput(data: unknown): string {
  const obj = data as Record<string, unknown>;
  if (obj.items && Array.isArray(obj.items)) {
    const items = obj.items as Array<Record<string, unknown>>;
    let output = `📅 Found ${items.length} event(s)\n\n`;
    items.forEach((item, i) => {
      const summary = (item.summary as string) || "(no title)";
      const start = item.start as Record<string, unknown>;
      const dateTime = (start.dateTime || start.date) as string;
      output += `${i + 1}. ${summary} — ${dateTime}\n`;
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
 * Common gws commands for quick access
 */
export const GwsCommands = {
  // Gmail
  listInbox: (params = '{"pageSize": 10}') =>
    executeGws({ service: "gmail", resource: "users", method: "messages", submethod: "list", params }),

  // Drive
  listFiles: (params = '{"pageSize": 20}') =>
    executeGws({ service: "drive", resource: "files", method: "list", params }),

  // Calendar
  listEvents: (params = '{"maxResults": 10}') =>
    executeGws({ service: "calendar", resource: "events", method: "list", params }),

  // Sheets
  getSheet: (spreadsheetId: string) =>
    executeGws({ service: "sheets", resource: "spreadsheets", method: "get", params: `{"spreadsheetId": "${spreadsheetId}"}` }),

  // Generic schema
  getSchema: (serviceResourceMethod: string) =>
    executeGws({ service: "schema", resource: serviceResourceMethod.split(".")[0], method: serviceResourceMethod.split(".").slice(1).join(".") }),
};
