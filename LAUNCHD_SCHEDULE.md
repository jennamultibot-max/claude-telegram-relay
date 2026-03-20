# Smart Check-in Launchd Scheduling

This document explains how the smart check-in system is scheduled to run automatically every 30 minutes on macOS using launchd.

## Overview

The smart check-in system (`examples/smart-checkin-personal.ts`) is configured to run automatically every 30 minutes using macOS's launchd service management framework. This ensures proactive AI check-ins happen without manual intervention.

## Installation

### Install the Check-in Service

To install the smart check-in scheduler:

```bash
bun run setup:launchd -- --service checkin
```

This will:
1. Generate a launchd plist file with the correct paths
2. Copy it to `~/Library/LaunchAgents/com.claude.smart-checkin.plist`
3. Load the service into launchd
4. Start the 30-minute scheduling

### Verify Installation

Check if the service is loaded:

```bash
launchctl list | grep com.claude.smart-checkin
```

You should see something like:
```
-	0	com.claude.smart-checkin
```

## Configuration

### Generated Plist File

The installer creates `/Users/german/Library/LaunchAgents/com.claude.smart-checkin.plist` with the following configuration:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude.smart-checkin</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/german/.bun/bin/bun</string>
        <string>run</string>
        <string>examples/smart-checkin-personal.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/german/seconbrain/claude-telegram-relay</string>

    <key>StartInterval</key>
    <integer>1800</integer>  <!-- 30 minutes in seconds -->

    <key>StandardOutPath</key>
    <string>/Users/german/seconbrain/claude-telegram-relay/logs/com.claude.smart-checkin.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/german/seconbrain/claude-telegram-relay/logs/com.claude.smart-checkin.error.log</string>
</dict>
</plist>
```

### Key Settings

- **Label**: `com.claude.smart-checkin` - Unique identifier for the service
- **Program**: Uses bun to run `examples/smart-checkin-personal.ts`
- **Working Directory**: Set to project root for proper file access
- **StartInterval**: `1800` seconds (30 minutes) - runs every 30 minutes
- **StandardOutPath**: Logs stdout to `logs/com.claude.smart-checkin.log`
- **StandardErrorPath**: Logs stderr to `logs/com.claude.smart-checkin.error.log`

## Monitoring

### View Logs

Monitor the smart check-in logs:

```bash
# View stdout log
tail -f logs/com.claude.smart-checkin.log

# View stderr log
tail -f logs/com.claude.smart-checkin.error.log

# View both
tail -f logs/com.claude.smart-checkin.*
```

### Check Service Status

See all running Claude services:

```bash
launchctl list | grep com.claude
```

Expected output:
```
453	0	com.claude.telegram-relay
-	0	com.claude.smart-checkin
```

The PID column (first number) shows `-` for scheduled services that are not currently running but will start on schedule.

## Uninstallation

### Uninstall the Check-in Service

To stop and remove the smart check-in scheduler:

```bash
bun run setup:launchd -- --unload --service checkin
```

This will:
1. Unload the service from launchd
2. Remove the plist file from `~/Library/LaunchAgents/`
3. Stop all future scheduled check-ins

### Uninstall All Services

To uninstall all launchd services (relay, checkin, briefing):

```bash
bun run setup:launchd -- --unload --service all
```

## Manual Testing

### Run Check-in Manually

To test the smart check-in without waiting for the scheduler:

```bash
bun run examples/smart-checkin-personal.ts
```

This will execute the check-in immediately and show you the decision-making process.

### Force Service Restart

To restart the scheduler without uninstalling:

```bash
launchctl unload ~/Library/LaunchAgents/com.claude.smart-checkin.plist
launchctl load ~/Library/LaunchAgents/com.claude.smart-checkin.plist
```

## Troubleshooting

### Service Not Running

If the service doesn't appear in `launchctl list`:

1. Check if the plist file exists:
   ```bash
   ls -la ~/Library/LaunchAgents/com.claude.smart-checkin.plist
   ```

2. Try loading it manually:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.claude.smart-checkin.plist
   ```

3. Check for errors in the launchd log:
   ```bash
   log show --predicate 'process == "launchd"' --last 1m | grep smart-checkin
   ```

### Check-in Not Sending Messages

1. Check the error log:
   ```bash
   cat logs/com.claude.smart-checkin.error.log
   ```

2. Check the output log:
   ```bash
   cat logs/com.claude.smart-checkin.log
   ```

