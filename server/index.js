#!/usr/bin/env node

/*
 * Claude Secure Terminal – MCP server entry-point
 * ------------------------------------------------
 * – Responds to MCP `initialize` immediately (fixes handshake timeout)
 * – Registers tool handlers: execute_command, list_allowed_commands, etc.
 * – Adds verbose error + unhandled-rejection logging
 * – Keeps process alive with a dummy timer; exits cleanly on SIGINT/SIGTERM
 *
 * 2025-07-08:  Fully rewritten to guarantee handshake, per runtime logs.
 */

import {
  Server,
} from '@modelcontextprotocol/sdk/server/index.js';
import {
  StdioServerTransport,
} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  InitializeRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
//  Helper: best-effort SDK version
// ---------------------------------------------------------------------------
let mcpSdkVersion = 'unknown';
try {
  const sdkPkg = require('@modelcontextprotocol/sdk/package.json');
  mcpSdkVersion = sdkPkg.version;
} catch {/* ignore */ }

// ---------------------------------------------------------------------------
//  SecureTerminalServer class
// ---------------------------------------------------------------------------
class SecureTerminalServer {
  constructor() {
    /* -------------------------------------------------------------
     * 1)  Construct Server instance (no auto-initialize handler)
     * -----------------------------------------------------------*/
    this.server = new Server(
      { name: 'claude-secure-terminal', version: '1.0.4' },
      { capabilities: { tools: {} } },
    );

    /* -------------------------------------------------------------
     * 2)   Wire low-level initialize handler  (Fix #HANDSHAKE)
     * -----------------------------------------------------------*/
    this.server.setRequestHandler(InitializeRequestSchema, async (params) => {
      // Always respond immediately – no blocking work here
      return {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'claude-secure-terminal',
          version: '1.0.4',
        },
        capabilities: {
          tools: {
            execute_command: {},
            list_allowed_commands: {},
            get_terminal_status: {},
            search_command_history: {},
          },
        },
      };
    });

    /* -------------------------------------------------------------
     * 3)   Register tool meta & handlers
     * -----------------------------------------------------------*/
    this.registerTools();

    /* -------------------------------------------------------------
     * 4)   Runtime logging & shutdown hooks
     * -----------------------------------------------------------*/
    this.logFile = join(__dirname, 'terminal-extension.log');
    this.log('INFO', `MCP SDK ${mcpSdkVersion} booting…`).catch(() => { });
    this.setupGracefulShutdown();
  }

  /* ---------------------------------------------------------------------
   *  Tool definitions & handlers
   * ------------------------------------------------------------------ */
  registerTools() {
    /* ---- listTools handler (advertise the four tools) ---- */
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'execute_command',
          description: 'Execute a terminal command safely',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'The command to run' },
              working_directory: { type: 'string', description: 'Optional working dir' },
            },
            required: ['command'],
          },
        },
        { name: 'list_allowed_commands', description: 'Show allow-/block-lists', inputSchema: { type: 'object', properties: {} } },
        { name: 'get_terminal_status', description: 'Return status/config', inputSchema: { type: 'object', properties: {} } },
        { name: 'search_command_history', description: 'Search audit log', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
      ],
    }));

    /* ---- actual tool calls ---- */
    this.server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const { name, arguments: args } = params;
      switch (name) {
        case 'execute_command': return this.executeCommand(args.command, args.working_directory);
        case 'list_allowed_commands': return this.listAllowedCommands();
        case 'get_terminal_status': return this.getTerminalStatus();
        case 'search_command_history': return this.searchCommandHistory(args.query, args.limit);
        default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });
  }

  /* ---------------------------------------------------------------------
   *  Command execution + helpers (identical to previous release)
   * ------------------------------------------------------------------ */
  allowed = ['ls', 'cat', 'grep', 'find', 'wc', 'file', 'stat', 'ps', 'top', 'df', 'du', 'whoami', 'date', 'which', 'uptime',
    'git', 'npm', 'pip', 'python3', 'node', 'curl', 'wget', 'tar', 'zip', 'unzip', 'jq'];
  blocked = ['rm', 'sudo', 'su', 'passwd', 'shutdown', 'reboot', 'mkfs', 'fdisk', 'dd'];

  validateCommand(cmd) {
    const [base] = cmd.trim().split(/\s+/);
    if (this.blocked.includes(base)) return { ok: false, reason: `blocked ${base}` };
    if (!this.allowed.includes(base)) return { ok: false, reason: `not allowed ${base}` };
    return { ok: true };
  }

  async executeCommand(cmd, cwd) {
    const check = this.validateCommand(cmd);
    if (!check.ok) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: check.reason }) }] };
    }
    try {
      const result = await this.runShell(cmd, cwd);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      await this.log('ERROR', err.stack || err.message);
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }] };
    }
  }

  runShell(cmd, cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, { shell: true, cwd });
      let out = '', err = '';
      child.stdout?.on('data', d => out += d);
      child.stderr?.on('data', d => err += d);
      child.on('close', code => {
        resolve({ success: code === 0, exit_code: code, stdout: out, stderr: err });
      });
      child.on('error', reject);
    });
  }

  async listAllowedCommands() {
    return { content: [{ type: 'text', text: JSON.stringify({ allowed: this.allowed, blocked: this.blocked }) }] };
  }
  async getTerminalStatus() {
    return { content: [{ type: 'text', text: JSON.stringify({ name: 'claude-secure-terminal', version: '1.0.4', sdk: mcpSdkVersion }) }] };
  }
  async searchCommandHistory(q, limit = 10) {
    // simplistic demo – real impl would parse a log file
    return { content: [{ type: 'text', text: JSON.stringify({ query: q, matches: [] }) }] };
  }

  /* ---------------------------------------------------------------------
   *  Logging utilities & shutdown
   * ------------------------------------------------------------------ */
  async log(lvl, msg) {
    const line = `[${new Date().toISOString()}] ${lvl}: ${msg}\n`;
    await fs.appendFile(this.logFile, line).catch(() => { });
    if (process.env.DEBUG_PROTOCOL === 'true') console.error(line.trim());
  }

  setupGracefulShutdown() {
    const stop = async sig => {
      await this.log('INFO', `Shutdown on ${sig}`);
      process.exit(0);
    };
    process.on('SIGINT', () => stop('SIGINT'));
    process.on('SIGTERM', () => stop('SIGTERM'));
    process.on('unhandledRejection', err => this.log('ERROR', `UnhandledRejection: ${err.stack || err}`));
    process.on('uncaughtException', err => { this.log('ERROR', `UncaughtException: ${err.stack || err}`); process.exit(1); });
  }
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------
(async () => {
  const srv = new SecureTerminalServer();
  const transport = new StdioServerTransport();

  if (process.env.DEBUG_PROTOCOL === 'true') {
    transport.addEventListener?.('data', e => console.error('[DEBUG] ⇢', e.data.toString().trim()));
    const origWrite = transport.write.bind(transport);
    transport.write = msg => { console.error('[DEBUG] ⇠', msg.toString().trim()); return origWrite(msg); };
  }

  await srv.server.connect(transport);
  // keep event-loop alive
  setInterval(() => { }, 1 << 30);
})();