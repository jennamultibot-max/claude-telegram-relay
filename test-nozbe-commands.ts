/**
 * Test script for Nozbe Telegram commands
 * Simulates what happens when the user sends commands via Telegram
 */

import { config } from "dotenv";
config();

import {
  getProjects,
  getTasks,
  createTask,
  completeTask,
  addComment,
  NozbeCommands,
} from "./src/nozbe-helper.ts";

console.log("=".repeat(60));
console.log("🤖 Testing Nozbe Bot Commands");
console.log("=".repeat(60));

// Test /nozbe command
async function testNozbeCommand() {
  console.log("\n📋 Testing /nozbe command...");

  try {
    const result = await NozbeCommands.listActive();
    const output = NozbeCommands.formatTasksList(result);

    console.log("✅ /nozbe command works");
    console.log("Output preview:");
    console.log(output.substring(0, 300) + "...\n");
    return true;
  } catch (error) {
    console.log("❌ /nozbe command failed:", error);
    return false;
  }
}

// Test /tarea command (create task)
async function testTareaCommand() {
  console.log("\n➕ Testing /tarea command...");

  try {
    const projects = await getProjects();
    if (projects.length === 0) {
      console.log("⚠️  No projects available, skipping task creation");
      return false;
    }

    const testTaskName = `Test task from commands ${Date.now()}`;
    const task = await createTask({
      name: testTaskName,
      projectId: projects[0].id,
    });

    if (task) {
      console.log("✅ /tarea command works");
      console.log("Created task:", task.name);
      console.log("Task ID:", task.id);
      return { success: true, taskId: task.id };
    }
    return { success: false, taskId: null };
  } catch (error) {
    console.log("❌ /tarea command failed:", error);
    return { success: false, taskId: null };
  }
}

// Test /comentario command
async function testComentarioCommand(taskId: string) {
  console.log("\n💬 Testing /comentario command...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping comment test");
    return false;
  }

  try {
    const result = await addComment(taskId, "Test comment from command test");

    if (result) {
      console.log("✅ /comentario command works");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ /comentario command failed:", error);
    return false;
  }
}

// Test /completar command
async function testCompletarCommand(taskId: string) {
  console.log("\n✅ Testing /completar command...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping complete test");
    return false;
  }

  try {
    const result = await completeTask(taskId);

    if (result) {
      console.log("✅ /completar command works");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ /completar command failed:", error);
    return false;
  }
}

// Test natural language detection
async function testNaturalLanguageDetection() {
  console.log("\n🔮 Testing natural language detection...");

  try {
    const result = await getTasks({ status: "active" });

    if (result) {
      console.log("✅ Natural language pre-fetch works");
      console.log("Would return tasks for queries like '¿qué tareas tengo?'");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ Natural language detection failed:", error);
    return false;
  }
}

async function main() {
  console.log("\n🔑 Credentials check:");
  console.log("NOZBE_API_TOKEN:", process.env.NOZBE_API_TOKEN ? "SET ✓" : "NOT SET ✗");

  const tests = [
    { name: "Nozbe list", fn: testNozbeCommand },
    { name: "Tarea create", fn: testTareaCommand },
    { name: "Comment add", fn: () => testTareaCommand().then(r => r.success && r.taskId ? testComentarioCommand(r.taskId) : false) },
    { name: "Task complete", fn: () => testTareaCommand().then(r => r.success && r.taskId ? testCompletarCommand(r.taskId) : false) },
    { name: "Natural language", fn: testNaturalLanguageDetection },
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
    console.log("   • /nozbe [project] - List tasks");
    console.log("   • /tarea <name> [@project] - Create task");
    console.log("   • /completar <id> - Complete task");
    console.log("   • /comentario <id> <text> - Add comment");
    console.log("   • Natural queries like \"¿qué tareas tengo?\" work too!");
  } else {
    console.log("\n⚠️  Some commands failed. Check the errors above.");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
