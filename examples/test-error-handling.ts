/**
 * Test Error Handling Utilities
 *
 * Simple test to verify error handling functions work correctly
 */

import { safeSupabaseCall, withTimeout, logError, logInfo } from "../src/error-handling.js";
import { createClient } from "@supabase/supabase-js";

async function testWithTimeout() {
  console.log("\n=== Testing withTimeout ===");

  try {
    // Test successful case
    const result = await withTimeout(
      Promise.resolve("success"),
      1000
    );
    console.log("✅ Fast promise:", result);

    // Test timeout case
    try {
      await withTimeout(
        new Promise((resolve) => setTimeout(resolve, 2000)),
        1000
      );
      console.log("❌ Should have timed out");
    } catch (error: any) {
      console.log("✅ Timeout works:", error.message);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

async function testSafeSupabaseCall() {
  console.log("\n=== Testing safeSupabaseCall ===");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("⚠️  Skipping Supabase tests (no credentials)");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // Test successful call
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
      "test_logs_query"
    );
    console.log("✅ Supabase call successful, returned", result.length, "rows");

    // Test retry with invalid query
    const fallbackResult = await safeSupabaseCall(
      async () => {
        const { data, error } = await supabase
          .from("nonexistent_table")
          .select("*");
        if (error) throw error;
        return data;
      },
      null,
      "test_invalid_query"
    );
    console.log("✅ Fallback returned:", fallbackResult);
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

async function testLogging() {
  console.log("\n=== Testing Logging ===");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("⚠️  Skipping logging tests (no credentials)");
    return;
  }

  try {
    await logInfo("test_event", "This is a test info log", { testKey: "testValue" });
    console.log("✅ Info log sent");

    await logError("test_error", new Error("This is a test error"), { testKey: "testValue" });
    console.log("✅ Error log sent");
  } catch (error) {
    console.error("❌ Logging test failed:", error);
  }
}

async function main() {
  console.log("🧪 Testing Error Handling Utilities");
  console.log("Time:", new Date().toLocaleString());

  await testWithTimeout();
  await testSafeSupabaseCall();
  await testLogging();

  console.log("\n✅ All tests completed!");
}

main();
