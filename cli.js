#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { getAgentCard, runAgyTask, cancelTask, activeTasks, readUsageTotals } = require('./dispatcher');

const PORT = parseInt(process.env.A2A_PORT || '5188', 10);
const HOST = process.env.A2A_HOST || '127.0.0.1';
const PID_FILE = path.join(__dirname, 'server.pid');

function showHelp() {
  console.log(`
========================================================================
  A2A PROTOCOL CLI: Claude Code (Team Leader) <-> Antigravity (Senior Devs)
========================================================================

Usage:
  a2a list                             List all Antigravity expert dev personas & specialties
  a2a status                           Show A2A server health & agent status
  a2a tasks                            List all running & recent tasks (alias: a2a ps)
  a2a usage                            Show Antigravity token usage totals (tokens kept off Claude's bill)
  a2a logs [taskId] [-f]               View or stream live logs of a task (or latest task)
  a2a dashboard [--no-open]            Open the web task panel (monitor, dispatch, cancel)
  a2a run <role> "<task prompt>"       Dispatch task to an Antigravity developer
  a2a server start                     Start A2A protocol HTTP & JSON-RPC daemon in background
  a2a server stop                      Stop background A2A daemon
  a2a server restart                   Restart A2A daemon
  a2a server run                       Run A2A server in foreground
  a2a mcp                              Run A2A MCP server for Claude Code (stdio)

Options for "a2a run":
  --workspace <path>   Target workspace (defaults to current directory)
  --mode <mode>        Execution mode: accept-edits (default), plan
  --effort <effort>    Reasoning effort: low, medium, high (default), xhigh, max
  --async              Run in background and print task ID

Available Roles:
  web-engineer, api-engineer, mobile-engineer, desktop-engineer,
  test-engineer, bug-triager, security-auditor, code-reviewer,
  web-performance-auditor, solution-architect, devops-engineer,
  lead-software-engineer
`);
}

async function handleList() {
  const card = getAgentCard();
  console.log(`\nAgent Name: ${card.name} (v${card.version})`);
  console.log(`Provider:   ${card.provider.organization} (${card.provider.url})`);
  console.log(`Description:\n  ${card.description}\n`);
  console.log('Senior Software Developer Team Skills:');
  console.log('------------------------------------------------------------------------');
  (card.skills || card.roles || []).forEach(r => {
    console.log(`• \x1b[1m\x1b[36m${r.id.padEnd(25)}\x1b[0m ${r.name}`);
    console.log(`  \x1b[90m${r.description}\x1b[0m\n`);
  });
}

function checkServerOnline() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/health`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ online: true, data: JSON.parse(body) });
        } catch {
          resolve({ online: true, data: body });
        }
      });
    });
    req.on('error', () => resolve({ online: false }));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve({ online: false });
    });
  });
}

async function handleStatus() {
  const s = await checkServerOnline();
  console.log('\n--- A2A Protocol Server Status ---');
  if (s.online) {
    console.log(`Status:      \x1b[32mONLINE\x1b[0m`);
    console.log(`URL:         http://${HOST}:${PORT}`);
    console.log(`Agent Card:  http://${HOST}:${PORT}/.well-known/agent-card.json`);
    console.log(`JSON-RPC:    http://${HOST}:${PORT}/rpc`);
    console.log(`Active Tasks: ${s.data.activeTaskCount || 0}`);
  } else {
    console.log(`Status:      \x1b[33mOFFLINE (Background daemon not running)\x1b[0m`);
    console.log(`(Note: Claude Code MCP connects directly via stdio without needing the HTTP daemon.)`);
  }
}

async function handleServer(subcmd) {
  const plistPath = path.join(process.env.HOME, 'Library/LaunchAgents/com.antigravity.a2a-server.plist');

  if (subcmd === 'run') {
    require('./server').startServer();
    return;
  }

  if (subcmd === 'start') {
    if (fs.existsSync(plistPath)) {
      spawn('launchctl', ['load', plistPath]);
      console.log(`\x1b[32m[✓] A2A LaunchAgent service started via launchctl\x1b[0m`);
      console.log(`    Listening on: http://${HOST}:${PORT}`);
      console.log(`    Agent Card:   http://${HOST}:${PORT}/.well-known/agent-card.json`);
      return;
    }
    const s = await checkServerOnline();
    if (s.online) {
      console.log(`A2A Server is already running on http://${HOST}:${PORT}`);
      return;
    }

    const outLog = fs.openSync(path.join(__dirname, 'server.log'), 'a');
    const errLog = fs.openSync(path.join(__dirname, 'server.err'), 'a');

    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      detached: true,
      stdio: ['ignore', outLog, errLog]
    });
    child.unref();

    fs.writeFileSync(PID_FILE, child.pid.toString());
    console.log(`\x1b[32m[✓] A2A Server started in background (PID: ${child.pid})\x1b[0m`);
    return;
  }

  if (subcmd === 'stop') {
    if (fs.existsSync(plistPath)) {
      spawn('launchctl', ['unload', plistPath]);
      console.log(`\x1b[32m[✓] Stopped A2A LaunchAgent service via launchctl\x1b[0m`);
      return;
    }
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
      try {
        process.kill(pid, 'SIGTERM');
        fs.unlinkSync(PID_FILE);
        console.log(`\x1b[32m[✓] Stopped A2A Server (PID: ${pid})\x1b[0m`);
      } catch (err) {
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
      }
      return;
    }
    console.log('Server is not running or already stopped.');
    return;
  }

  if (subcmd === 'restart') {
    if (fs.existsSync(plistPath)) {
      spawn('launchctl', ['unload', plistPath]);
      setTimeout(() => {
        spawn('launchctl', ['load', plistPath]);
        console.log(`\x1b[32m[✓] A2A LaunchAgent service restarted\x1b[0m`);
      }, 500);
      return;
    }
  }

  console.log('Unknown server command. Use "a2a server [start|stop|restart|run]"');
}

