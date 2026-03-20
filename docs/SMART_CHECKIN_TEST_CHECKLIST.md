# Smart Check-in System - Manual Test Checklist

**Purpose:** Comprehensive manual testing guide for the smart check-in system
**Last Updated:** 2026-03-20
**System Version:** 1.0.0

---

## Prerequisites

Before starting manual tests, ensure:

- [ ] All environment variables are set in `.env`
- [ ] Supabase project is created and accessible
- [ ] Telegram bot is configured and working
- [ ] At least one test goal exists in Supabase memory table
- [ ] Automated test suite has been run (`bun run examples/test-smart-checkin.ts`)

---

## 1. Supabase Connection Tests

### 1.1 Basic Connectivity
- [ ] Open Supabase dashboard in browser
- [ ] Verify project is accessible
- [ ] Check `memory` table exists with `type` column
- [ ] Check `logs` table exists
- [ ] Verify Edge Functions are deployed (`embed`, `search`)

### 1.2 Goal Retrieval
- [ ] Run: `bun run -e "import { createClient } from '@supabase/supabase-js'; const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY); sb.from('memory').select('*').eq('type', 'goal').then(console.log);"`
- [ ] Verify goals are returned with correct structure
- [ ] Check goals have: `id`, `content`, `deadline`, `priority`

### 1.3 Test Data Setup
- [ ] Insert test goal via Supabase dashboard:
  ```sql
  INSERT INTO memory (type, content, deadline, priority)
  VALUES ('goal', 'Test manual check-in', NOW() + INTERVAL '2 days', 3);
  ```
- [ ] Verify goal appears in table
- [ ] Note the goal ID for cleanup later

---

## 2. Semantic Search Tests

### 2.1 Embedding Generation
- [ ] Run automated test with verbose logging
- [ ] Check Supabase logs for embedding events
- [ ] Verify no timeout errors occur

### 2.2 Context Retrieval
- [ ] Create a test conversation in Supabase:
  ```sql
  INSERT INTO messages (role, content)
  VALUES ('user', 'I need to complete the project documentation');
  ```
- [ ] Run semantic search with goal related to "project documentation"
- [ ] Verify relevant context is found
- [ ] Check similarity scores are reasonable (> 0.7)

### 2.3 Fallback Behavior
- [ ] Temporarily disable Gemini API key in Supabase secrets
- [ ] Run semantic search
- [ ] Verify graceful fallback (returns empty string, no crash)
- [ ] Re-enable Gemini API key

---

## 3. Notification Rules Tests

### 3.1 Priority Thresholds

**Test 3.1.1: High Priority (3+)**
- [ ] Create goal with priority 3, deadline 7 days out
- [ ] Build check-in prompt
- [ ] Verify prompt includes reminder notification type
- [ ] Verify message is not skipped due to low priority

**Test 3.1.2: Urgent Priority (4+)**
- [ ] Create goal with priority 4, no deadline
- [ ] Build check-in prompt
- [ ] Verify prompt includes urgent notification type

**Test 3.1.3: Low Priority (1-2)**
- [ ] Create goal with priority 1, deadline 7 days out
- [ ] Build check-in prompt
- [ ] Verify decision should likely be NO (unless other factors)

### 3.2 Deadline Rules

**Test 3.2.1: Urgent Deadline (< 24h)**
- [ ] Create goal with deadline in 12 hours, priority 2
- [ ] Build check-in prompt
- [ ] Verify urgent notification type is set

**Test 3.2.2: Reminder Deadline (< 3 days)**
- [ ] Create goal with deadline in 2 days, priority 2
- [ ] Build check-in prompt
- [ ] Verify reminder notification type is set

**Test 3.2.3: Overdue Deadline**
- [ ] Create goal with deadline yesterday
- [ ] Build check-in prompt
- [ ] Verify urgent notification type is set

### 3.3 Working Hours Detection

**Test 3.3.1: Morning Deep Work (9-12)**
- [ ] Set current time to 10:00 AM
- [ ] Build check-in prompt
- [ ] Verify prompt shows "SÍ (evitar interrumpir)"

