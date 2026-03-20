/**
 * Test script for bot commands (/gmail, /calendar, /drive, /gws)
 * Simulates what happens when the user sends commands via Telegram
 */

import { config } from "dotenv";
config();

import { executeGws, GwsCommands } from "./src/gws-helper.ts";

console.log("=".repeat(60));
console.log("🤖 Testing Bot Commands");
console.log("=".repeat(60));

// Test /gmail command
async function testGmailCommand() {
  console.log("\n📧 Testing /gmail command...");

  const result = await GwsCommands.listInbox('{"userId": "me", "maxResults": 5}');

  if (result.success) {
    console.log("✅ /gmail command works");
    console.log("Output preview:");
    console.log(result.output.substring(0, 300) + "...\n");
    return true;
  } else {
    console.log("❌ /gmail command failed:", result.error);
    return false;
  }
}

// Test /email command (single email)
async function testEmailCommand() {
  console.log("\n📧 Testing /email command...");

  const result = await GwsCommands.listInbox('{"userId": "me", "maxResults": 1}');

  if (result.success) {
    console.log("✅ /email command works");
    return true;
  } else {
    console.log("❌ /email command failed:", result.error);
    return false;
  }
}

// Test /calendar command
async function testCalendarCommand() {
  console.log("\n📅 Testing /calendar command...");

  const result = await GwsCommands.getEventsThisWeek();

  if (result.success) {
    console.log("✅ /calendar command works");
    console.log("Output preview:");
    console.log(result.output.substring(0, 300) + "...\n");
    return true;
  } else {
    console.log("❌ /calendar command failed:", result.error);
    return false;
  }
}

// Test /drive command
async function testDriveCommand() {
  console.log("\n📁 Testing /drive command...");

  const result = await GwsCommands.listFiles('{"pageSize": 10}');

  if (result.success) {
    console.log("✅ /drive command works");
    console.log("Output preview:");
    console.log(result.output.substring(0, 300) + "...\n");
    return true;
  } else {
    console.log("❌ /drive command failed:", result.error);
    return false;
  }
}

// Test searching emails
async function testSearchEmails() {
  console.log("\n🔍 Testing email search...");

  const result = await GwsCommands.searchMessages("important", 5);

  if (result.success) {
    console.log("✅ Email search works");
    return true;
  } else {
    console.log("❌ Email search failed:", result.error);
    return false;
  }
}

// Test searching Drive files
async function testSearchDrive() {
  console.log("\n🔍 Testing Drive search...");

  const result = await GwsCommands.searchFiles("pdf", 5);

  if (result.success) {
    console.log("✅ Drive search works");
    return true;
  } else {
    console.log("❌ Drive search failed:", result.error);
    return false;
  }
}

// Test getting email details
async function testGetEmailDetails() {
  console.log("\n📧 Testing get email details...");

  // First get a message ID
  const listResult = await GwsCommands.listInbox('{"userId": "me", "maxResults": 1}');
  if (!listResult.success) {
    console.log("❌ Could not get message list");
    return false;
  }

  // Parse the message ID from the list
  try {
    // Extract JSON from formatted output (after the text description)
    const jsonMatch = listResult.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("❌ Could not extract JSON from output");
      return false;
    }

    const data = JSON.parse(jsonMatch[0]);
    if (data.messages && data.messages.length > 0) {
      const messageId = data.messages[0].id;
      const result = await GwsCommands.getMessage(messageId);

      if (result.success) {
        console.log("✅ Get email details works");
        console.log("Output preview:");
        console.log(result.output.substring(0, 400) + "...\n");
        return true;
      }
    }
  } catch (e) {
    console.log("❌ Parse error:", e);
  }

  console.log("❌ Get email details failed");
  return false;
}

// Test pre-fetching (natural language queries)
async function testPreFetch() {
  console.log("\n🔮 Testing pre-fetch for natural language queries...");

  const result = await executeGws({
    service: "gmail",
    resource: "users",
    method: "messages",
    submethod: "list",
    params: '{"userId": "me", "pageSize": 10}',
    format: "json",
  });

  if (result.success) {
    console.log("✅ Pre-fetch works");
    return true;
  } else {
    console.log("❌ Pre-fetch failed:", result.error);
    return false;
  }
}

async function main() {
  console.log("\n🔑 Credentials check:");
  console.log("GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE:", process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE || "NOT SET");

  const tests = [
    { name: "Gmail list", fn: testGmailCommand },
    { name: "Email single", fn: testEmailCommand },
    { name: "Calendar", fn: testCalendarCommand },
    { name: "Drive list", fn: testDriveCommand },
    { name: "Search emails", fn: testSearchEmails },
    { name: "Search Drive", fn: testSearchDrive },
    { name: "Email details", fn: testGetEmailDetails },
    { name: "Pre-fetch", fn: testPreFetch },
  ];

  const results = await Promise.all(
    tests.map(async (test) => {
      try {
        const passed = await test.fn();
        return { name: test.name, passed };
      } catch (error) {
        console.error(`\n❌ ${test.name} threw error:`, error);
        return { name: test.name, passed: false };
      }
    })
  );

  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Results Summary:");
  console.log("=".repeat(60));

  results.forEach((result) => {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}: ${result.name}`);
  });

  const allPassed = results.every((r) => r.passed);
  console.log("=".repeat(60));

  if (allPassed) {
    console.log("\n🎉 All bot commands are working correctly!");
    console.log("\n✅ You can now use your Telegram bot:");
    console.log("   • /gmail [N] - List recent emails");
    console.log("   • /email - Show latest email");
    console.log("   • /calendar [N] - Show calendar events");
    console.log("   • /drive [N] - List Drive files");
    console.log("   • /gws <service> <resource> <method> - Execute gws command");
    console.log("   • Natural queries like \"tengo correos nuevos?\" work too!");
  } else {
    console.log("\n⚠️  Some commands failed. Check the errors above.");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
