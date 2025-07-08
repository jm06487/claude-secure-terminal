#!/usr/bin/env node

/*
 * Claude Secure Terminal – MCP server entry-point (v1.0.5)
 * -------------------------------------------------------
 * Fixes & Enhancements per test matrix:
 *   • echo added to allow-list (done in v1.0.4-patch1)
 *   • Directory-escape detection (`ls /` now blocked)
 *   • Timeout enforcement (default 30 s via ENV TIMEOUT_SECONDS)
 *   • Output truncation (default 1000 lines via ENV MAX_OUTPUT_LINES)
 *   • Basic audit logging; search_command_history returns real matches
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

/* ------------------------------------------------------------------
 *  Config from ENV or defaults
 * ----------------------------------------------------------------*/
const TIMEOUT_MS = (parseInt(process.env.TIMEOUT_SECONDS, 10) || 30) * 1000;
const MAX_OUTPUT_LINES = parseInt(process.env.MAX_OUTPUT_LINES, 10) || 1000;
const ALLOWED_DIRS_RAW = (process.env.ALLOWED_DIRECTORIES || `${homedir()}/Documents,${homedir()}/Desktop,${homedir()}/Downloads`).split(',');
const ALLOWED_DIRS = ALLOWED_DIRS_RAW.map(d => pathResolve(d.replace('~', homedir())) + pathSep);

let mcpSdkVersion = 'unknown';
try { mcpSdkVersion = require('@modelcontextprotocol/sdk/package.json').version; } catch { }

class SecureTerminalServer {
  constructor() {
    /* ---- 1) Create server & handle MCP initialize ---- */
    this.server = new Server({ name: 'claude-secure-terminal', version: '1.0.5' }, { capabilities: { tools: {} } });
    this.server.setRequestHandler(InitializeRequestSchema, async () => ({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'claude-secure-terminal', version: '1.0.5' },
      capabilities: { tools: { execute_command: {}, list_allowed_commands: {}, get_terminal_status: {}, search_command_history: {} } },
    }));

    /* ---- 2) Register tools ---- */
    this.registerTools();

