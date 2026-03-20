/**
 * Nozbe API Access Tests
 *
 * Tests basic API connectivity and CRUD operations.
 * Run with: bun run test-nozbe-access.ts
 */

import {
  getProjects,
  getTasks,
  getTaskDetails,
  createTask,
  completeTask,
  addComment,
} from "./src/nozbe-helper.ts";

// ============================================================
// TEST HELPERS
// ============================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  try {
    await testFn();
    results.push({ name, passed: true });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`❌ ${name} FAILED: ${error}`);
  }
}

// ============================================================
// TESTS
// ============================================================

async function testConnection() {
  console.log("\n📡 Testing connection...");
  const projects = await getProjects();
  if (!Array.isArray(projects)) {
    throw new Error("getProjects should return an array");
  }
  console.log(`   Found ${projects.length} projects`);
}

async function testListTasks() {
  console.log("\n📋 Testing list tasks...");
  const tasks = await getTasks({ status: "active", limit: 5 });
  if (!Array.isArray(tasks)) {
    throw new Error("getTasks should return an array");
  }
  console.log(`   Found ${tasks.length} active tasks`);
}

async function testCreateTask() {
  console.log("\n➕ Testing create task...");

  // Get the first project (or "Single Actions" project)
  const projects = await getProjects();
  const singleActionsProject = projects.find((p) => p.is_single_actions) || projects[0];

  if (!singleActionsProject) {
    throw new Error("No projects found");
  }

  const timestamp = Date.now();
  const taskName = `Claude Test Task ${timestamp}`;

  const newTask = await createTask({
    name: taskName,
    projectId: singleActionsProject.id,
  });

  if (!newTask.id) {
    throw new Error("Created task should have an ID");
  }

  if (newTask.name !== taskName) {
    throw new Error(`Task name mismatch: expected "${taskName}", got "${newTask.name}"`);
  }

  console.log(`   Created task: ${newTask.name} (ID: ${newTask.id})`);

  // Save task ID for cleanup and further tests
  (globalThis as any).testTaskId = newTask.id;
  (globalThis as any).testProjectId = singleActionsProject.id;
}

async function testGetTaskDetails() {
  console.log("\n📝 Testing get task details...");

  const taskId = (globalThis as any).testTaskId;
  if (!taskId) {
    throw new Error("No test task ID available. Run create task test first.");
  }

  const task = await getTaskDetails(taskId);

  if (task.id !== taskId) {
    throw new Error("Task ID mismatch");
  }

  console.log(`   Retrieved task: ${task.name}`);
}

async function testAddComment() {
  console.log("\n💬 Testing add comment...");

  const taskId = (globalThis as any).testTaskId;
  if (!taskId) {
    throw new Error("No test task ID available");
  }

  const commentText = `Test comment from automated test at ${new Date().toISOString()}`;

  await addComment(taskId, commentText);

  console.log(`   Added comment: "${commentText}"`);
}

async function testCompleteTask() {
  console.log("\n✅ Testing complete task...");

  const taskId = (globalThis as any).testTaskId;
  if (!taskId) {
    throw new Error("No test task ID available");
  }

  await completeTask(taskId);

  console.log(`   Completed task: ${taskId}`);
}

async function testEdgeCases() {
  console.log("\n⚠️  Testing edge cases...");

  // Test non-existent task
  try {
    await getTaskDetails("nonexistent_id_12345");
    throw new Error("Should have thrown error for non-existent task");
  } catch (error) {
    const errorMsg = (error as Error).message;
    if (errorMsg.includes("No encontré esa tarea") || errorMsg.includes("Failed to fetch task")) {
      console.log("   ✅ Non-existent task ID handled correctly");
    } else {
      throw error;
    }
  }

  // Test empty comment
  try {
    const taskId = (globalThis as any).testTaskId || "dummy_id";
    await addComment(taskId, "x");
    // If we get here, the API accepted a short comment (might be allowed)
    console.log("   ℹ️  Short comments are allowed by API");
  } catch (error) {
    if ((error as Error).message.includes("al menos 2 caracteres")) {
      console.log("   ✅ Short comment validation works");
    } else {
      throw error;
    }
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("============================================================");
  console.log("🧪 Testing Nozbe API Access");
  console.log("============================================================");

  // Check environment
  console.log("\n🔑 Credentials check:");
  if (!process.env.NOZBE_API_TOKEN) {
    console.error("❌ NOZBE_API_TOKEN not set in .env");
    process.exit(1);
  }
  console.log("NOZBE_API_TOKEN: SET ✓");

  // Run tests in sequence
  await runTest("Connection", testConnection);
  await runTest("List tasks", testListTasks);
  await runTest("Create task", testCreateTask);
  await runTest("Task details", testGetTaskDetails);
  await runTest("Add comment", testAddComment);
  await runTest("Complete task", testCompleteTask);
  await runTest("Edge cases", testEdgeCases);

  // Summary
  console.log("\n============================================================");
  console.log("📊 Test Results Summary:");
  console.log("============================================================");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((result) => {
    const icon = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${icon}: ${result.name}`);
    if (!result.passed && result.error) {
      console.log(`   ${result.error}`);
    }
  });

  console.log("============================================================");

  if (failed > 0) {
    console.log(`⚠️  ${failed} test(s) failed. Check the errors above.`);
    process.exit(1);
  } else {
    console.log(`🎉 All ${passed} tests passed!`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
