# Command Configuration Management (v1.0.6)

The Claude Secure Terminal now includes powerful Command Palette-style configuration management that allows you to customize which commands are allowed or blocked beyond the secure defaults.

## Quick Start

### View Current Configuration
```
Use the tool: view_config
```
This shows you all currently allowed/blocked commands with visual indicators showing what's been customized.

### Allow a Blocked Command
```
Use the tool: allow_command
Parameters: { "command": "rm" }
```
This will allow `rm` even though it's blocked by default. You'll get a warning for dangerous commands.

### Block an Allowed Command  
```
Use the tool: block_command
Parameters: { "command": "curl" }
```
This will block `curl` even though it's allowed by default.

### Reset to Defaults
```
Use the tool: reset_config
Parameters: { "confirm": true }
```
This removes all customizations and returns to the secure baseline.

## Configuration System

### Default Security Model
- **Default Allowed**: `ls`, `cat`, `grep`, `find`, `wc`, `file`, `stat`, `ps`, `top`, `df`, `du`, `whoami`, `date`, `which`, `uptime`, `echo`, `git`, `npm`, `pip`, `python3`, `node`, `curl`, `wget`, `tar`, `zip`, `unzip`, `jq`
- **Default Blocked**: `rm`, `sudo`, `su`, `passwd`, `shutdown`, `reboot`, `mkfs`, `fdisk`, `dd`, `chmod`, `chown`, `mount`, `umount`, `kill`, `killall`

### Override System
You can override defaults in two ways:
1. **Allow Override**: Enable a command that's blocked by default
2. **Block Override**: Disable a command that's allowed by default

### Visual Indicators
When viewing configuration:
- `✨` = Modified from defaults
- `🚫` = Blocked by override  
- `✅` = Allowed by override

## Available Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `allow_command` | Allow blocked command | `{"command": "sudo"}` |
| `block_command` | Block allowed command | `{"command": "wget"}` |
| `view_config` | Show detailed config | `{}` |
| `reset_config` | Reset to defaults | `{"confirm": true}` |
| `export_config` | Export as JSON | `{}` |
| `import_config` | Import from JSON | `{"config": "..."}` |

## Security Features

### Dangerous Command Warnings
When allowing potentially dangerous commands like `rm`, `sudo`, `dd`, etc., you'll receive clear warnings about the risks.

### Audit Trail
All configuration changes are logged to the audit file with timestamps, showing:
- What command was allowed/blocked
- When the change was made
- Previous configuration state

### Validation
- Command names must be alphanumeric with hyphens/underscores only
- Invalid JSON imports are rejected
- Configuration persistence between sessions

## Example Workflows

### Developer Setup
```
1. view_config - See current state
2. allow_command {"command": "npm"} - Already allowed by default
3. allow_command {"command": "sudo"} - Enable for package installs (with warning)
4. export_config - Save your setup
```

### Security Lockdown
```
1. block_command {"command": "curl"} - Block network access
2. block_command {"command": "wget"} - Block downloads
3. view_config - Verify restrictions
```

### Team Sharing
```
1. export_config - Get JSON config
2. Share JSON with team
3. Team uses import_config - Everyone has same permissions
```

## Migration from v1.0.5

Your existing configuration will be automatically preserved. The new system:
- Maintains all existing allowed/blocked commands
- Adds the new override system on top
- Provides better visibility and control
- Is fully backward compatible

## Claude Usage Examples

**"I need to use sudo for package management"**
→ Claude will use `allow_command` with `{"command": "sudo"}` and warn about security implications

**"Show me what commands I can run"**  
→ Claude will use `view_config` to display a detailed breakdown

**"Block wget and curl for security"**
→ Claude will use `block_command` for each and confirm the changes

**"Reset everything to defaults"**
→ Claude will use `reset_config` with confirmation

This system gives you the flexibility of a Command Palette interface while maintaining the security-first approach of the terminal extension.