3. Verify environment variables are set in `.env`:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_USER_ID`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

4. Run manually to see detailed output:
   ```bash
   bun run examples/smart-checkin-personal.ts
   ```

### Changing the Schedule Interval

To change from 30 minutes to a different interval:

1. Edit `/Users/german/seconbrain/claude-telegram-relay/setup/configure-launchd.ts`
2. Find the `checkin` service configuration
3. Change `startInterval: 1800` to your desired interval in seconds
4. Reinstall the service:
   ```bash
   bun run setup:launchd -- --unload --service checkin
   bun run setup:launchd -- --service checkin
   ```

Common intervals:
- 15 minutes: `900`
- 30 minutes: `1800` (default)
- 1 hour: `3600`
- 2 hours: `7200`

## How It Works

### The Scheduling Flow

1. **launchd loads the plist** - Reads the configuration when the service is installed
2. **Every 30 minutes** - launchd spawns a new process running the check-in script
3. **Script executes** - Runs `examples/smart-checkin-personal.ts`
4. **Claude decides** - Analyzes context and decides whether to send a message
5. **Message sent or skipped** - If yes, sends Telegram message; if no, stays silent
6. **Process exits** - The script completes and waits for the next 30-minute interval

### Smart Decision Making

The check-in doesn't just blindly send messages every 30 minutes. Instead:

1. **Gathers context** from:
   - Supabase memory (goals, tasks)
   - Semantic search for relevant past conversations
   - Time of day and day of week
   - Recent message history

2. **Applies rules** from `config/checkin-rules.ts`:
   - Maximum check-ins per day (default: 8)
   - Quiet hours (no check-ins during sleep time)
   - Minimum time between check-ins (default: 1 hour)
   - Respects recent user activity

3. **Asks Claude** to decide:
   - Should I send a check-in now? (YES/NO)
   - What should I say? (personalized message)
   - Why this decision? (reasoning for logs)

4. **Acts accordingly**:
   - If YES: sends message via Telegram
   - If NO: logs the reasoning and waits for next interval

## Integration with Other Services

The smart check-in is one of three launchd services:

### 1. Telegram Relay (Always Running)
```bash
bun run setup:launchd -- --service relay
```
- Runs continuously
- Restarts automatically if it crashes
- Handles incoming Telegram messages

### 2. Smart Check-in (Every 30 Minutes)
```bash
bun run setup:launchd -- --service checkin
```
- Runs every 30 minutes
- Proactive AI check-ins
- This service

### 3. Morning Briefing (Daily at 9am)
```bash
bun run setup:launchd -- --service briefing
```
- Runs once per day at 9:00 AM
- Sends daily summary
- Optional feature

### Install All Services
```bash
bun run setup:launchd -- --service all
```

## Technical Details

### File Locations

- **Plist template**: `setup/configure-launchd.ts`
- **Installed plist**: `~/Library/LaunchAgents/com.claude.smart-checkin.plist`
- **Check-in script**: `examples/smart-checkin-personal.ts`
- **Configuration**: `config/checkin-rules.ts`
- **State file**: `/tmp/checkin-state.json`
- **Output log**: `logs/com.claude.smart-checkin.log`
- **Error log**: `logs/com.claude.smart-checkin.error.log`

### Environment Variables

The service inherits environment variables from the shell. Ensure these are set in your `.env` file:

- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `TELEGRAM_USER_ID` - Your Telegram user ID
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon key
- `CLAUDE_PATH` - Path to Claude CLI (default: "claude")
- `CHECKIN_STATE_FILE` - Path to state file (default: "/tmp/checkin-state.json")

### Security Notes

- The plist file is stored in `~/Library/LaunchAgents/` (user-level, not system-wide)
- Environment variables are set from your shell environment
- No sudo privileges required
- Logs are stored in the project directory

## Next Steps

After installing the scheduler:

1. **Monitor the first run**: Check logs after 30 minutes to see the first check-in
2. **Adjust rules**: Edit `config/checkin-rules.ts` to customize behavior
3. **Add goals**: Store goals in Supabase for more relevant check-ins
4. **Personalize profile**: Update `config/profile.md` for better context

## Support

If you encounter issues:

1. Check the logs first (see Monitoring section above)
2. Run the script manually to see detailed output
3. Verify all environment variables are set correctly
4. Check that Supabase connection is working: `bun run test:supabase`
5. Check that Telegram is working: `bun run test:telegram`

For more information, see the main project README or the setup guide.
