/**
 * Comprehensive Test Suite for Smart Check-in System
 *
 * Tests all components of the smart check-in system:
 * - Supabase connection and goal retrieval
 * - Semantic search and context retrieval
 * - Notification rules and decision engine
 * - Telegram messaging with retry logic
 * - Error handling and graceful degradation
 * - End-to-end integration flow
 *
 * Run: bun run examples/test-smart-checkin.ts
 */

import { createClient } from "@supabase/supabase-js";
import { getRelevantContext, Goal } from "../src/embedding-utils.js";
import {
  buildCheckinPrompt,
  DEFAULT_NOTIFICATION_RULES,
  isDeepWorkHours,
  getNotificationType,
  getTimeAgo,
  CheckinContext,
  TaskInfo,
} from "../config/checkin-rules.js";
import {
  safeSupabaseCall,
  safeEmbeddingGeneration,
  withTimeout,
  logError,
  logInfo,
  sendTelegramWithRetry,
} from "../src/error-handling.js";

// ============================================================
// TEST UTILITIES
// ============================================================

interface TestResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  duration: number;
  error?: string;
  details?: string;
}

const testResults: TestResult[] = [];

function testCase(name: string) {
  return {
    async run(
      testFn: () => Promise<void>,
      skip: boolean = false
    ): Promise<void> {
      const startTime = Date.now();
      try {
        if (skip) {
          testResults.push({
            name,
            status: "SKIP",
            duration: 0,
            details: "Test skipped",
          });
          console.log(`⏭️  SKIP: ${name}`);
          return;
        }

        await testFn();
        const duration = Date.now() - startTime;
        testResults.push({
          name,
          status: "PASS",
          duration,
        });
        console.log(`✅ PASS: ${name} (${duration}ms)`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        testResults.push({
          name,
          status: "FAIL",
          duration,
          error: error.message,
          details: error.stack,
        });
        console.error(`❌ FAIL: ${name} (${duration}ms)`);
        console.error(`   Error: ${error.message}`);
      }
    },
  };
}

async function setupTestGoal(supabase: any, goal: Partial<Goal>): Promise<string> {
  const { data, error } = await supabase
    .from("memory")
    .insert({
      type: "goal",
      content: goal.content || "Test goal",
      deadline: goal.deadline || null,
      priority: goal.priority || 1,
    })
    .select()
    .single();

  if (error) throw error;
  return data.id;
}

async function cleanupTestGoal(supabase: any, id: string): Promise<void> {
  await supabase.from("memory").delete().eq("id", id);
}

// ============================================================
// UNIT TESTS
// ============================================================

async function testSupabaseConnection() {
  console.log("\n=== UNIT TESTS: Supabase Connection ===\n");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("⚠️  Skipping Supabase tests (no credentials)");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Test 1: Basic connection
  await testCase("Supabase: Basic connection").run(async () => {
    const result = await safeSupabaseCall(
      async () => {
        const { data, error } = await supabase
          .from("logs")
          .select("*")
          .limit(1);
        if (error) throw error;
        return data;
      },
      [],
      "test_connection"
    );

    if (!Array.isArray(result)) {
      throw new Error("Expected array result");
    }
  });

  // Test 2: Goal retrieval
  await testCase("Supabase: Get active goals").run(async () => {
    const goals = await safeSupabaseCall(
      async () => {
        const { data, error } = await supabase
          .from("memory")
          .select("id, content, deadline, priority")
          .eq("type", "goal")
          .order("priority", { ascending: false });

        if (error) throw error;
        return (data || []).map((goal: any) => ({
          id: goal.id,
          content: goal.content,
          deadline: goal.deadline,
          priority: goal.priority || 1,
        }));
      },
      [],
      "get_active_goals"
    );

    if (!Array.isArray(goals)) {
      throw new Error("Expected goals to be an array");
    }
  });

  // Test 3: Insert and retrieve test goal
  await testCase("Supabase: Insert and retrieve goal").run(async () => {
    const testGoal = {
      content: "Test goal for smart check-in",
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      priority: 3,
    };

    const id = await setupTestGoal(supabase, testGoal);

    try {
      const { data, error } = await supabase
        .from("memory")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      if (!data) throw new Error("Goal not found");
      if (data.content !== testGoal.content) {
        throw new Error("Content mismatch");
      }
    } finally {
      await cleanupTestGoal(supabase, id);
    }
  });

  // Test 4: Timeout handling
  await testCase("Supabase: Timeout handling").run(async () => {
    // This test uses a very short timeout to trigger timeout error
    try {
      await withTimeout(
        new Promise((resolve) => setTimeout(resolve, 5000)),
        100,
        new Error("Operation timed out")
      );
      throw new Error("Should have timed out");
    } catch (error: any) {
      if (!error.message.includes("timed out")) {
        throw new Error("Expected timeout error, got: " + error.message);
      }
    }
  });
}

async function testSemanticSearch() {
  console.log("\n=== UNIT TESTS: Semantic Search ===\n");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("⚠️  Skipping semantic search tests (no credentials)");
    return;
  }

  // Test 1: Empty goals array
  await testCase("Semantic Search: Empty goals array").run(async () => {
    const context = await getRelevantContext([]);
    if (context !== "") {
      throw new Error("Expected empty string for empty goals");
    }
  });

  // Test 2: Semantic search with test goals
  await testCase("Semantic Search: Get relevant context").run(async () => {
    const testGoals: Goal[] = [
      {
        id: "test-1",
        content: "Complete project documentation",
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 3,
      },
      {
        id: "test-2",
        content: "Review pull requests",
        deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 4,
      },
    ];

    const context = await getRelevantContext(testGoals);

    // Context should be a string (may be empty if no matches)
    if (typeof context !== "string") {
      throw new Error("Expected context to be a string");
    }

    console.log(`    Found context length: ${context.length} chars`);
  });

  // Test 3: Embedding generation with timeout
  await testCase("Semantic Search: Embedding timeout handling").run(async () => {
    // Test with safe embedding generation
    const embedding = await safeEmbeddingGeneration(
      "test query for embedding",
      async (text: string) => {
        // Simulate timeout
        await new Promise((resolve) => setTimeout(resolve, 11000));
        return null;
      }
    );

    // Should return null on timeout
    if (embedding !== null) {
      throw new Error("Expected null on timeout");
    }
  });
}