**Test 3.3.2: Afternoon Deep Work (2-5 PM)**
- [ ] Set current time to 3:00 PM
- [ ] Build check-in prompt
- [ ] Verify prompt shows "SÍ (evitar interrumpir)"

**Test 3.3.3: Outside Deep Work Hours**
- [ ] Set current time to 7:00 PM
- [ ] Build check-in prompt
- [ ] Verify prompt shows "No"

### 3.4 Rate Limiting

**Test 3.4.1: Daily Limit**
- [ ] Set `checkinsToday` to 3 (max)
- [ ] Build check-in prompt
- [ ] Verify prompt includes "Máximo 3 notificaciones por día"
- [ ] Decision should likely be NO unless urgent

**Test 3.4.2: Reset Counter**
- [ ] Wait until next day or manually reset `lastResetDate`
- [ ] Build check-in prompt
- [ ] Verify counter shows 0/3

---

## 4. Claude Decision Engine Tests

### 4.1 Decision Parsing
- [ ] Run smart check-in with test data
- [ ] Verify output format:
  ```
  DECISION: YES or NO
  MESSAGE: [message content]
  REASON: [reasoning]
  ```
- [ ] Check regex parsing works correctly

### 4.2 Decision Logic

**Test 4.2.1: Should Check-in YES**
- [ ] Create urgent goal (priority 4 or deadline < 24h)
- [ ] Set `checkinsToday` to 0
- [ ] Set `lastMessageTime` to 5 hours ago
- [ ] Run smart check-in
- [ ] Verify DECISION: YES
- [ ] Verify MESSAGE is not "none"

**Test 4.2.2: Should Check-in NO**
- [ ] Create low priority goal (priority 1, deadline 7 days)
- [ ] Set `checkinsToday` to 3 (max)
- [ ] Set `lastMessageTime` to 30 minutes ago
- [ ] Run smart check-in
- [ ] Verify DECISION: NO
- [ ] Verify MESSAGE is "none"

**Test 4.2.3: Deep Work Hours**
- [ ] Create medium priority goal (priority 3)
- [ ] Set current time to 10:00 AM (deep work)
- [ ] Set `checkinsToday` to 0
- [ ] Run smart check-in
- [ ] Verify DECISION: NO (due to deep work)
- [ ] Verify REASON mentions deep work

### 4.3 Message Quality
- [ ] When DECISION: YES, verify message:
  - [ ] Is in Spanish
  - [ ] Is conversational and friendly
  - [ ] Includes appropriate emoji (not excessive)
  - [ ] Mentions the specific goal
  - [ ] Is brief (not more than 2-3 sentences)
  - [ ] Uses correct notification type indicator (🚨/⏰/✓)

---

## 5. Telegram Integration Tests

### 5.1 Message Sending
- [ ] Run: `bun run examples/test-smart-checkin.ts`
- [ ] When prompted for Telegram test, answer YES
- [ ] Verify test message arrives on Telegram
- [ ] Check message formatting is correct
- [ ] Verify message includes all expected content

### 5.2 Rate Limiting
- [ ] Send two messages quickly (< 1 minute apart)
- [ ] Verify second message is rate limited
- [ ] Check Supabase logs for "telegram_rate_limited" event
- [ ] Wait 1 minute and verify retry succeeds

### 5.3 Error Handling
- [ ] Temporarily use invalid bot token
- [ ] Attempt to send message
- [ ] Verify error is logged to Supabase
- [ ] Verify retry is scheduled
- [ ] Restore valid bot token
- [ ] Wait 5 minutes and verify retry succeeds

---

## 6. Error Handling Tests

### 6.1 Supabase Connection Failure
- [ ] Temporarily set invalid SUPABASE_URL
- [ ] Run smart check-in
- [ ] Verify graceful degradation (no crash)
- [ ] Verify error logged to console
- [ ] Verify empty goals returned
- [ ] Restore valid SUPABASE_URL

### 6.2 Embedding Timeout
- [ ] Temporarily slow network or use very long text
- [ ] Run semantic search
- [ ] Verify timeout after 10 seconds
- [ ] Verify fallback to empty context
- [ ] Check Supabase logs for timeout event

