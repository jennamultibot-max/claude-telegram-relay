#!/usr/bin/env bun
/**
 * Test Web Search Functionality
 *
 * Run: bun run setup/test-websearch.ts
 */

import { searchWeb, formatSearchResults } from "../src/websearch.ts";

console.log("Testing Web Search Functionality...\n");

// Test 1: General search
console.log("Test 1: Searching for 'peliculas en cines hoy'");
console.log("-".repeat(50));
const result1 = await searchWeb("peliculas en cines hoy", 3);
console.log(`Success: ${result1.success}`);
console.log(`Results found: ${result1.results.length}`);
if (result1.results.length > 0) {
  console.log("\nResults:");
  console.log(formatSearchResults(result1.results));
}
if (result1.error) {
  console.log(`Error: ${result1.error}`);
}

console.log("\n" + "=".repeat(50) + "\n");

// Test 2: Specific location search
console.log("Test 2: Searching for 'cine alcorcon hoy'");
console.log("-".repeat(50));
const result2 = await searchWeb("cine alcorcon hoy", 3);
console.log(`Success: ${result2.success}`);
console.log(`Results found: ${result2.results.length}`);
if (result2.results.length > 0) {
  console.log("\nResults:");
  console.log(formatSearchResults(result2.results));
}
if (result2.error) {
  console.log(`Error: ${result2.error}`);
}

console.log("\n" + "=".repeat(50) + "\n");

// Test 3: Current weather search
console.log("Test 3: Searching for 'clima madrid hoy'");
console.log("-".repeat(50));
const result3 = await searchWeb("clima madrid hoy", 3);
console.log(`Success: ${result3.success}`);
console.log(`Results found: ${result3.results.length}`);
if (result3.results.length > 0) {
  console.log("\nResults:");
  console.log(formatSearchResults(result3.results));
}
if (result3.error) {
  console.log(`Error: ${result3.error}`);
}

console.log("\n" + "=".repeat(50) + "\n");
console.log("Web search tests completed!");