async function testNotificationRules() {
  console.log("\n=== UNIT TESTS: Notification Rules ===\n");

  // Test 1: Deep work hours detection
  await testCase("Rules: Deep work hours - morning").run(async () => {
    const morningTime = new Date();
    morningTime.setHours(10, 0, 0, 0); // 10 AM

    const isDeepWork = isDeepWorkHours(morningTime, DEFAULT_NOTIFICATION_RULES);
    if (!isDeepWork) {
      throw new Error("Expected 10 AM to be deep work hours");
    }
  });

  await testCase("Rules: Deep work hours - afternoon").run(async () => {
    const afternoonTime = new Date();
    afternoonTime.setHours(15, 0, 0, 0); // 3 PM

    const isDeepWork = isDeepWorkHours(afternoonTime, DEFAULT_NOTIFICATION_RULES);
    if (!isDeepWork) {
      throw new Error("Expected 3 PM to be deep work hours");
    }
  });

  await testCase("Rules: Deep work hours - outside").run(async () => {
    const eveningTime = new Date();
    eveningTime.setHours(19, 0, 0, 0); // 7 PM

    const isDeepWork = isDeepWorkHours(eveningTime, DEFAULT_NOTIFICATION_RULES);
    if (isDeepWork) {
      throw new Error("Expected 7 PM to NOT be deep work hours");
    }
  });

  // Test 2: Notification type determination
  await testCase("Rules: Urgent notification (deadline < 24h)").run(async () => {
    const task: TaskInfo = {
      content: "Urgent task",
      priority: 3,
      deadline: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
    };

    const notificationType = getNotificationType(task, DEFAULT_NOTIFICATION_RULES);
    if (notificationType !== "urgent") {
      throw new Error(`Expected urgent, got ${notificationType}`);
    }
  });

  await testCase("Rules: Reminder notification (deadline < 3 days)").run(async () => {
    const task: TaskInfo = {
      content: "Task with deadline",
      priority: 2,
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
    };

    const notificationType = getNotificationType(task, DEFAULT_NOTIFICATION_RULES);
    if (notificationType !== "reminder") {
      throw new Error(`Expected reminder, got ${notificationType}`);
    }
  });

  await testCase("Rules: Urgent notification (priority 4+)").run(async () => {
    const task: TaskInfo = {
      content: "High priority task",
      priority: 4,
      deadline: null,
    };

    const notificationType = getNotificationType(task, DEFAULT_NOTIFICATION_RULES);
    if (notificationType !== "urgent") {
      throw new Error(`Expected urgent, got ${notificationType}`);
    }
  });

  // Test 3: Time ago formatting
  await testCase("Rules: Time ago formatting").run(async () => {
    const now = Date.now();

    const minutesAgo = getTimeAgo(new Date(now - 5 * 60 * 1000));
    if (!minutesAgo.includes("minuto")) {
      throw new Error(`Expected minutes, got ${minutesAgo}`);
    }

    const hoursAgo = getTimeAgo(new Date(now - 3 * 60 * 60 * 1000));
    if (!hoursAgo.includes("hora")) {
      throw new Error(`Expected hours, got ${hoursAgo}`);
    }

    const daysAgo = getTimeAgo(new Date(now - 2 * 24 * 60 * 60 * 1000));
    if (!daysAgo.includes("día")) {
      throw new Error(`Expected days, got ${daysAgo}`);
    }
  });

  // Test 4: Check-in prompt building
  await testCase("Rules: Build check-in prompt").run(async () => {
    const context: CheckinContext = {
      goals: [
        {
          content: "Test goal",
          priority: 3,
          deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
      ],
      relevantContext: "Previous discussion about this goal",
      lastMessageTime: new Date(Date.now() - 5 * 60 * 60 * 1000),
      lastCheckinTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
      checkinsToday: 1,
      currentTime: new Date(),
      userName: "TestUser",
    };

    const prompt = buildCheckinPrompt(context, DEFAULT_NOTIFICATION_RULES);

    if (!prompt.includes("TestUser")) {
      throw new Error("Prompt missing user name");
    }
    if (!prompt.includes("Test goal")) {
      throw new Error("Prompt missing goal");
    }
    if (!prompt.includes("Previous discussion")) {
      throw new Error("Prompt missing relevant context");
    }
    if (!prompt.includes("DECISION:")) {
      throw new Error("Prompt missing decision format");
    }
  });
}

async function testErrorHandling() {
  console.log("\n=== UNIT TESTS: Error Handling ===\n");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  // Test 1: Logging to Supabase
  await testCase("Error Handling: Log info to Supabase").run(
    async () => {
      await logInfo("test_info_event", "This is a test info log", {
        testKey: "testValue",
      });
    },
    !supabaseUrl || !supabaseAnonKey
  );

  await testCase("Error Handling: Log error to Supabase").run(
    async () => {
      await logError(
        "test_error_event",
        new Error("This is a test error"),
        { testKey: "testValue" }
      );
    },
    !supabaseUrl || !supabaseAnonKey
  );

  // Test 2: Retry logic with safeSupabaseCall
  await testCase("Error Handling: Retry with fallback").run(async () => {
    let attempts = 0;
    const result = await safeSupabaseCall(
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("Simulated failure");
        }
        return "success";
      },
      "fallback_value",
      "test_retry"
    );

    if (result !== "success") {
      throw new Error("Expected success after retry");
    }
    if (attempts !== 2) {
      throw new Error(`Expected 2 attempts, got ${attempts}`);
    }
  });

  // Test 3: Max retries exceeded
  await testCase("Error Handling: Max retries exceeded").run(async () => {
    let attempts = 0;
    const result = await safeSupabaseCall(
      async () => {
        attempts++;
        throw new Error("Always fails");
      },
      "fallback_value",
      "test_max_retries"
    );

    if (result !== "fallback_value") {
      throw new Error("Expected fallback value");
    }
    if (attempts !== 3) {
      throw new Error(`Expected 3 attempts, got ${attempts}`);
    }
  });
}