async function handleRun(args) {
  if (args.length < 2) {
    console.error('Error: "a2a run" requires <role> and "<prompt>"');
    console.error('Example: a2a run web-engineer "Create a responsive login form"');
    process.exit(1);
  }

  let role = null;
  let prompt = null;
  let workspace = process.cwd();
  let mode = 'accept-edits';
  let effort = 'high';
  let isAsync = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      workspace = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1];
      i++;
    } else if (args[i] === '--effort' && args[i + 1]) {
      effort = args[i + 1];
      i++;
    } else if (args[i] === '--async') {
      isAsync = true;
    } else if (!args[i].startsWith('--') && role === null) {
      role = args[i];
    } else if (!args[i].startsWith('--') && prompt === null) {
      prompt = args[i];
    } else {
      console.error(`Error: unrecognized argument "${args[i]}"`);
      process.exit(1);
    }
  }

  if (!role) {
    console.error('Error: "a2a run" requires a <role>');
    process.exit(1);
  }

  if (!prompt || !prompt.trim()) {
    console.error('Error: "a2a run" requires a non-empty "<prompt>" (flags may appear before or after it)');
    process.exit(1);
  }

  console.log(`\n\x1b[1m\x1b[34m[A2A Dispatch]\x1b[0m Assigning task to Antigravity \x1b[36m${role}\x1b[0m...`);
  console.log(`Workspace: ${workspace}`);
  console.log(`Mode: ${mode} | Effort: ${effort}`);
  console.log(`------------------------------------------------------------------------`);

  if (isAsync) {
    const { taskId, taskRecord } = runAgyTask({ role, prompt, workspace, mode, effort });
    console.log(`Task dispatched in background.`);
    console.log(`Task ID: ${taskId}`);
    return;
  }

  let interrupted = false;
  const stopOnSignal = (signal) => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.error(`\n[A2A] ${signal} received, stopping the task (press again to force quit)...`);
    cancelTask(foreground.taskId);
  };
  process.on('SIGINT', () => stopOnSignal('SIGINT'));
  process.on('SIGTERM', () => stopOnSignal('SIGTERM'));

  const foreground = runAgyTask({
    role,
    prompt,
    workspace,
    mode,
    effort,
    onChunk: (chunk) => {
      process.stdout.write(chunk);
    },
    onDone: (taskRecord) => {
      console.log(`\n------------------------------------------------------------------------`);
      console.log(`\x1b[32m[A2A Finished]\x1b[0m Status: ${taskRecord.status.toUpperCase()} (Exit code: ${taskRecord.exitCode})`);
    },
    onError: (err) => {
      console.error(`\n\x1b[31m[A2A Error]\x1b[0m ${err.message}`);
      process.exit(1);
    }
  });
}

async function handleTasks() {
  const logsDir = path.join(__dirname, 'logs');
  const s = await checkServerOnline();

  let tasks = [];
  if (s.online) {
    try {
      tasks = await new Promise((resolve) => {
        http.get(`http://${HOST}:${PORT}/tasks`, (res) => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
            try { resolve(JSON.parse(body).tasks || []); } catch { resolve([]); }
          });
        }).on('error', () => resolve([]));
      });
    } catch {
      tasks = [];
    }
  }

  // Also check logs directory for offline history
  if (tasks.length === 0 && fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
    tasks = files.map(f => {
      const id = f.replace('.log', '');
      const stat = fs.statSync(path.join(logsDir, f));
      return {
        id,
        role: 'unknown',
        status: 'completed',
        startedAt: stat.birthtime.toISOString(),
        finishedAt: stat.mtime.toISOString(),
        workspace: ''
      };
    }).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, 15);
  }

  console.log('\n--- Active & Recent A2A Tasks ---');
  if (tasks.length === 0) {
    console.log('No recent tasks found.');
    return;
  }

  console.log('-------------------------------------------------------------------------------------------------');
  console.log(`${'TASK ID'.padEnd(26)} ${'ROLE'.padEnd(22)} ${'STATUS'.padEnd(14)} ${'STARTED'.padEnd(20)}`);
  console.log('-------------------------------------------------------------------------------------------------');
  tasks.forEach(t => {
    let statusColored = t.status;
    if (t.status === 'running') statusColored = `\x1b[33m${t.status}\x1b[0m`;
    else if (t.status === 'completed') statusColored = `\x1b[32m${t.status}\x1b[0m`;
    else if (t.status === 'failed') statusColored = `\x1b[31m${t.status}\x1b[0m`;

    const startedTime = t.startedAt ? new Date(t.startedAt).toLocaleTimeString() : 'N/A';
    console.log(`${t.id.padEnd(26)} ${(t.role || 'developer').padEnd(22)} ${statusColored.padEnd(23)} ${startedTime.padEnd(20)}`);
  });
  console.log('-------------------------------------------------------------------------------------------------');
  console.log(`Tip: Run "a2a logs <taskId> -f" to stream a task's real-time output.\n`);
}