### 6.3 Claude CLI Not Available
- [ ] Temporarily modify CLAUDE_PATH to invalid path
- [ ] Run smart check-in
- [ ] Verify error is caught
- [ ] Verify decision defaults to NO
- [ ] Verify error is logged
- [ ] Restore valid CLAUDE_PATH

### 6.4 Missing Environment Variables
- [ ] Remove TELEGRAM_BOT_TOKEN from .env
- [ ] Run smart check-in
- [ ] Verify graceful exit with error message
- [ ] Restore TELEGRAM_BOT_TOKEN

---

## 7. End-to-End Integration Tests

### 7.1 Complete Flow (Happy Path)
- [ ] Ensure test goal exists in Supabase
- [ ] Run: `bun run examples/smart-checkin-personal.ts`
- [ ] Verify console output shows:
  - "Smart Check-in running..."
  - Goals fetched with correct count
  - Semantic context found/not found
  - Claude decision parsed
  - Telegram sent/not sent
- [ ] If decision YES: verify Telegram message arrives
- [ ] If decision NO: verify reason is logged
- [ ] Check Supabase logs for events

### 7.2 State Persistence
- [ ] Run smart check-in twice
- [ ] Verify check-in counter increments
- [ ] Check state file at `/tmp/checkin-state.json`
- [ ] Verify state is saved correctly

### 7.3 Retry Processing
- [ ] Trigger a rate limit (send message twice)
- [ ] Wait 1 minute
- [ ] Run smart check-in again
- [ ] Verify pending retry is processed
- [ ] Verify retry message is sent

---

## 8. Performance Tests

### 8.1 Execution Time
- [ ] Run smart check-in with timer
- [ ] Total execution should be < 30 seconds
- [ ] Goal retrieval should be < 1 second
- [ ] Semantic search should be < 10 seconds
- [ ] Claude decision should be < 15 seconds

### 8.2 Memory Usage
- [ ] Monitor memory during execution
- [ ] Memory should not grow excessively
- [ ] No memory leaks after multiple runs

### 8.3 Concurrent Execution
- [ ] Run two smart check-ins simultaneously
- [ ] Verify both complete successfully
- [ ] Verify state file is not corrupted
- [ ] Verify rate limiting works correctly

---

## 9. Scheduling Tests (Launchd)

### 9.1 Service Installation
- [ ] Check if launchd service is installed:
  ```bash
  launchctl list | grep com.claude
  ```
- [ ] Verify service shows as running

### 9.2 Scheduled Execution
- [ ] Check service runs every 30 minutes
- [ ] View service logs:
  ```bash
  log stream --predicate 'process == "bun" AND eventMessage contains "Smart Check-in"'
  ```
- [ ] Verify regular executions

### 9.3 Service Persistence
- [ ] Restart computer
- [ ] Verify service starts automatically
- [ ] Check logs confirm execution after boot

### 9.4 Service Management
- [ ] Stop service: `launchctl stop com.claude.checkin`
- [ ] Verify service stops
- [ ] Start service: `launchctl start com.claude.checkin`
- [ ] Verify service starts

---

## 10. Cleanup

After completing all tests:

- [ ] Delete test goals from Supabase
- [ ] Delete test messages from Supabase
- [ ] Clear test logs from Supabase
- [ ] Reset check-in state file if needed
- [ ] Verify system is in clean state

---

## Test Results Summary

**Date:** _______________
**Tester:** _______________

| Test Category | Passed | Failed | Notes |
|--------------|--------|--------|-------|
| Supabase Connection | ___/___ | ___ | |
| Semantic Search | ___/___ | ___ | |
| Notification Rules | ___/___ | ___ | |
| Claude Decision | ___/___ | ___ | |
| Telegram Integration | ___/___ | ___ | |
| Error Handling | ___/___ | ___ | |
| End-to-End Flow | ___/___ | ___ | |
| Performance | ___/___ | ___ | |
| Scheduling | ___/___ | ___ | |

**Overall Status:** ⬜ PASS / ⬜ FAIL / ⬜ PARTIAL

**Issues Found:**
1.
2.
3.

**Recommendations:**
1.
2.
3.

---

## Sign-Off

**Tested By:** _______________
**Date:** _______________
**Approved for Production:** ⬜ YES / ⬜ NO / ⬜ NEEDS FIXES

**Notes:**
