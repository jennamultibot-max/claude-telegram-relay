# Smart Check-in Testing - Quick Start Guide

**Last Updated:** 2026-03-20

---

## Prerequisites Checklist

Before running tests, ensure you have:

- [ ] **Bun runtime** installed (`curl -fsSL https://bun.sh/install | bash`)
- [ ] **Supabase project** created and accessible
- [ ] **Telegram bot** configured with valid token
- [ ] **Claude CLI** installed (`npm install -g @anthropic-ai/claude-code`)
- [ ] **Environment variables** set in `.env`:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_USER_ID`
  - `GEMINI_API_KEY` (stored in Supabase secrets)

---

## Quick Test Run

### 1. Automated Test Suite (5 minutes)

```bash
# Run all automated tests
bun run examples/test-smart-checkin.ts
```

**Expected Output:**
- Test results with PASS/FAIL/SKIP status
- Execution time for each test
- Summary with total passed/failed

**What It Tests:**
- ✅ Supabase connection
- ✅ Goal retrieval
- ✅ Semantic search
- ✅ Notification rules
- ✅ Error handling
- ✅ Performance benchmarks

### 2. Manual Verification (15 minutes)

Open the manual checklist:
```bash
cat docs/SMART_CHECKIN_TEST_CHECKLIST.md
```

**Critical Tests to Complete:**
1. **Supabase Connection** (Section 1)
   - Verify tables exist
   - Insert test goal
   - Confirm retrieval works

2. **Telegram Delivery** (Section 5.1)
   - Send test message
   - Verify it arrives

3. **End-to-End Flow** (Section 7.1)
   - Run actual smart check-in
   - Verify decision and message

### 3. Full System Test (30 minutes)

```bash
# 1. Ensure test data exists
# Run SQL in Supabase dashboard:
INSERT INTO memory (type, content, deadline, priority)
VALUES ('goal', 'Test smart check-in system', NOW() + INTERVAL '2 days', 3);

# 2. Run smart check-in
bun run examples/smart-checkin-personal.ts

# 3. Verify output shows:
# - Goals fetched
# - Semantic context found
# - Claude decision made
# - Telegram message sent (if decision YES)

# 4. Check Telegram for message

# 5. Clean up test data
DELETE FROM memory WHERE content = 'Test smart check-in system';
```

---

## Troubleshooting

### "bun: command not found"

**Solution:** Install Bun runtime
```bash
curl -fsSL https://bun.sh/install | bash
# Restart terminal or run: export PATH="$HOME/.bun/bin:$PATH"
```

### "Missing SUPABASE_URL"

**Solution:** Check `.env` file
```bash
cat .env | grep SUPABASE
```

If missing, add:
```bash
echo "SUPABASE_URL=your_url_here" >> .env
echo "SUPABASE_ANON_KEY=your_key_here" >> .env
```

### "Claude CLI not found"

**Solution:** Install Claude CLI
```bash
npm install -g @anthropic-ai/claude-code
```

### "Telegram message not received"

**Check:**
1. Bot token is correct: `cat .env | grep TELEGRAM_BOT_TOKEN`
2. User ID is correct: `cat .env | grep TELEGRAM_USER_ID`
3. Bot is started: Send `/start` to your bot in Telegram
4. Check logs in Supabase for errors

### "Semantic search fails"

**Check:**
1. Gemini API key is set in Supabase Edge Functions secrets
2. `embed` Edge Function is deployed
3. `match_memory` RPC function exists in Supabase

---

## Test Results Interpretation

### Automated Test Results

```
✅ PASS: Supabase: Basic connection (234ms)
✅ PASS: Supabase: Get active goals (156ms)
❌ FAIL: Semantic Search: Get relevant context (10543ms)
   Error: Embedding generation timed out