    /* ---- 3) Logging & shutdown ---- */
    this.logFile = join(__dirname, 'terminal-extension.log');
    this.auditFile = join(__dirname, 'command-audit.log');
    this.log('INFO', `Boot MCP SDK ${mcpSdkVersion}`).catch(() => { });
    this.setupShutdown();
  }

  registerTools() {
    /* List tools meta */
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        { name: 'execute_command', description: 'Execute a terminal command safely', inputSchema: { type: 'object', properties: { command: { type: 'string' }, working_directory: { type: 'string' } }, required: ['command'] } },
        { name: 'list_allowed_commands', description: 'List allowed & blocked commands', inputSchema: { type: 'object', properties: {} } },
        { name: 'get_terminal_status', description: 'Get extension status/config', inputSchema: { type: 'object', properties: {} } },
        { name: 'search_command_history', description: 'Search audit log', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
      ],
    }));

    /* Tool call dispatcher */
    this.server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const { name, arguments: args } = params;
      switch (name) {
        case 'execute_command': return this.executeCommand(args.command, args.working_directory);
        case 'list_allowed_commands': return this.listAllowedCommands();
        case 'get_terminal_status': return this.getTerminalStatus();
        case 'search_command_history': return this.searchHistory(args.query, args.limit);
        default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });
  }

  /* ------------------------------------------------------------------
   *  Security lists
   * ----------------------------------------------------------------*/
  allowed = ['ls', 'cat', 'grep', 'find', 'wc', 'file', 'stat', 'ps', 'top', 'df', 'du', 'whoami', 'date', 'which', 'uptime', 'echo', 'git', 'npm', 'pip', 'python3', 'node', 'curl', 'wget', 'tar', 'zip', 'unzip', 'jq'];
  blocked = ['rm', 'sudo', 'su', 'passwd', 'shutdown', 'reboot', 'mkfs', 'fdisk', 'dd'];

  validateCommand(cmd) {
    const parts = cmd.trim().split(/\s+/);
    const base = parts[0];
    if (this.blocked.includes(base)) return { ok: false, reason: `blocked command ${base}` };
    if (!this.allowed.includes(base)) return { ok: false, reason: `not allowed ${base}` };

    // Directory-escape detection: reject absolute paths outside allowed dirs
    for (const tok of parts.slice(1)) {
      if (tok.startsWith('/')) {
        const resolved = pathResolve(tok);
        if (!ALLOWED_DIRS.some(dir => resolved.startsWith(dir))) {
          return { ok: false, reason: `path ${tok} not in allowed directories` };
        }
      }
    }
    return { ok: true };
  }

  async executeCommand(cmd, cwd) {
    const validation = this.validateCommand(cmd);
    if (!validation.ok) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: validation.reason }) }] };
    }
    const start = Date.now();
    try {
      const result = await this.runShell(cmd, cwd);
      await this.appendAudit({ timestamp: new Date().toISOString(), cmd, cwd, success: result.success, ms: Date.now() - start });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      await this.appendAudit({ timestamp: new Date().toISOString(), cmd, cwd, success: false, error: err.message });
      await this.log('ERROR', err.stack || err.message);
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }] };
    }
  }

  runShell(cmd, cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, { shell: true, cwd, timeout: TIMEOUT_MS });
      let out = '', err = '';
      child.stdout?.on('data', d => out += d);
      child.stderr?.on('data', d => err += d);

      child.on('close', code => {
        // Output truncation
        const linesOut = out.split('\n');
        if (linesOut.length > MAX_OUTPUT_LINES) {
          out = linesOut.slice(0, MAX_OUTPUT_LINES).join('\n') + `\n... (truncated ${linesOut.length - MAX_OUTPUT_LINES} lines)`;
        }
        const linesErr = err.split('\n');
        if (linesErr.length > MAX_OUTPUT_LINES) {
          err = linesErr.slice(0, MAX_OUTPUT_LINES).join('\n') + `\n... (truncated ${linesErr.length - MAX_OUTPUT_LINES} lines)`;
        }
        resolve({ success: code === 0, exit_code: code, stdout: out, stderr: err, timeout: false });
      });

      child.on('error', reject);
      child.on('spawn', () => {
        // handle timeout manually (Node ≤18 doesn’t auto-kill on timeout option)
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGTERM');
            resolve({ success: false, exit_code: null, stdout: out, stderr: err, timeout: true });
          }
        }, TIMEOUT_MS + 1000);
      });
    });
  }

  /* ------------------------------------------------------------------
   *  Tools – misc
   * ----------------------------------------------------------------*/
  async listAllowedCommands() {
    return { content: [{ type: 'text', text: JSON.stringify({ allowed: this.allowed, blocked: this.blocked }) }] };
  }
  async getTerminalStatus() {
    return { content: [{ type: 'text', text: JSON.stringify({ version: '1.0.5', sdk: mcpSdkVersion, timeout_ms: TIMEOUT_MS, max_output_lines: MAX_OUTPUT_LINES, allowed_dirs: ALLOWED_DIRS }) }] };
  }
  async searchHistory(query, limit = 20) {
    try {
      const data = await fs.readFile(this.auditFile, 'utf8');
      const matches = data.split('\n').filter(l => l.includes(query)).slice(-limit).map(JSON.parse);
      return { content: [{ type: 'text', text: JSON.stringify({ query, matches }) }] };
    } catch {
      return { content: [{ type: 'text', text: JSON.stringify({ query, matches: [] }) }] };
    }
  }

  /* ------------------------------------------------------------------
   *  Audit & logging helpers
   * ----------------------------------------------------------------*/
  async appendAudit(rec) {
    await fs.appendFile(this.auditFile, JSON.stringify(rec) + "\n").catch(() => { });
  }
  async log(lvl, msg) {
    const line = `[${new Date().toISOString()}] ${lvl}: ${msg}\n`;
    await fs.appendFile(this.logFile, line).catch(() => { });
    if (process.env.DEBUG_PROTOCOL === 'true') console.error(line.trim());
  }

  /* ------------------------------------------------------------------*/
  setupShutdown() {
    const stop = sig => { this.log('INFO', `Shutdown ${sig}`).then(() => process.exit(0)); };
    process.on('SIGINT', () => stop('SIGINT'));
    process.on('SIGTERM', () => stop('SIGTERM'));
    process.on('unhandledRejection', e => this.log('ERROR', 'unhandledRejection ' + (e.stack || e)));
    process.on('uncaughtException', e => { this.log('ERROR', 'uncaught ' + (