// ============================================================
// INTEGRATION TESTS
// ============================================================

async function testEndToEndFlow() {
  console.log("\n=== INTEGRATION TESTS: End-to-End Flow ===\n");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("⚠️  Skipping integration tests (no credentials)");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Test 1: Complete flow with test goal
  await testCase("Integration: Complete flow with test goal").run(async () => {
    // Create test goal
    const testGoal = {
      content: "Integration test goal for smart check-in",
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      priority: 3,
    };

    const goalId = await setupTestGoal(supabase, testGoal);

    try {
      // Fetch goals
      const goals = await safeSupabaseCall(
        async () => {
          const { data, error } = await supabase
            .from("memory")
            .select("id, content, deadline, priority")
            .eq("type", "goal")
            .eq("id", goalId);

          if (error) throw error;
          return (data || []).map((goal: any) => ({
            id: goal.id,
            content: goal.content,
            deadline: goal.deadline,
            priority: goal.priority || 1,
          }));
        },
        [],
        "get_test_goal"
      );

      if (goals.length !== 1) {
        throw new Error(`Expected 1 goal, got ${goals.length}`);
      }

      // Get semantic context
      const context = await getRelevantContext(goals);
      if (typeof context !== "string") {
        throw new Error("Expected context to be string");
      }

      // Build prompt
      const checkinContext: CheckinContext = {
        goals: goals.map((g) => ({
          content: g.content,
          priority: g.priority,
          deadline: g.deadline ? new Date(g.deadline) : null,
        })),
        relevantContext: context,
        lastMessageTime: new Date(Date.now() - 5 * 60 * 60 * 1000),
        lastCheckinTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
        checkinsToday: 1,
        currentTime: new Date(),
        userName: "TestUser",
      };

      const prompt = buildCheckinPrompt(checkinContext, DEFAULT_NOTIFICATION_RULES);

      if (!prompt.includes(testGoal.content)) {
        throw new Error("Prompt missing goal content");
      }

      console.log(`    ✅ Goal retrieved, context generated, prompt built`);
    } finally {
      await cleanupTestGoal(supabase, goalId);
    }
  });

  // Test 2: Error recovery - missing Supabase credentials
  await testCase("Integration: Graceful degradation without Supabase").run(async () => {
    // Temporarily clear credentials
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_ANON_KEY;

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    try {
      // This should not crash, just return empty results
      const goals = await safeSupabaseCall(
        async () => {
          throw new Error("Should not be called");
        },
        [],
        "test_no_supabase"
      );

      if (goals.length !== 0) {
        throw new Error("Expected empty goals array");
      }

      const context = await getRelevantContext([]);
      if (context !== "") {
        throw new Error("Expected empty context");
      }

      console.log(`    ✅ System degrades gracefully without Supabase`);
    } finally {
      // Restore credentials
      if (originalUrl) process.env.SUPABASE_URL = originalUrl;
      if (originalKey) process.env.SUPABASE_ANON_KEY = originalKey;
    }
  });
}

