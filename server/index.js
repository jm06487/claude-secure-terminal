#!/usr/bin/env node

/*
 * Claude Secure Terminal – MCP server (v1.0.6)
 * -------------------------------------------
 * 🆕 What's New (v1.0.6):
 * ✅ Command Configuration Management:
 *   - Allow specific commands that are blocked by default
 *   - Block specific commands that are allowed by default  
 *   - View current configuration with visual indicators
 *   - Reset to default configuration
 *   - Export/import configuration settings
 * ✅ Enhanced Security Model:
 *   - Default secure baseline with ability to override
 *   - Configuration persistence between sessions
 *   - User validation for dangerous commands
 *   - Clear audit trail of configuration changes
 * ✅ Previous Features Maintained:
 *   - 30-second timeout protection
 *   - 1000 line output limits
 *   - Directory access controls
 *   - Command history and audit logging
 *   - Support for echo, pipes, jq, and all safe commands
 */

import {
  Server,
} from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  InitializeRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { spawn } from 'child_process';
import { dirname, join, resolve as pathResolve, sep as pathSep } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ---------------------------------------------------
// Config driven by environment variables
// ---------------------------------------------------
const TIMEOUT_MS = (parseInt(process.env.TIMEOUT_SECONDS, 10) || 30) * 1000;
const MAX_LINES = parseInt(process.env.MAX_OUTPUT_LINES, 10) || 1000;
const RAW_ALLOWED_DIRS = (process.env.ALLOWED_DIRECTORIES || `${homedir()}/Documents,${homedir()}/Desktop,${homedir()}/Downloads`).split(',');
const ALLOWED_DIRS = RAW_ALLOWED_DIRS.map(p => pathResolve(p.replace('~', homedir())) + pathSep);

let sdkVer = 'unknown';
try { sdkVer = require('@modelcontextprotocol/sdk/package.json').version; } catch { }

class SecureTerminal {
  // Default secure command lists
  DEFAULT_ALLOWED = ['ls', 'cat', 'grep', 'find', 'wc', 'file', 'stat', 'ps', 'top', 'df', 'du', 'whoami', 'date', 'which', 'uptime', 'echo', 'git', 'npm', 'pip', 'python3', 'node', 'curl', 'wget', 'tar', 'zip', 'unzip', 'jq'];
  DEFAULT_BLOCKED = ['rm', 'sudo', 'su', 'passwd', 'shutdown', 'reboot', 'mkfs', 'fdisk', 'dd', 'chmod', 'chown', 'mount', 'umount', 'kill', 'killall'];

  constructor() {
    this.server = new Server({ name: 'claude-secure-terminal', version: '1.0.6' }, { capabilities: { tools: {} } });
    
    // Initialize configuration
    this.configPath = join(__dirname, 'terminal-config.json');
    this.loadConfig();

    // --- Handshake ---
    this.server.setRequestHandler(InitializeRequestSchema, async () => ({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'claude-secure-terminal', version: '1.0.6' },
      capabilities: { tools: {} },
    }));

    // --- Tool registry ---
    this.registerTools();

    // --- Logging ---
    this.logPath = join(__dirname, 'terminal-extension.log');
    this.auditPath = join(__dirname, 'command-audit.log');
    this.log('INFO', `Booting Secure Terminal (SDK ${sdkVer})`).catch(() => { });

