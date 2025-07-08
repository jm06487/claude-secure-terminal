# Claude Terminal Extension - Changelog

All notable changes to this project will be documented in this file.

## [1.0.5] - 2025-07-08

### 🆕 What's New
- Version upgraded from 1.0.4 → 1.0.5
- 30-second timeout configured (timeout_ms: 30000)
- 1000 line output limit (max_lines: 1000)
- Configurable allowed directories
- `echo` now included in allowed commands
- Pipe operations and command chaining now supported
- Improved path restrictions and directory access controls
- `jq` support for JSON processing
- Proper timeout management in responses
- Command history tracking and searching
- Key functional tests passed (echo, pipes, jq, df, top, command history)
- Maintains allow/block lists, path access restrictions, directory traversal protection, timeout protection
- Fast execution, clean error handling, efficient command history

## [1.0.4] - 2025-07-07 - Initial Public Release

### 🎉 **First Public Release**

This is the initial public release of the Claude Secure Terminal DXT extension. All previous versions were internal development iterations.

### ✨ **Features**

#### **Secure Command Execution**
- **Command Whitelist**: Only pre-approved commands can be executed
- **Directory Restrictions**: Commands limited to user-specified directories
- **Timeout Protection**: Commands auto-terminate if they exceed time limits
- **Output Limiting**: Prevents system flooding with large outputs
- **Audit Logging**: Complete history of all command executions

#### **Security Controls**
- **Comprehensive Security**: Enterprise-grade security controls and audit logging
- **Command Filtering**: Advanced whitelist/blacklist filtering system
- **Directory Sandboxing**: Restricts command execution to allowed directories
- **Execution Monitoring**: Real-time monitoring with automatic threat detection
- **Audit Compliance**: Comprehensive logging for security audits

#### **Development Support**
- **Git Integration**: Repository management and status checking
- **Container Support**: Docker/Podman monitoring and management
- **Process Monitoring**: System resource and process monitoring
- **Network Tools**: Connectivity testing and network diagnostics
- **File Operations**: Safe file system operations within allowed directories

#### **User Experience**
- **Easy Configuration**: Intuitive setup through Claude Desktop settings
- **Cross-Platform**: Full support for macOS, Windows, and Linux
- **Error Handling**: Graceful error handling with helpful messages
- **Performance**: Optimized for fast command execution and response

#### **Technical Excellence**
- **DXT v0.1 Compliance**: Follows Desktop Extension specification exactly
- **MCP Protocol**: Proper Model Context Protocol implementation
- **Build System**: Unified build process with comprehensive validation
- **Professional Structure**: Clean, maintainable codebase

### 🛠️ **Available Tools**

1. **`execute_command`** - Execute terminal commands safely with security restrictions
2. **`list_allowed_commands`** - Display all currently allowed and blocked commands
3. **`get_terminal_status`** - Show extension configuration and security status
4. **`search_command_history`** - Search through command execution logs

### 📋 **Available Prompts**

1. **`system_analysis`** - Analyze system status and provide insights
2. **`debug_environment`** - Debug development environment issues
3. **`security_audit`** - Perform security audit of command history

### ⚙️ **Configuration Options**

- **Allowed Directories**: Configurable command execution directories
- **Command Timeout**: Adjustable execution timeout (5-300 seconds)
- **Output Limits**: Configurable output line limits (100-10,000 lines)
- **Audit Logging**: Enable/disable comprehensive command logging
- **Custom Commands**: Add additional commands beyond the default safe list

### 🔒 **Security Features**

#### **Default Allowed Commands**
- **File Operations**: `ls`, `cat`, `head`, `tail`, `grep`, `find`, `wc`, `file`, `stat`
- **System Info**: `ps`, `top`, `df`, `du`, `whoami`, `date`, `which`, `uptime`
- **Development**: `git`, `npm`, `pip`, `python3`, `node`, `make`, `cmake`
- **Network**: `curl`, `wget`, `ping`, `netstat`, `lsof`
- **Containers**: `podman`, `docker`, `podman-compose`, `docker-compose`
- **Archives**: `tar`, `gzip`, `gunzip`, `zip`, `unzip`
- **Text Processing**: `awk`, `sed`, `sort`, `uniq`, `cut`, `jq`

#### **Always Blocked Commands**
- **Destructive**: `rm`, `del`, `deltree`, `sudo`, `su`
- **System Control**: `shutdown`, `reboot`, `halt`, `poweroff`
- **Process Control**: `kill`, `killall`, `pkill`
- **Disk Operations**: `mkfs`, `fdisk`, `dd`, `format`

#### **Dangerous Flag Detection**
- Automatically blocks flags: `--force`, `-f`, `--delete`, `--remove`, `--destroy`

### 🏗️ **Build & Installation**

- **Unified Build**: Single `./build.sh` command handles everything
- **DXT Packaging**: Compatible with `dxt pack` for distribution
- **Cross-Platform**: Builds correctly on macOS, Windows, and Linux
- **Dependency Management**: Automatic server dependency installation
- **Validation**: Comprehensive build validation and testing

### 🎯 **Target Use Cases**

- **Development Workflows**: Git management, dependency installation, process monitoring
- **System Administration**: System status checking, log analysis, resource monitoring
- **Debugging**: Environment diagnosis, error investigation, performance analysis
- **Container Management**: Docker/Podman status, container operations
- **Security Auditing**: Command history analysis, security compliance checking

### 📊 **Technical Specifications**

- **DXT Version**: 0.1 (fully compliant)
- **MCP SDK**: @modelcontextprotocol/sdk ^0.6.0
- **Node.js**: Requires >= 16.0.0
- **Platforms**: macOS, Windows, Linux
- **Claude Desktop**: Requires >= 1.0.0

---

This changelog will be updated with each future release to document new features, bug fixes, and improvements.
