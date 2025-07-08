# Claude Secure Terminal

A secure terminal interface for Claude Desktop with comprehensive security controls, audit logging, and configurable permissions.

## 🚀 Quick Start

```bash
# Build the extension
./build.sh

# Install to Claude Desktop
# Copy the build/ directory to your Claude extensions folder and restart Claude
```

## 🔒 What This Extension Does

Claude Secure Terminal allows Claude to execute terminal commands safely with:

- **Security First**: Only whitelisted commands can run
- **Directory Controls**: Commands restricted to allowed directories
- **Audit Logging**: Complete history of all command executions
- **Timeout Protection**: Commands auto-terminate if they run too long
- **Output Limiting**: Prevents system flooding with large outputs

## 📦 Installation

**Important**: Dependencies are installed only during build, not stored in the repository.

### Quick Install
1. Run `./build.sh` to build the extension (this installs dependencies)
2. Copy the `build/` directory to your Claude Desktop extensions folder:
   - **macOS**: `~/Library/Application Support/Claude/extensions/`
   - **Windows**: `%APPDATA%/Claude/extensions/`
   - **Linux**: `~/.config/Claude/extensions/`
3. Restart Claude Desktop
4. The extension will be automatically loaded

### Build Process
The build script follows DXT v0.1 specifications:
- Dependencies are installed in `server/node_modules` during build only
- No dependencies are stored in the source repository
- Build output contains everything needed for installation

### Build Options
```bash
./build.sh          # Standard build
./build.sh --clean  # Clean build directory
./build.sh --help   # Show help
```

## 🛡️ Security Features

### Allowed Commands (Default)
- **File Operations**: `ls`, `cat`, `head`, `tail`, `grep`, `find`
- **System Info**: `ps`, `df`, `du`, `whoami`, `date`, `uptime`
- **Development**: `git`, `npm`, `pip`, `python3`, `node`
- **Network**: `curl`, `wget`, `ping`
- **Containers**: `docker`, `podman`
- **Text Processing**: `awk`, `sed`, `sort`, `jq`

### Always Blocked
- **Destructive**: `rm`, `del`, `sudo`, `shutdown`
- **Process Control**: `kill`, `killall`, `pkill`
- **System Modification**: `mkfs`, `fdisk`, `format`

## 🎯 Example Usage

Ask Claude to:
- `Check the status of my git repository`
- `Show me what processes are using the most CPU`
- `List the files in my project directory`
- `Check if my containers are running`
- `Test connectivity to github.com`

## ⚙️ Configuration

The extension automatically prompts for configuration on first use:

- **Allowed Directories**: Where commands can be executed
- **Timeout**: Maximum execution time (5-300 seconds)  
- **Output Limit**: Maximum output lines (100-10,000)
- **Audit Logging**: Enable/disable command logging
- **Custom Commands**: Additional commands beyond defaults

## 📋 Requirements

- **Claude Desktop**: 1.0.0 or later
- **Node.js**: 16.0.0 or later (for building)
- **Operating System**: macOS, Windows, or Linux

## 🐛 Troubleshooting

### Extension Not Loading
1. Ensure Claude Desktop extensions are enabled
2. Check the extension is in the correct folder
3. Restart Claude Desktop completely

### Commands Being Blocked
1. Check allowed commands with: "List allowed commands"
2. Add custom commands in extension configuration
3. Review audit logs for security violations

### Need Help?
- Check `docs/` folder for detailed documentation
- Use `./build.sh --help` for build options
- See `deprecated/` folder for legacy scripts (safe to delete)

## 📚 Documentation

- **[Development Guide](docs/PROJECT_RULES.md)** - Development guidelines and rules
- **[Installation Troubleshooting](docs/INSTALLATION_FIX.md)** - Fix common installation issues
- **[Version History](docs/CHANGELOG.md)** - Complete change log

## 🤝 Contributing

This extension is open source. To contribute:
1. Follow the development guidelines in `docs/PROJECT_RULES.md`
2. Use the build tools in `tools/` for development
3. Test thoroughly with `./build.sh`
4. Submit pull requests with clear descriptions

## 📄 License

MIT License - see LICENSE file for details.

---

**⚠️ Security Notice**: This extension provides Claude with controlled terminal access. Always review allowed commands and monitor audit logs for security.
