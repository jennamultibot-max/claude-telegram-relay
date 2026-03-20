/**
 * Test script for GWS access
 * Verifies that Gmail, Calendar, and Drive work through gws
 */

import { config } from "dotenv";
config();

import { executeGws, GwsCommands } from "./src/gws-helper.ts";

async function testGmail() {
  console.log("\n📧 Testing Gmail...");
  const result = await executeGws({
    service: "gmail",
    resource: "users",
    method: "messages",
    submethod: "list",
    params: '{"userId": "me", "maxResults": 3}',
    format: "json",
  });

  if (result.success) {
    console.log("✅ Gmail OK");
    console.log(result.output.substring(0, 200) + "...");
  } else {
    console.log("❌ Gmail FAILED:", result.error);
  }
  return result.success;
}

async function testCalendar() {
  console.log("\n📅 Testing Calendar...");
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const result = await executeGws({
    service: "calendar",
    resource: "events",
    method: "list",
    params: JSON.stringify({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: tomorrow.toISOString(),
      singleEvents: true,
    }),
    format: "json",
  });

  if (result.success) {
    console.log("✅ Calendar OK");
    console.log(result.output.substring(0, 200) + "...");
  } else {
    console.log("❌ Calendar FAILED:", result.error);
  }
  return result.success;
}

async function testDrive() {
  console.log("\n📁 Testing Drive...");
  const result = await executeGws({
    service: "drive",
    resource: "files",
    method: "list",
    params: '{"pageSize": 5}',
    format: "json",
  });

  if (result.success) {
    console.log("✅ Drive OK");
    console.log(result.output.substring(0, 200) + "...");
  } else {
    console.log("❌ Drive FAILED:", result.error);
  }
  return result.success;
}

async function main() {
  console.log("=".repeat(50));
  console.log("GWS Integration Test");
  console.log("=".repeat(50));

  console.log("\n🔑 Checking credentials...");
  console.log("GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE:", process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE || "NOT SET");

  const results = await Promise.all([
    testGmail(),
    testCalendar(),
    testDrive(),
  ]);

  console.log("\n" + "=".repeat(50));
  const allPassed = results.every((r) => r);
  if (allPassed) {
    console.log("✅ ALL TESTS PASSED");
  } else {
    console.log("❌ SOME TESTS FAILED");
  }
  console.log("=".repeat(50));

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