    this.setupShutdown();
  }

  /* ------------------- Configuration Management --------------- */
  async loadConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      this.allowOverrides = config.allowOverrides || [];
      this.blockOverrides = config.blockOverrides || [];
      await this.log('INFO', `Loaded config: +${this.allowOverrides.length} -${this.blockOverrides.length} overrides`);
    } catch {
      // No config file or invalid - use defaults
      this.allowOverrides = [];
      this.blockOverrides = [];
      await this.saveConfig();
      await this.log('INFO', 'Created default configuration');
    }
  }

  async saveConfig() {
    const config = {
      version: '1.0.6',
      allowOverrides: this.allowOverrides,
      blockOverrides: this.blockOverrides,
      lastModified: new Date().toISOString()
    };
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    await this.log('INFO', 'Configuration saved');
  }

  getCurrentAllowed() {
    // Start with defaults, remove blocked overrides, add allowed overrides
    let allowed = [...this.DEFAULT_ALLOWED];
    allowed = allowed.filter(cmd => !this.blockOverrides.includes(cmd));
    this.allowOverrides.forEach(cmd => {
      if (!allowed.includes(cmd)) allowed.push(cmd);
    });
    return allowed;
  }

  getCurrentBlocked() {
    // Start with defaults, remove allowed overrides, add blocked overrides
    let blocked = [...this.DEFAULT_BLOCKED];
    blocked = blocked.filter(cmd => !this.allowOverrides.includes(cmd));
    this.blockOverrides.forEach(cmd => {
      if (!blocked.includes(cmd)) blocked.push(cmd);
    });
    return blocked;
  }

  /* ------------------- Tool meta & handlers ------------------- */
  registerTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Core execution tools
        { 
          name: 'execute_command', 
          description: 'Execute terminal command', 
          inputSchema: { 
            type: 'object', 
            properties: { 
              command: { type: 'string' }, 
              working_directory: { type: 'string' } 
            }, 
            required: ['command'] 
          } 
        },
        { 
          name: 'list_allowed_commands', 
          description: 'List current allow/block lists with override indicators', 
          inputSchema: { type: 'object', properties: {} } 
        },
        { 
          name: 'get_terminal_status', 
          description: 'Return status/config summary', 
          inputSchema: { type: 'object', properties: {} } 
        },
        { 
          name: 'search_command_history', 
          description: 'Search audit log', 
          inputSchema: { 
            type: 'object', 
            properties: { 
              query: { type: 'string' }, 
              limit: { type: 'number' } 
            }, 
            required: ['query'] 
          } 
        },
        
        // Configuration management tools
        { 
          name: 'allow_command', 
          description: 'Allow a specific command (even if blocked by default)', 
          inputSchema: { 
            type: 'object', 
            properties: { 
              command: { type: 'string', description: 'Command to allow (e.g., "rm", "sudo")' } 
            }, 
            required: ['command'] 
          } 
        },
        { 
          name: 'block_command', 
          description: 'Block a specific command (even if allowed by default)', 
          inputSchema: { 
            type: 'object', 
            properties: { 
              command: { type: 'string', description: 'Command to block (e.g., "curl", "wget")' } 
            }, 
            required: ['command'] 
          } 
        },
        { 
          name: 'view_config', 
          description: 'View current command configuration with detailed breakdown', 
          inputSchema: { type: 'object', properties: {} } 
        },
        { 
          name: 'reset_config', 
          description: 'Reset all command overrides to secure defaults', 
          inputSchema: { 
            type: 'object', 
            properties: { 
              confirm: { type: 'boolean', description: 'Must be true to confirm reset' } 
            }, 
            required: ['confirm'] 
          } 
        },
        { 
          name: 'export_config', 
          description: 'Export current configuration as JSON', 
          inputSchema: { type: 'object', properties: {} } 
        },
        { 
          name: 'import_config', 
          description: 'Import configuration from JSON', 
          inputSchema: { 
            type: 'object', 
            properties: { 
              config: { type: 'string', description: 'JSON configuration to import' } 
            }, 
            required: ['config'] 
          } 
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const { name, arguments: args } = params;
      switch (name) {
        // Core tools
        case 'execute_command': return this.execute(args.command, args.working_directory);
        case 'list_allowed_commands': return this.listAllowed();
        case 'get_terminal_status': return this.status();
        case 'search_command_history': return this.history(args.query, args.limit);
        
        // Configuration tools
        case 'allow_command': return this.allowCommand(args.command);
        case 'block_command': return this.blockCommand(args.command);
        case 'view_config': return this.viewConfig();
        case 'reset_config': return this.resetConfig(args.confirm);
        case 'export_config': return this.exportConfig();
        case 'import_config': return this.importConfig(args.config);
        
        default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool ${name}`);
      }
    });
  }

  /* ------------------- Security helpers ----------------------- */
  pathAllowed(tok) {
    if (!tok.startsWith('/')) return true;                // relative path => ok (will resolve under cwd)
    const resolved = pathResolve(tok);
    return ALLOWED_DIRS.some(dir => resolved.startsWith(dir));
  }

  validate(cmd) {
    const parts = cmd.trim().split(/\s+/);
    const base = parts[0];
    
    const currentBlocked = this.getCurrentBlocked();
    const currentAllowed = this.getCurrentAllowed();
    
    if (currentBlocked.includes(base)) return `blocked command ${base}`;
    if (!currentAllowed.includes(base)) return `not allowed ${base}`;
    
    for (const p of parts.slice(1)) {
      if (!this.pathAllowed(p)) return `path ${p} not allowed`;
    }
    return null;
  }

  /* ------------------- Command execution ---------------------- */
  async execute(command, cwd) {
    const err = this.validate(command);
    if (err) return this.wrap({ success: false, error: err });

    const start = Date.now();
    try {
      const res = await this.run(command, cwd);
      await this.audit({ ts: new Date().toISOString(), command, cwd, ms: Date.now() - start, ...res });
      return this.wrap(res);
    } catch (e) {
      await this.audit({ ts: new Date().toISOString(), command, cwd, error: e.message, success: false });
      await this.log('ERROR', e.stack || e.message);
      return this.wrap({ success: false, error: e.message });
    }
  }

  run(cmd, cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, { shell: true, cwd });
      let out = '', err = '';

      child.stdout?.on('data', d => out += d);
      child.stderr?.on('data', d => err += d);

      const killer = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
          resolve({ success: false, exit_code: null, stdout: out, stderr: err, timeout: true });
        }
      }, TIMEOUT_MS);

      child.on('close', code => {
        clearTimeout(killer);
        out = this.truncate(out);
        err = this.truncate(err);
        resolve({ success: code === 0, exit_code: code, stdout: out, stderr: err, timeout: false });
      });

      child.on('error', reject);
    });
  }

  truncate(text) {
    const lines = text.split('\n');
    if (lines.length <= MAX_LINES) return text;
    return lines.slice(0, MAX_LINES).join('\n') + `\n... (truncated ${lines.length - MAX_LINES} lines)`;
  }

  /* ------------------- Configuration Tool Implementations ----- */
  async allowCommand(command) {
    const cmd = command.trim();
    
    // Validation
    if (!cmd) return this.wrap({ success: false, error: 'Command cannot be empty' });
    if (!/^[a-zA-Z0-9_-]+$/.test(cmd)) return this.wrap({ success: false, error: 'Invalid command format' });
    
    // Check if it's a dangerous command
    const dangerous = ['rm', 'sudo', 'dd', 'mkfs', 'fdisk', 'shutdown', 'reboot'];
    let warning = '';
    if (dangerous.includes(cmd)) {
      warning = `⚠️ WARNING: '${cmd}' is potentially dangerous and could cause data loss or system damage.`;
    }
    
    // Remove from block overrides if present
    this.blockOverrides = this.blockOverrides.filter(c => c !== cmd);
    
    // Add to allow overrides if not already default-allowed
    if (!this.DEFAULT_ALLOWED.includes(cmd) && !this.allowOverrides.includes(cmd)) {
      this.allowOverrides.push(cmd);
    }
    
    await this.saveConfig();
    await this.audit({ 
      ts: new Date().toISOString(), 
      action: 'allow_command', 
      command: cmd, 
      success: true 
    });
    
    const result = {
      success: true,
      message: `✅ Command '${cmd}' is now allowed`,
      warning: warning || undefined,
      currentAllowed: this.getCurrentAllowed().length,
      currentBlocked: this.getCurrentBlocked().length
    };
    
    return this.wrap(result);
  }

  async blockCommand(command) {
    const cmd = command.trim();
    
    // Validation
    if (!cmd) return this.wrap({ success: false, error: 'Command cannot be empty' });
    if (!/^[a-zA-Z0-9_-]+$/.test(cmd)) return this.wrap({ success: false, error: 'Invalid command format' });
    
    // Remove from allow overrides if present
    this.allowOverrides = this.allowOverrides.filter(c => c !== cmd);
    
    // Add to block overrides if not already default-blocked
    if (!this.DEFAULT_BLOCKED.includes(cmd) && !this.blockOverrides.includes(cmd)) {
      this.blockOverrides.push(cmd);
    }
    
    await this.saveConfig();
    await this.audit({ 
      ts: new Date().toISOString(), 
      action: 'block_command', 
      command: cmd, 
      success: true 
    });
    
    const result = {
      success: true,
      message: `❌ Command '${cmd}' is now blocked`,
      currentAllowed: this.getCurrentAllowed().length,
      currentBlocked: this.getCurrentBlocked().length
    };
    
    return this.wrap(result);
  }

  async viewConfig() {
    const currentAllowed = this.getCurrentAllowed();
    const currentBlocked = this.getCurrentBlocked();
    
    // Create detailed breakdown
    const allowedWithIndicators = this.DEFAULT_ALLOWED.map(cmd => {
      if (this.blockOverrides.includes(cmd)) return `${cmd} 🚫 (blocked by override)`;
      return cmd + (this.DEFAULT_ALLOWED.includes(cmd) ? '' : ' ✨');
    }).filter(cmd => !cmd.includes('🚫'));
    
    // Add override-allowed commands
    this.allowOverrides.forEach(cmd => {
      if (!this.DEFAULT_ALLOWED.includes(cmd)) {
        allowedWithIndicators.push(`${cmd} ✨ (allowed by override)`);
      }
    });
    
    const blockedWithIndicators = this.DEFAULT_BLOCKED.map(cmd => {
      if (this.allowOverrides.includes(cmd)) return `${cmd} ✅ (allowed by override)`;
      return cmd;
    }).filter(cmd => !cmd.includes('✅'));
    
    // Add override-blocked commands
    this.blockOverrides.forEach(cmd => {
      if (!this.DEFAULT_BLOCKED.includes(cmd)) {
        blockedWithIndicators.push(`${cmd} ✨ (blocked by override)`);
      }
    });

    const config = {
      summary: {
        version: '1.0.6',
        totalAllowed: currentAllowed.length,
        totalBlocked: currentBlocked.length,
        allowOverrides: this.allowOverrides.length,
        blockOverrides: this.blockOverrides.length
      },
      breakdown: {
        currentlyAllowed: allowedWithIndicators.sort(),
        currentlyBlocked: blockedWithIndicators.sort(),
        overrides: {
          allowed: this.allowOverrides,
          blocked: this.blockOverrides
        }
      },
      legend: {
        '✨': 'Modified from defaults',
        '🚫': 'Blocked by override',
        '✅': 'Allowed by override'
      },
      settings: {
        timeout: `${TIMEOUT_MS / 1000} seconds`,
        maxOutputLines: MAX_LINES,
        allowedDirectories: ALLOWED_DIRS.length
      }
    };
    
    return this.wrap(config);
  }

  async resetConfig(confirm) {
    if (!confirm) {
      return this.wrap({
        success: false,
        error: 'Reset requires confirmation. Set confirm: true to proceed.',
        warning: 'This will remove all command overrides and return to secure defaults.'
      });
    }
    
    const oldAllowOverrides = [...this.allowOverrides];
    const oldBlockOverrides = [...this.blockOverrides];
    
    this.allowOverrides = [];
    this.blockOverrides = [];
    
    await this.saveConfig();
    await this.audit({ 
      ts: new Date().toISOString(), 
      action: 'reset_config', 
      oldAllowOverrides, 
      oldBlockOverrides, 
      success: true 
    });
    
    const result = {
      success: true,
      message: '🔄 Configuration reset to secure defaults',
      removed: {
        allowOverrides: oldAllowOverrides,
        blockOverrides: oldBlockOverrides
      },
      currentAllowed: this.getCurrentAllowed().length,
      currentBlocked: this.getCurrentBlocked().length
    };
    
    return this.wrap(result);
  }

  async exportConfig() {
    const config = {
      version: '1.0.6',
      exportedAt: new Date().toISOString(),
      allowOverrides: this.allowOverrides,
      blockOverrides: this.blockOverrides,
      defaults: {
        allowed: this.DEFAULT_ALLOWED,
        blocked: this.DEFAULT_BLOCKED
      }
    };
    
    return this.wrap({
      success: true,
      config: JSON.stringify(config, null, 2),
      message: 'Configuration exported successfully'
    });
  }

  async importConfig(configJson) {
    try {
      const config = JSON.parse(configJson);
      
      // Validate config structure
      if (!config.allowOverrides || !Array.isArray(config.allowOverrides)) {
        throw new Error('Invalid config: allowOverrides must be an array');
      }
      if (!config.blockOverrides || !Array.isArray(config.blockOverrides)) {
        throw new Error('Invalid config: blockOverrides must be an array');
      }
      
      // Validate command formats
      const allOverrides = [...config.allowOverrides, ...config.blockOverrides];
      for (const cmd of allOverrides) {
        if (typeof cmd !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(cmd)) {
          throw new Error(`Invalid command format: ${cmd}`);
        }
      }
      
      const oldConfig = {
        allowOverrides: [...this.allowOverrides],
        blockOverrides: [...this.blockOverrides]
      };
      
      this.allowOverrides = config.allowOverrides;
      this.blockOverrides = config.blockOverrides;
      
      await this.saveConfig();
      await this.audit({ 
        ts: new Date().toISOString(), 
        action: 'import_config', 
        oldConfig, 
        newConfig: { allowOverrides: this.allowOverrides, blockOverrides: this.blockOverrides },
        success: true 
      });
      
      const result = {
        success: true,
        message: '📥 Configuration imported successfully',
        imported: {
          allowOverrides: this.allowOverrides,
          blockOverrides: this.blockOverrides
        },
        currentAllowed: this.getCurrentAllowed().length,
        currentBlocked: this.getCurrentBlocked().length
      };
      
      return this.wrap(result);
      
    } catch (error) {
      return this.wrap({
        success: false,
        error: `Import failed: ${error.message}`,
        hint: 'Make sure the JSON is valid and contains allowOverrides and blockOverrides arrays'
      });
    }
  }

  /* ------------------- Tool impls ----------------------------- */
  wrap(obj) { return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] }; }

  async listAllowed() { 
    return this.wrap({ 
      allowed: this.getCurrentAllowed(), 
      blocked: this.getCurrentBlocked(),
      overrides: {
        allow: this.allowOverrides,
        block: this.blockOverrides
      }
    }); 
  }
  
  async status() { 
    return this.wrap({ 
      version: '1.0.6', 
      sdk: sdkVer, 
      timeout_ms: TIMEOUT_MS, 
      max_lines: MAX_LINES, 
      allowed_dirs: ALLOWED_DIRS,
      commands: {
        allowed: this.getCurrentAllowed().length,
        blocked: this.getCurrentBlocked().length,
        overrides: this.allowOverrides.length + this.blockOverrides.length
      }
    }); 
  }
  
  async history(q, limit = 20) {
    try {
      const data = await fs.readFile(this.auditPath, 'utf8');
      const matches = data.split('\n').filter(l => l.includes(q)).slice(-limit).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      return this.wrap({ query: q, matches });
    } catch {
      return this.wrap({ query: q, matches: [] });
    }
  }

  async audit(rec) {
    await fs.appendFile(this.auditPath, JSON.stringify(rec) + "\n").catch(() => { });
  }
  
  async log(lvl, msg) {
    const line = `[${new Date().toISOString()}] ${lvl}: ${msg}\n`;
    await fs.appendFile(this.logPath, line).catch(() => { });
    if (process.env.DEBUG_PROTOCOL === 'true') console.error(line.trim());
  }

  /* ------------------- Shutdown hooks ------------------------- */
  setupShutdown() {
    const bye = sig => { this.log('INFO', `Shutdown ${sig}`).then(() => process.exit(0)); };
    process.on('SIGINT', () => bye('SIGINT'));
    process.on('SIGTERM', () => bye('SIGTERM'));
    process.on('unhandledRejection', e => this.log('ERROR', 'unhandledRejection ' + (e.stack || e)));
    process.on('uncaughtException', e => { this.log('ERROR', 'uncaught ' + (e.stack || e)); process.exit(1); });
  }
}

/* -------------------- bootstrap ------------------------------- */
(async () => {
  const app = new SecureTerminal();
  const transport = new StdioServerTransport();

  if (process.env.DEBUG_PROTOCOL === 'true') {
    transport.addEventListener?.('data', e => console.error('[DEBUG ⇢]', e.data.toString().trim()));
    const baseWrite = transport.write.bind(transport);
    transport.write = m => { console.error('[DEBUG ⇠]', m.toString().trim()); return baseWrite(m); };
  }

  await app.server.connect(transport);
  setInterval(() => { }, 1 << 30); // keep event loop alive
})();