function handleUsage() {
  const totals = readUsageTotals();
  const fmt = (n) => n.toLocaleString('en-US');
  console.log(`\nAntigravity usage across ${fmt(totals.tasks)} task(s)`);
  console.log(`  total     ${fmt(totals.total_tokens)}`);
  console.log(`  input     ${fmt(totals.input_tokens)}`);
  console.log(`  output    ${fmt(totals.output_tokens)}`);
  console.log(`  thinking  ${fmt(totals.thinking_tokens)}`);
  console.log(`  cached    ${fmt(totals.cache_read_tokens)}`);
  const roles = Object.entries(totals.byRole).sort((a, b) => b[1].total_tokens - a[1].total_tokens);
  if (roles.length) {
    console.log('\nBy role');
    for (const [role, info] of roles) {
      console.log(`  ${role.padEnd(26)} ${String(info.tasks).padStart(4)} task(s)  ${fmt(info.total_tokens)} tokens`);
    }
  }
  console.log('\nThese tokens ran on Antigravity, not in your Claude context. Claude only paid for the short result it read back.\n');
}

async function handleLogs(args) {
  const logsDir = path.join(__dirname, 'logs');
  let follow = false;
  let targetId = null;

  for (const arg of args) {
    if (arg === '-f' || arg === '--follow') {
      follow = true;
    } else if (!arg.startsWith('-')) {
      targetId = arg;
    }
  }

  let logPath = null;
  if (targetId) {
    const directPath = path.join(logsDir, targetId.endsWith('.log') ? targetId : `${targetId}.log`);
    if (fs.existsSync(directPath)) {
      logPath = directPath;
    } else {
      console.error(`Task log not found for ID "${targetId}". Check available tasks with "a2a tasks".`);
      return;
    }
  } else {
    // Find latest log in logsDir or fallback to server.log
    if (fs.existsSync(logsDir)) {
      const files = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log'))
        .map(f => ({ name: f, time: fs.statSync(path.join(logsDir, f)).mtime }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 0) {
        logPath = path.join(logsDir, files[0].name);
        console.log(`\x1b[90m[Showing latest task log: ${files[0].name}]\x1b[0m\n`);
      }
    }
    if (!logPath) {
      logPath = path.join(__dirname, 'server.log');
      console.log(`\x1b[90m[Showing A2A server log]\x1b[0m\n`);
    }
  }

  if (follow) {
    console.log(`\x1b[36mStreaming ${path.basename(logPath)} (Ctrl+C to stop)...\x1b[0m\n`);
    const tailProc = spawn('tail', ['-f', logPath], { stdio: 'inherit' });
    process.on('SIGINT', () => {
      tailProc.kill();
      process.exit(0);
    });
  } else {
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf-8');
      console.log(content || '(Log is empty)');
    } else {
      console.log('Log file does not exist yet.');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    showHelp();
    return;
  }

  if (cmd === 'list') {
    await handleList();
    return;
  }

  if (cmd === 'status') {
    await handleStatus();
    return;
  }

  if (cmd === 'tasks' || cmd === 'ps') {
    await handleTasks();
    return;
  }

  if (cmd === 'usage') {
    handleUsage();
    return;
  }

  if (cmd === 'logs') {
    await handleLogs(args.slice(1));
    return;
  }

  if (cmd === 'dashboard') {
    const panelUrl = `http://${HOST}:${PORT}/dashboard`;
    console.log(panelUrl);
    if (!args.includes('--no-open')) spawn('open', [panelUrl], { stdio: 'ignore', detached: true }).unref();
    return;
  }

  if (cmd === 'server') {
    await handleServer(args[1] || 'start');
    return;
  }

  if (cmd === 'mcp') {
    require('./mcp-server');
    return;
  }

  if (cmd === 'run') {
    await handleRun(args.slice(1));
    return;
  }

  console.error(`Unknown command: "${cmd}". Run "a2a help" for usage.`);
  process.exit(1);
}

main();

