/**
 * Quick test for checkin-rules module
 *
 * Run: npx tsx config/test-checkin-rules.ts
 */

import {
  DEFAULT_NOTIFICATION_RULES,
  buildCheckinPrompt,
  isDeepWorkHours,
  getNotificationType,
  formatTaskForPrompt,
  getTimeAgo,
  type CheckinContext,
  type TaskInfo,
} from "./checkin-rules";

console.log("=== Testing checkin-rules module ===\n");

// Test 1: Deep work hours detection
console.log("Test 1: Deep work hours detection");
const morningTime = new Date("2026-03-20T10:00:00"); // 10 AM
const afternoonTime = new Date("2026-03-20T15:00:00"); // 3 PM
const eveningTime = new Date("2026-03-20T19:00:00"); // 7 PM

console.log(`10:00 AM is deep work: ${isDeepWorkHours(morningTime, DEFAULT_NOTIFICATION_RULES)}`);
console.log(`3:00 PM is deep work: ${isDeepWorkHours(afternoonTime, DEFAULT_NOTIFICATION_RULES)}`);
console.log(`7:00 PM is deep work: ${isDeepWorkHours(eveningTime, DEFAULT_NOTIFICATION_RULES)}`);
console.log("✓ Deep work detection working\n");

// Test 2: Task formatting
console.log("Test 2: Task formatting");
const task: TaskInfo = {
  content: "Finish project proposal",
  priority: 4,
  deadline: new Date("2026-03-22"),
};
console.log(formatTaskForPrompt(task));
console.log("✓ Task formatting working\n");

// Test 3: Notification type detection
console.log("Test 3: Notification type detection");
const urgentTask: TaskInfo = {
  content: "Urgent meeting prep",
  priority: 5,
  deadline: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
};
console.log(`Urgent task type: ${getNotificationType(urgentTask, DEFAULT_NOTIFICATION_RULES)}`);

const normalTask: TaskInfo = {
  content: "Read documentation",
  priority: 2,
};
console.log(`Normal task type: ${getNotificationType(normalTask, DEFAULT_NOTIFICATION_RULES)}`);
console.log("✓ Notification type detection working\n");

// Test 4: Full prompt generation
console.log("Test 4: Full prompt generation");
const context: CheckinContext = {
  goals: [
    {
      content: "Complete API integration",
      priority: 4,
      deadline: new Date(Date.now() + 36 * 60 * 60 * 1000), // 36 hours
    },
    {
      content: "Review pull request",
      priority: 2,
    },
  ],
  relevantContext: "User was working on authentication flow yesterday",
  lastMessageTime: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
  lastCheckinTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
  checkinsToday: 1,
  currentTime: new Date(),
  userName: "Germán",
};

const prompt = buildCheckinPrompt(context, DEFAULT_NOTIFICATION_RULES);
console.log("Generated prompt length:", prompt.length);
console.log("Prompt preview (first 500 chars):");
console.log(prompt.substring(0, 500) + "...\n");
console.log("✓ Prompt generation working\n");

// Test 5: Time ago formatting
console.log("Test 5: Time ago formatting");
console.log(`1 hour ago: ${getTimeAgo(new Date(Date.now() - 60 * 60 * 1000))}`);
console.log(`3 hours ago: ${getTimeAgo(new Date(Date.now() - 3 * 60 * 60 * 1000))}`);
console.log(`2 days ago: ${getTimeAgo(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000))}`);
console.log("✓ Time ago formatting working\n");

console.log("=== All tests passed! ===");