⏭️  SKIP: Telegram: Send test message (Test skipped)
```

**What This Means:**
- **PASS:** Component working correctly
- **FAIL:** Component has issues (check error message)
- **SKIP:** Test was skipped (usually missing credentials)

### Manual Test Results

Use the checklist in `docs/SMART_CHECKIN_TEST_CHECKLIST.md`

**Rating System:**
- ✅ PASS: Test completed successfully
- ❌ FAIL: Test failed (document issue)
- ⚠️ WARN: Test passed with concerns
- ⏭️ SKIP: Test not applicable

---

## Performance Benchmarks

### Expected Timings

| Component | Target | Acceptable | Critical |
|-----------|--------|------------|----------|
| Supabase connection | < 500ms | < 1s | > 2s |
| Goal retrieval | < 1s | < 2s | > 5s |
| Semantic search | < 5s | < 10s | > 15s |
| Claude decision | < 15s | < 30s | > 60s |
| **Total execution** | **< 30s** | **< 60s** | **> 120s** |

**If Exceeds Critical:**
- Check network connectivity
- Verify Supabase project region
- Check Claude CLI performance
- Review error logs

---

## Common Test Scenarios

### Scenario 1: First Time Setup

```bash
# 1. Install dependencies
curl -fsSL https://bun.sh/install | bash
npm install -g @anthropic-ai/claude-code

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Verify connections
bun run examples/test-smart-checkin.ts

# 4. Run first check-in
bun run examples/smart-checkin-personal.ts
```

### Scenario 2: Testing Error Handling

```bash
# Test with invalid Supabase URL
SUPABASE_URL="invalid" bun run examples/smart-checkin-personal.ts
# Should gracefully degrade, not crash

# Test with invalid Telegram token
TELEGRAM_BOT_TOKEN="invalid" bun run examples/smart-checkin-personal.ts
# Should log error, continue execution
```

### Scenario 3: Performance Testing

```bash
# Run with timing
time bun run examples/smart-checkin-personal.ts

# Expected: < 30 seconds total
```

### Scenario 4: Monitoring Production

```bash
# Check logs in Supabase
# Query: SELECT * FROM logs ORDER BY created_at DESC LIMIT 50

# Check state file
cat /tmp/checkin-state.json

# Check launchd service
launchctl list | grep com.claude
```

---

## Next Steps After Testing

### If All Tests Pass ✅

1. **Set up scheduling**
   ```bash
   bun run setup:launchd -- --service relay
   ```

2. **Monitor first day**
   - Check Telegram messages arrive
   - Review Supabase logs
   - Verify decisions are sensible

3. **Iterate and improve**
   - Adjust notification rules if needed
   - Tune priority thresholds
   - Customize working hours

### If Tests Fail ❌

1. **Check error logs**
   ```bash
   # In Supabase dashboard
   SELECT * FROM logs WHERE level = 'error' ORDER BY created_at DESC;
   ```

2. **Review troubleshooting section above**

3. **Check documentation**
   - `CLAUDE.md` - Setup guide
   - `docs/SMART_CHECKIN_TEST_REPORT.md` - Full analysis

4. **Ask for help**
   - Review error messages
   - Check system requirements
   - Verify configuration

---

## Quick Reference Commands

```bash
# Run tests
bun run examples/test-smart-checkin.ts

# Run smart check-in
bun run examples/smart-checkin-personal.ts

# Check service status
launchctl list | grep com.claude

# View logs
log stream --predicate 'process == "bun"' --level debug

# Reset state
rm /tmp/checkin-state.json

# View test checklist
cat docs/SMART_CHECKIN_TEST_CHECKLIST.md

# View full test report
cat docs/SMART_CHECKIN_TEST_REPORT.md
```

---

## Support Resources

**Documentation:**
- `CLAUDE.md` - Setup guide
- `docs/SMART_CHECKIN_TEST_CHECKLIST.md` - Manual tests
- `docs/SMART_CHECKIN_TEST_REPORT.md` - Full analysis

**Test Files:**
- `examples/test-smart-checkin.ts` - Automated test suite
- `examples/test-error-handling.ts` - Error handling tests

**Configuration:**
- `.env` - Environment variables
- `config/checkin-rules.ts` - Notification rules
- `src/embedding-utils.ts` - Semantic search

---

**Last Updated:** 2026-03-20
**Test Suite Version:** 1.0.0

**Happy Testing! 🚀**
