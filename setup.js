const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { AGY_BIN, LOGS_DIR } = require('./dispatcher');
const { DATA_DIR } = require('./config');
const { resolveBin } = require('./providers');
const { listAccounts } = require('./accounts');

const MCP_NAME = 'a2a-panel';
const LEGACY_MCP_NAMES = ['agy-bridge', 'a2a-antigravity'];
const CLI_PATH = path.join(__dirname, 'cli.js');

function tryRun(file, args, timeout = 20000) {
  try {
    const output = execFileSync(file, args, { encoding: 'utf-8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output: output.trim() };
  } catch (err) {
    return { ok: false, output: String((err.stdout || '') + (err.stderr || '') || err.message).trim() };
  }
}

function claudeMcpList() {
  const result = tryRun('claude', ['mcp', 'list'], 60000);
  return result.ok ? result.output : null;
}

function isRegistered(listing, name = MCP_NAME) {
  return Boolean(listing) && listing.split('\n').some((line) => line.startsWith(`${name}:`));
}

function legacyRegistrations(listing) {
  return LEGACY_MCP_NAMES.filter((name) => isRegistered(listing, name));
}

function runDoctor() {
  const checks = [];
  const add = (level, label, detail) => checks.push({ level, label, detail });

  const major = parseInt(process.versions.node.split('.')[0], 10);
  add(major >= 18 ? 'ok' : 'fail', 'Node.js', major >= 18 ? `v${process.versions.node}` : `v${process.versions.node} (need 18 or newer)`);

  const version = tryRun(AGY_BIN, ['--version']);
  if (version.ok) {
    add('ok', 'Antigravity CLI (agy)', `${AGY_BIN} ${version.output.split('\n')[0]}`);
    const models = tryRun(AGY_BIN, ['models'], 30000);
    const modelLines = models.output.split('\n').filter((line) => line.includes('\t'));
    if (models.ok && modelLines.length) {
      add('ok', 'Antigravity sign-in', `${modelLines.length} model(s) available`);
    } else {
      add('fail', 'Antigravity sign-in', 'agy could not list models. Run "agy" once and sign in, then retry.');
    }
  } else {
    add('fail', 'Antigravity CLI (agy)', `not found or not runnable at "${AGY_BIN}". Install it, put it on PATH, or set AGY_BIN.`);
  }

  const git = tryRun('git', ['--version']);
  add(git.ok ? 'ok' : 'warn', 'git', git.ok ? git.output : 'not found. Task results will not include a workspace change summary.');

  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.accessSync(LOGS_DIR, fs.constants.W_OK);
    add('ok', 'Data directory', DATA_DIR);
  } catch (err) {
    add('fail', 'Data directory', `${LOGS_DIR} is not writable (${err.message}). Set A2A_HOME to a writable folder.`);
  }

  const panelBuilt = fs.existsSync(path.join(__dirname, 'panel', 'dist', 'index.html'));
  add(panelBuilt ? 'ok' : 'warn', 'Web panel', panelBuilt ? 'built' : 'not built. Run "npm run build:panel" to enable the dashboard.');

  const claudeBin = resolveBin('claude');
  const claude = tryRun(claudeBin, ['--version']);
  if (claude.ok) {
    add('ok', 'Claude Code CLI (claude)', `${claudeBin} ${claude.output.split('\n')[0]}`);
    const listing = claudeMcpList();
    const legacy = legacyRegistrations(listing);
    if (isRegistered(listing)) {
      add(legacy.length ? 'warn' : 'ok', 'Claude Code MCP server', legacy.length ? `registered, plus old name(s) ${legacy.join(', ')}. Run "a2a-panel init" to remove them.` : 'registered');
    } else {
      add('warn', 'Claude Code MCP server', legacy.length ? `registered under the old name ${legacy.join(', ')}. Run "a2a-panel init" to rename it.` : 'not registered. Run "a2a-panel init".');
    }
  } else {
    add('warn', 'Claude Code CLI (claude)', 'not found or not runnable (optional, needed only for Claude Code accounts)');
  }

  const codexBin = resolveBin('codex');
  const codex = tryRun(codexBin, ['--version']);
  if (codex.ok) {
    add('ok', 'Codex CLI (codex)', `${codexBin} ${codex.output.split('\n')[0]}`);
  } else {
    add('warn', 'Codex CLI (codex)', 'not found or not runnable (optional, needed only for Codex accounts)');
  }

  const accs = listAccounts();
  add('ok', 'Accounts', `${accs.length} account(s) configured (${accs.filter((a) => !a.system).length} custom)`);

  return checks;
}

function printDoctor(checks) {
  const marks = { ok: '\x1b[32m✓\x1b[0m', warn: '\x1b[33m!\x1b[0m', fail: '\x1b[31m✗\x1b[0m' };
  console.log('\na2a-panel doctor\n');
  for (const check of checks) {
    console.log(`  ${marks[check.level]} ${check.label.padEnd(26)} ${check.detail}`);
  }
  const failed = checks.filter((check) => check.level === 'fail').length;
  console.log(failed ? `\n${failed} required check(s) failed.\n` : '\nAll required checks passed.\n');
  return failed === 0;
}

function registerCommand() {
  return ['claude', 'mcp', 'add', '--scope', 'user', MCP_NAME, '--', process.execPath, CLI_PATH, 'mcp'];
}

function runInit({ dryRun = false } = {}) {
  const command = registerCommand();
  const printable = command.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(' ');
  if (dryRun) {
    console.log(printable);
    return true;
  }
  const claude = tryRun('claude', ['--version']);
  if (!claude.ok) {
    console.log('The "claude" command was not found. Install Claude Code, then run:\n\n  ' + printable + '\n');
    return false;
  }
  const listing = claudeMcpList();
  // Registrations under an old name of this project would start a second copy of the server.
  for (const name of legacyRegistrations(listing)) {
    const removed = tryRun('claude', ['mcp', 'remove', name], 60000);
    console.log(removed.ok ? `Removed the old "${name}" MCP registration.` : `Could not remove the old "${name}" MCP registration. Run: claude mcp remove ${name}`);
  }
  if (isRegistered(listing)) {
    console.log('a2a-panel is already registered with Claude Code.');
    return true;
  }
  const result = tryRun(command[0], command.slice(1), 60000);
  if (!result.ok) {
    console.log('Registration failed:\n' + result.output + '\n\nRun this yourself:\n\n  ' + printable + '\n');
    return false;
  }
  console.log('Registered a2a-panel with Claude Code (user scope). Restart Claude Code or run /mcp to load it.');
  return true;
}

module.exports = { runDoctor, printDoctor, runInit };
