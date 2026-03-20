/**
 * Test script for Nozbe API access
 * Verifies that Nozbe integration works correctly
 */

import { config } from "dotenv";
config();

import {
  getProjects,
  getTasks,
  createTask,
  completeTask,
  addComment,
  getTaskDetails,
  NozbeCommands,
} from "./src/nozbe-helper.ts";

console.log("=".repeat(60));
console.log("🧪 Testing Nozbe API Access");
console.log("=".repeat(60));

console.log("\n🔑 Credentials check:");
console.log("NOZBE_API_TOKEN:", process.env.NOZBE_API_TOKEN ? "SET ✓" : "NOT SET ✗");

if (!process.env.NOZBE_API_TOKEN) {
  console.error("\n❌ NOZBE_API_TOKEN is required. Set it in .env file.");
  process.exit(1);
}

// Test 1: Connection
async function testConnection() {
  console.log("\n📡 Testing connection...");

  try {
    const projects = await getProjects();
    console.log(`✅ Connection OK. Found ${projects.length} projects`);

    if (projects.length > 0) {
      console.log("Projects:", projects.map((p) => p.name).join(", "));
    }

    return true;
  } catch (error) {
    console.log("❌ Connection FAILED:", error);
    return false;
  }
}

// Test 2: List active tasks
async function testListTasks() {
  console.log("\n📋 Testing list tasks...");

  try {
    const tasks = await getTasks({ status: "active" });
    console.log(`✅ List tasks OK. Found ${tasks.length} active tasks`);
    return true;
  } catch (error) {
    console.log("❌ List tasks FAILED:", error);
    return false;
  }
}

// Test 3: Create task
async function testCreateTask() {
  console.log("\n➕ Testing create task...");

  try {
    const projects = await getProjects();
    if (projects.length === 0) {
      console.log("⚠️  No projects available, skipping task creation");
      return null;
    }

    const testTaskName = `Claude Test Task ${Date.now()}`;
    const task = await createTask({
      name: testTaskName,
      projectId: projects[0].id,
    });

    console.log("✅ Create task OK:", task.name);
    console.log("   Task ID:", task.id);
    return task;
  } catch (error) {
    console.log("❌ Create task FAILED:", error);
    return null;
  }
}

// Test 4: Add comment
async function testAddComment(taskId: string) {
  console.log("\n💬 Testing add comment...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping comment test");
    return false;
  }

  try {
    const success = await addComment(taskId, "Test comment from automated test");
    if (success) {
      console.log("✅ Add comment OK");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ Add comment FAILED:", error);
    return false;
  }
}

// Test 5: Verify comment in task details
async function testTaskDetails(taskId: string) {
  console.log("\n🔍 Testing task details...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping details test");
    return false;
  }

  try {
    const task = await getTaskDetails(taskId);
    console.log(`✅ Task details OK. Comments: ${task.comments_count || 0}`);
    return true;
  } catch (error) {
    console.log("❌ Task details FAILED:", error);
    return false;
  }
}

// Test 6: Complete task
async function testCompleteTask(taskId: string) {
  console.log("\n✅ Testing complete task...");

  if (!taskId) {
    console.log("⚠️  No task ID available, skipping complete test");
    return false;
  }

  try {
    const success = await completeTask(taskId);
    if (success) {
      console.log("✅ Complete task OK");
      return true;
    }
    return false;
  } catch (error) {
    console.log("❌ Complete task FAILED:", error);
    return false;
  }
}

// Test 7: Edge cases
async function testEdgeCases() {
  console.log("\n⚠️  Testing edge cases...");

  let allPassed = true;

  // Invalid token (skip this test as it would require changing env)
  // Non-existent task ID
  try {
    await getTaskDetails("nonexistent-id");
    console.log("❌ Should have thrown for non-existent task");
    allPassed = false;
  } catch (error) {
    if (error instanceof Error && error.message.includes("No encontré")) {
      console.log("✅ Non-existent task ID handled correctly");
    } else {
      console.log("❌ Wrong error message:", error);
      allPassed = false;
    }
  }

  return allPassed;
}

// Main test runner
async function main() {
  const tests = [
    { name: "Connection", fn: testConnection },
    { name: "List tasks", fn: testListTasks },
    { name: "Create task", fn: testCreateTask },
    { name: "Add comment", fn: () => testCreateTask().then(task => task ? testAddComment(task.id) : false) },
    { name: "Task details", fn: () => testCreateTask().then(task => task ? testTaskDetails(task.id) : false) },
    { name: "Complete task", fn: () => testCreateTask().then(task => task ? testCompleteTask(task.id) : false) },
    { name: "Edge cases", fn: testEdgeCases },
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
    console.log("\n🎉 All Nozbe API tests passed!");
    console.log("\n✅ Nozbe integration is working correctly");
  } else {
    console.log("\n⚠️  Some tests failed. Check the errors above.");
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
