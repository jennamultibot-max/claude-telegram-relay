/**
 * Gmail Helper using Python script (same as claudeclaw)
 * Uses ~/.config/gmail/gmail.py with OAuth token
 */

import { spawn } from "bun";

interface GmailCommand {
  command: "list" | "read" | "labels";
  args?: string[];
  hours?: number;
  all?: boolean;
}

/**
 * Execute Gmail Python script
 */
export async function executeGmail(command: GmailCommand): Promise<{
  success: boolean;
  output: string;
  error?: string;
}> {
  const args: string[] = [];

  // Build command arguments
  args.push(command.command);

  if (command.hours) args.push("--hours", command.hours.toString());
  if (command.all) args.push("--all");
  if (command.args) args.push(...command.args);

  console.log(`Executing Gmail: ~/.venv/bin/python3 ~/.config/gmail/gmail.py ${args.join(" ")}`);

  try {
    const proc = spawn(["~/.venv/bin/python3", "~/.config/gmail/gmail.py", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      shell: true,
      cwd: "/Users/german",
      env: {
        ...process.env,
        CLAUDECLAW_DIR: "/Users/german/claudeclaw",
        PYTHONUNBUFFERED: "1",
      },
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        output: "",
        error: stderr || `Gmail script exited with code ${exitCode}`,
      };
    }

    // Try to parse JSON output
    try {
      const parsed = JSON.parse(stdout);
      return {
        success: true,
        output: formatGmailOutput(parsed, command.command),
      };
    } catch {
      // Not valid JSON, return as is
      return {
        success: true,
        output: stdout,
      };
    }
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Format Gmail output for better readability
 */
function formatGmailOutput(data: any, command: string): string {
  if (command === "list") {
    if (Array.isArray(data)) {
      const count = data.length;
      if (count === 0) {
        return "📭 No hay emails en la bandeja de entrada.";
      }

      let output = `📧 **Últimos ${count} emails:**\n\n`;

      data.forEach((email: any, i: number) => {
        const from = email.from.split("<")[0].trim() || email.from;
        output += `${i + 1}. **${email.subject}**\n`;
        output += `   De: ${from}\n`;
        output += `   Fecha: ${email.date}\n`;
        if (email.unread) output += `   📌 No leído\n`;
        output += `\n`;
      });

      return output;
    }
  }

  if (command === "read") {
    return `📧 **${data.subject}**\n\n` +
           `De: ${data.from}\n` +
           `Para: ${data.to}\n` +
           `Fecha: ${data.date}\n\n` +
           `${data.body}`;
  }

  return JSON.stringify(data, null, 2);
}

/**
 * Common Gmail commands
 */
export const GmailCommands = {
  listInbox: (count = 5) =>
    executeGmail({ command: "list", all: true }),

  listRecent: (hours = 24) =>
    executeGmail({ command: "list", hours }),

  readEmail: (msgId: string) =>
    executeGmail({ command: "read", args: [msgId] }),

  listLabels: () =>
    executeGmail({ command: "labels" }),
};