async function testTelegramIntegration() {
  console.log("\n=== INTEGRATION TESTS: Telegram ===\n");

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_USER_ID;

  if (!botToken || !chatId) {
    console.log("⚠️  Skipping Telegram tests (no credentials)");
    return;
  }

  // Test 1: Send test message
  await testCase("Telegram: Send test message").run(
    async () => {
      const testMessage = `🧪 Smart Check-in Test\n\nThis is an automated test message from the smart check-in system.\n\nTime: ${new Date().toLocaleString()}`;

      const success = await sendTelegramWithRetry(botToken, chatId, testMessage);

      if (!success) {
        throw new Error("Failed to send test message");
      }

      console.log(`    ✅ Test message sent to Telegram`);
    },
    false // Set to true to skip actual sending
  );
}

// ============================================================
// PERFORMANCE TESTS
// ============================================================

async function testPerformance() {
  console.log("\n=== PERFORMANCE TESTS ===\n");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("⚠️  Skipping performance tests (no credentials)");
    return;
  }

  // Test 1: Goal retrieval performance
  await testCase("Performance: Goal retrieval < 1s").run(async () => {
    const startTime = Date.now();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const goals = await safeSupabaseCall(
      async () => {
        const { data, error } = await supabase
          .from("memory")
          .select("id, content, deadline, priority")
          .eq("type", "goal")
          .order("priority", { ascending: false });

        if (error) throw error;
        return data || [];
      },
      [],
      "performance_test_goals"
    );

    const duration = Date.now() - startTime;

    if (duration > 1000) {
      throw new Error(`Goal retrieval too slow: ${duration}ms`);
    }

    console.log(`    ✅ Retrieved ${goals.length} goals in ${duration}ms`);
  });

  // Test 2: Semantic search performance
  await testCase("Performance: Semantic search < 10s").run(async () => {
    const testGoals: Goal[] = [
      {
        id: "perf-test-1",
        content: "Performance test goal for semantic search",
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 3,
      },
    ];

    const startTime = Date.now();
    const context = await getRelevantContext(testGoals);
    const duration = Date.now() - startTime;

    if (duration > 10000) {
      throw new Error(`Semantic search too slow: ${duration}ms`);
    }

    console.log(`    ✅ Semantic search completed in ${duration}ms`);
  });
}

// ============================================================
// MAIN TEST RUNNER
// ============================================================

async function main() {
  console.log("\n🧪 SMART CHECK-IN SYSTEM - COMPREHENSIVE TEST SUITE");
  console.log("=" .repeat(60));
  console.log(`Time: ${new Date().toLocaleString()}\n`);

  const startTime = Date.now();

  // Run all test suites
  try {
    await testSupabaseConnection();
    await testSemanticSearch();
    await testNotificationRules();
    await testErrorHandling();
    await testEndToEndFlow();
    await testTelegramIntegration();
    await testPerformance();
  } catch (error) {
    console.error("\n❌ Test suite crashed:", error);
  }

  const totalDuration = Date.now() - startTime;

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));

  const passed = testResults.filter((r) => r.status === "PASS").length;
  const failed = testResults.filter((r) => r.status === "FAIL").length;
  const skipped = testResults.filter((r) => r.status === "SKIP").length;

  console.log(`Total Tests: ${testResults.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`Total Duration: ${totalDuration}ms`);

  if (failed > 0) {
    console.log("\n❌ FAILED TESTS:");
    testResults
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        console.log(`  - ${r.name}`);
        console.log(`    ${r.error}`);
      });
  }

  console.log("\n" + "=".repeat(60));

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
main();
