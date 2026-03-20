# Quick Start: Smart Check-in Scheduler

## Installation (One-Time Setup)

Install the smart check-in scheduler to run every 30 minutes:

```bash
bun run setup:launchd -- --service checkin
```

## Verify It's Running

```bash
launchctl list | grep com.claude.smart-checkin
```

Expected output: `-	0	com.claude.smart-checkin`

## Monitor Logs

```bash
# Watch the check-in logs
tail -f logs/com.claude.smart-checkin.log

# Watch error logs
tail -f logs/com.claude.smart-checkin.error.log
```

## Manual Testing

Run the check-in immediately without waiting for the scheduler:

```bash
bun run examples/smart-checkin-personal.ts
```

## Uninstall

To stop and remove the scheduler:

```bash
bun run setup:launchd -- --unload --service checkin
```

## What Happens

Every 30 minutes, the system:
1. Gathers context from your Supabase memory (goals, tasks, conversations)
2. Asks Claude if it should send you a check-in message
3. If YES: sends a personalized message via Telegram
4. If NO: stays silent (doesn't bother you)

The decision is intelligent - it respects:
- Time of day (no check-ins during sleep hours)
- Your recent activity (waits if you just messaged)
- Daily limits (max 8 check-ins per day)
- Minimum spacing (1 hour between check-ins)

## Configuration

Edit these files to customize behavior:
- `config/checkin-rules.ts` - When to check in
- `config/profile.md` - Your personal info
- `.env` - API keys and settings

For full documentation, see [LAUNCHD_SCHEDULE.md](./LAUNCHD_SCHEDULE.md)
