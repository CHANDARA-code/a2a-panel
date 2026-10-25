const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createStreamParser } = require('./agy-stream');

const { DATA_DIR } = require('./config');

function resolveAgyBin() {
  if (process.env.AGY_BIN) return process.env.AGY_BIN;
  const candidates = (process.env.PATH || '').split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, 'agy'));
  candidates.push(path.join(process.env.HOME || '', '.local', 'bin', 'agy'));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (err) {}
  }
  return 'agy';
}

const AGY_BIN = resolveAgyBin();
const AGENT_CARD_PATH = fs.existsSync(path.join(__dirname, 'agent-card.json'))
  ? path.join(__dirname, 'agent-card.json')
  : path.join(__dirname, 'agent.json');

const LOGS_DIR = process.env.A2A_LOGS_DIR || path.join(DATA_DIR, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function getAgentCard() {
  try {
    return JSON.parse(fs.readFileSync(AGENT_CARD_PATH, 'utf-8'));
  } catch (err) {
    return { error: 'Failed to read agent card', details: err.message };
  }
}

const activeTasks = new Map();

const TASK_ID_PATTERN = /^a2a_[\w-]+$/;
const KILL_ESCALATION_MS = parseInt(process.env.A2A_KILL_ESCALATION_MS || '5000', 10);

function envInt(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const limits = () => ({
  wallMs: envInt('A2A_TASK_TIMEOUT_MS', 3600000),
  idleMs: envInt('A2A_IDLE_TIMEOUT_MS', 0),
  maxConcurrent: envInt('A2A_MAX_CONCURRENT', 4),
  maxOutputChars: envInt('A2A_MAX_OUTPUT_CHARS', 200000)
});

function cancelMarkerPath(taskId) {
  return path.join(LOGS_DIR, `${taskId}.cancelled`);
}

function readTaskPid(taskId) {
  try {
    const pid = parseInt(fs.readFileSync(path.join(LOGS_DIR, `${taskId}.pid`), 'utf-8'), 10);
    return pid > 1 ? pid : null;
  } catch (err) {
    return null;
  }
}

function startMarkerPath(taskId) {
  return path.join(LOGS_DIR, `${taskId}.start`);
}

function processCommand(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf-8' }).trim();
  } catch (err) {
    return '';
  }
}

function processStart(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf-8' }).trim();
  } catch (err) {
    return '';
  }
}

function readTaskStart(taskId) {
  try {
    return fs.readFileSync(startMarkerPath(taskId), 'utf-8').trim();
  } catch (err) {
    return '';
  }
}

function isGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function commandRunsAgent(command) {
  const base = path.basename(AGY_BIN);
  return command.split(/\s+/).slice(0, 2).some((token) => path.basename(token) === base);
}

function isTaskProcessLive(taskId, pid) {
  const command = processCommand(pid);
  if (command) {
    const recordedStart = readTaskStart(taskId);
    if (recordedStart && processStart(pid) !== recordedStart) return false;
    return commandRunsAgent(command);
  }
  return isGroupAlive(pid);
}

function listDescendants(rootPid) {
  let table = '';
  try {
    table = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf-8' });
  } catch (err) {
    return [];
  }
  const children = new Map();
  for (const line of table.split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (!pid) continue;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  const found = [];
  const queue = [rootPid];
  while (queue.length) {
    for (const child of children.get(queue.shift()) || []) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

function signalTaskTree(pid, signal) {
  try {
    process.kill(-pid, signal);
    return;
  } catch (err) {
    if (err.code !== 'ESRCH') throw err;
  }
  for (const target of [...listDescendants(pid), pid]) {
    try {
      process.kill(target, signal);
    } catch (err) {}
  }
}

function cancelTask(taskId) {
  if (!TASK_ID_PATTERN.test(taskId)) return { ok: false, code: 400, error: 'Invalid task id' };
  const pid = readTaskPid(taskId);
  if (!pid || !isTaskProcessLive(taskId, pid)) {
    return { ok: false, code: 409, error: 'Task process is not running' };
  }
  try {
    fs.writeFileSync(cancelMarkerPath(taskId), new Date().toISOString());
  } catch (err) {}
  try {
    signalTaskTree(pid, 'SIGTERM');
  } catch (err) {
    try {
      fs.unlinkSync(cancelMarkerPath(taskId));
    } catch (unlinkErr) {}
    return { ok: false, code: 500, error: `Could not signal the task: ${err.message}` };
  }
  const record = activeTasks.get(taskId);
  if (record) {
    record.status = 'cancelled';
    record.finishedAt = new Date().toISOString();
  }
  setTimeout(() => {
    if (isTaskProcessLive(taskId, pid)) {
      try {
        signalTaskTree(pid, 'SIGKILL');
      } catch (err) {}
    }
  }, KILL_ESCALATION_MS).unref();
  return { ok: true, code: 200, id: taskId, status: 'cancelled' };
}

const RETENTION_FILE_PATTERN = /^(a2a_[\w-]+)\.(log|cancelled)$/;

function pruneOldLogs() {
  const days = envInt('A2A_LOG_RETENTION_DAYS', 14);
  if (days <= 0) return;
  const cutoff = Date.now() - days * 86400000;
  let files = [];
  try {
    files = fs.readdirSync(LOGS_DIR);
  } catch (err) {
    return;
  }
  for (const file of files) {
    const match = RETENTION_FILE_PATTERN.exec(file);
    if (!match) continue;
    const pid = readTaskPid(match[1]);
    if (pid && isTaskProcessLive(match[1], pid)) continue;
    try {
      const full = path.join(LOGS_DIR, file);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch (err) {}
  }
}

function countRunningTasks() {
  let running = 0;
  let files = [];
  try {
    files = fs.readdirSync(LOGS_DIR);
  } catch (err) {
    return 0;
  }
  for (const file of files) {
    if (!file.endsWith('.pid')) continue;
    const taskId = file.slice(0, -4);
    const pid = readTaskPid(taskId);
    if (pid && isTaskProcessLive(taskId, pid)) running++;
  }
  return running;
}

const NO_WORK_SIGNALS = /no output produced|do not have access to (?:command|file|direct)|does not provide direct file|no file[- ]write or terminal|not provisioned/i;

const PLUGINS_DIR = process.env.A2A_PLUGINS_DIR || path.join(process.env.HOME || '', '.gemini', 'config', 'plugins');
const PERSONAS_DIR = path.join(__dirname, 'personas');
const PERSONA_LIMIT = 6000;

function readPersona(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf-8').replace(/^---[\s\S]*?---\s*/, '').trim().slice(0, PERSONA_LIMIT);
  } catch (err) {
    return null;
  }
}

function loadRolePersona(role) {
  if (!role || !/^[\w-]+$/.test(role)) return null;
  try {
    for (const plugin of fs.readdirSync(PLUGINS_DIR)) {
      const persona = readPersona(path.join(PLUGINS_DIR, plugin, 'agents', `${role}.md`));
      if (persona) return persona;
    }
  } catch (err) {}
  return readPersona(path.join(PERSONAS_DIR, `${role}.md`));
}

const USAGE_LOG = path.join(LOGS_DIR, 'usage.jsonl');
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9][\w-]{7,63}$/;
const MODEL_PATTERN = /^[A-Za-z0-9][\w.:-]{0,63}$/;
const CHANGES_LIMIT = 2000;
const VERIFY_OUTPUT_LIMIT = 4000;

function runVerification(command, cwd, logStream) {
  const timeoutMs = envInt('A2A_VERIFY_TIMEOUT_MS', 600000);
  const startedAt = Date.now();
  logStream.write(`\n=== VERIFICATION (run by agy-bridge, not the agent): ${command} ===\n`);
  return new Promise((resolve) => {
    let tail = '';
    let timedOut = false;
    let settled = false;
    const child = spawn('sh', ['-c', command], { cwd, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const onData = (data) => {
      const text = data.toString('utf-8');
      logStream.write(text);
      tail = (tail + text).slice(-VERIFY_OUTPUT_LIMIT);
    };
    const killTimers = [];
    const settle = (exitCode, extra = '') => {
      if (settled) return;
      settled = true;
      killTimers.forEach(clearTimeout);
      if (extra) tail = (tail + extra).slice(-VERIFY_OUTPUT_LIMIT);
      const passed = exitCode === 0 && !timedOut;
      logStream.write(`\n=== VERIFICATION ${passed ? 'PASSED' : 'FAILED'} (exit ${exitCode}${timedOut ? ', timed out' : ''}) ===\n`);
      resolve({ command, exitCode, passed, timedOut, durationMs: Date.now() - startedAt, outputTail: tail });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => settle(-1, `\n${err.message}`));
    child.on('close', (code) => settle(code === null ? -1 : code));
    if (timeoutMs > 0) {
      killTimers.push(setTimeout(() => {
        timedOut = true;
        try {
          signalTaskTree(child.pid, 'SIGTERM');
        } catch (err) {}
        killTimers.push(setTimeout(() => {
          try {
            signalTaskTree(child.pid, 'SIGKILL');
          } catch (err) {}
        }, KILL_ESCALATION_MS));
      }, timeoutMs));
    }
  });
}

function workspaceChanges(cwd) {
  const run = (args) => {
    try {
      return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (err) {
      return '';
    }
  };
  const status = run(['status', '--short']);
  if (!status) return '';
  const stat = run(['diff', '--stat']);
  return [status, stat].filter(Boolean).join('\n\n').slice(0, CHANGES_LIMIT);
}

function recordUsage(taskRecord) {
  if (!taskRecord.usage) return;
  const entry = {
    at: new Date().toISOString(),
    taskId: taskRecord.id,
    role: taskRecord.role,
    status: taskRecord.status,
    model: taskRecord.model || null,
    conversationId: taskRecord.conversationId || null,
    durationSeconds: taskRecord.durationSeconds || null,
    usage: taskRecord.usage
  };
  try {
    fs.appendFileSync(USAGE_LOG, JSON.stringify(entry) + '\n');
  } catch (err) {}
}

function readUsageTotals() {
  const totals = { tasks: 0, input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0, byRole: {} };
  let lines = [];
  try {
    lines = fs.readFileSync(USAGE_LOG, 'utf-8').split('\n');
  } catch (err) {
    return totals;
  }
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (err) {
      continue;
    }
    const usage = entry.usage || {};
    totals.tasks++;
    for (const key of ['input_tokens', 'output_tokens', 'thinking_tokens', 'cache_read_tokens', 'total_tokens']) {
      totals[key] += Number(usage[key]) || 0;
    }
    const role = entry.role || 'unknown';
    const perRole = totals.byRole[role] || (totals.byRole[role] = { tasks: 0, total_tokens: 0 });
    perRole.tasks++;
    perRole.total_tokens += Number(usage.total_tokens) || 0;
  }
  return totals;
}

function runAgyTask({ role, prompt, workspace, mode = 'accept-edits', effort = 'high', model, conversation_id, acceptance_criteria, verification_command, onChunk, onDone, onError }) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.trim().startsWith('--')) {
    throw new Error('Invalid task prompt: ' + JSON.stringify(prompt) + ' (empty or looks like a CLI flag)');
  }
  if (conversation_id && !CONVERSATION_ID_PATTERN.test(conversation_id)) {
    throw new Error('Invalid conversation_id');
  }
  if (model && !MODEL_PATTERN.test(model)) {
    throw new Error('Invalid model name');
  }
  const { wallMs, idleMs, maxConcurrent, maxOutputChars } = limits();
  pruneOldLogs();
  if (maxConcurrent > 0) {
    const running = countRunningTasks();
    if (running >= maxConcurrent) {
      throw new Error(`Concurrency limit reached: ${running} of ${maxConcurrent} agent tasks are running. Wait for one to finish or cancel one (limit set by A2A_MAX_CONCURRENT).`);
    }
  }
  const taskId = 'a2a_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  if (workspace && !fs.existsSync(workspace)) {
    throw new Error('Workspace does not exist: ' + workspace);
  }
  const targetCwd = workspace || process.cwd();
  if (path.resolve(targetCwd) === __dirname) {
    throw new Error('A workspace path is required (refusing to run agents inside the bridge directory)');
  }

  const card = getAgentCard();
  const list = card.skills || card.roles || [];
  const skillConfig = list.find(r => r.id === role);
  const agyAgentName = skillConfig && skillConfig.agy_agent ? skillConfig.agy_agent : (role && role !== 'lead-software-engineer' ? role : null);

  let finalPrompt = prompt;
  const rolePersona = loadRolePersona(agyAgentName);
  if (rolePersona) {
    finalPrompt = `### YOUR ROLE (${agyAgentName})\n${rolePersona}\n\n### TASK\n${prompt}`;
  }
  if (acceptance_criteria) {
    const formattedCriteria = Array.isArray(acceptance_criteria)
      ? acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : acceptance_criteria;
    finalPrompt += `\n\n### MANDATORY ACCEPTANCE CRITERIA:\n${formattedCriteria}`;
  }
  if (verification_command) {
    finalPrompt += `\n\n### VERIFICATION & VALIDATION STEP:\nBefore declaring completion, execute the following command in the workspace and verify it passes:\n\`${verification_command}\`\nReport the command exit status and test summary in your final output.`;
  }

  const args = [
    '-p', finalPrompt,
    '--mode', mode,
    '--effort', effort,
    '--output-format', 'stream-json',
    '--add-dir', targetCwd,
    '--dangerously-skip-permissions'
  ];
  if (model) args.push('--model', model);
  if (conversation_id) args.push('--conversation', conversation_id);

  const logFilePath = path.join(LOGS_DIR, `${taskId}.log`);
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  logStream.write(`=== TASK STARTED: ${taskId} ===\n`);
  logStream.write(`Role: ${role || 'lead-software-engineer'}\n`);
  logStream.write(`Workspace: ${targetCwd}\n`);
  logStream.write(`Started: ${new Date().toISOString()}\n`);
  logStream.write(`Prompt:\n${finalPrompt}\n`);
  logStream.write(`--------------------------------------------------\n\n`);

  const taskRecord = {
    id: taskId,
    role: role || 'lead-software-engineer',
    prompt,
    workspace: targetCwd,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logFile: logFilePath,
    output: '',
    model: model || null,
    conversationId: conversation_id || null,
    usage: null,
    verification: null,
    changes: '',
    error: null,
    process: null
  };

  activeTasks.set(taskId, taskRecord);

  const proc = spawn(AGY_BIN, args, {
    cwd: targetCwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });

  taskRecord.process = proc;
  logStream.on('error', () => {});
  if (proc.pid) {
    try {
      fs.writeFileSync(path.join(LOGS_DIR, `${taskId}.pid`), String(proc.pid));
      fs.writeFileSync(startMarkerPath(taskId), processStart(proc.pid));
    } catch (err) {}
  }

  const removeProcessFiles = () => {
    for (const file of [`${taskId}.pid`, `${taskId}.start`]) {
      try {
        fs.unlinkSync(path.join(LOGS_DIR, file));
      } catch (err) {}
    }
  };
  let spawnFailed = false;
  let finished = false;
  let lastOutputAt = Date.now();
  taskRecord.outputChars = 0;
  taskRecord.outputTruncated = false;
  const timers = [];

  const stopTimers = () => {
    finished = true;
    for (const timer of timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
  };

  const expire = (reason) => {
    if (finished || taskRecord.timeoutReason) return;
    taskRecord.timeoutReason = reason;
    try {
      signalTaskTree(proc.pid, 'SIGTERM');
    } catch (err) {}
    const escalation = setTimeout(() => {
      if (finished) return;
      try {
        signalTaskTree(proc.pid, 'SIGKILL');
      } catch (err) {}
    }, KILL_ESCALATION_MS);
    escalation.unref();
    timers.push(escalation);
  };

  if (wallMs > 0) {
    const wallTimer = setTimeout(() => expire(`Timed out after ${Math.round(wallMs / 1000)}s of wall-clock time (A2A_TASK_TIMEOUT_MS)`), wallMs);
    wallTimer.unref();
    timers.push(wallTimer);
  }
  if (idleMs > 0) {
    const idleTimer = setInterval(() => {
      if (Date.now() - lastOutputAt > idleMs) {
        expire(`No output for ${Math.round(idleMs / 1000)}s (A2A_IDLE_TIMEOUT_MS)`);
      }
    }, Math.min(1000, idleMs));
    idleTimer.unref();
    timers.push(idleTimer);
  }

  const appendOutput = (text) => {
    taskRecord.outputChars += text.length;
    taskRecord.output += text;
    if (maxOutputChars > 0 && taskRecord.output.length > maxOutputChars) {
      taskRecord.output = taskRecord.output.slice(-maxOutputChars);
      taskRecord.outputTruncated = true;
    }
    logStream.write(text);
    if (onChunk) onChunk(text);
  };

  const parser = createStreamParser({
    onText: appendOutput,
    onLog: (text) => logStream.write(text),
    onInit: (conversationId) => {
      if (conversationId) taskRecord.conversationId = conversationId;
    },
    onResult: (result) => {
      taskRecord.agyStatus = result.status || null;
      taskRecord.usage = result.usage || null;
      taskRecord.durationSeconds = result.duration_seconds || null;
      if (result.conversation_id) taskRecord.conversationId = result.conversation_id;
      if (!taskRecord.output && typeof result.response === 'string') appendOutput(result.response);
    }
  });

  proc.stdout.on('data', (data) => {
    lastOutputAt = Date.now();
    parser.push(data.toString('utf-8'));
  });

  proc.stderr.on('data', (data) => {
    lastOutputAt = Date.now();
    appendOutput(data.toString('utf-8'));
  });

  proc.on('error', (err) => {
    spawnFailed = true;
    stopTimers();
    taskRecord.status = 'failed';
    taskRecord.finishedAt = new Date().toISOString();
    taskRecord.error = err.message;
    taskRecord.exitCode = -1;
    taskRecord.process = null;
    removeProcessFiles();
    logStream.write(`\n\n[TASK ERROR]: ${err.message}\n`);
    logStream.write(`\n=== TASK FINISHED: Exit code -1 (failed) ===\n`);
    logStream.end();
    if (onError) onError(err);
  });

  proc.on('close', (code) => {
    if (spawnFailed) return;
    stopTimers();
    parser.end();
    if (fs.existsSync(cancelMarkerPath(taskId))) taskRecord.status = 'cancelled';
    if (taskRecord.status !== 'cancelled') {
      taskRecord.status = code === 0 ? 'completed' : 'failed';
      if (taskRecord.timeoutReason) {
        taskRecord.status = 'failed';
        taskRecord.error = taskRecord.timeoutReason;
        logStream.write(`\n[A2A] Marked failed: ${taskRecord.timeoutReason}\n`);
      } else if (code === 0 && taskRecord.agyStatus && taskRecord.agyStatus !== 'SUCCESS') {
        taskRecord.status = 'failed';
        taskRecord.error = `Agent finished with status ${taskRecord.agyStatus}`;
        logStream.write(`\n[A2A] Marked failed: ${taskRecord.error}\n`);
      } else if (code === 0 && NO_WORK_SIGNALS.test(taskRecord.output)) {
        taskRecord.status = 'failed';
        taskRecord.error = 'Agent reported it could not edit files or run commands; no work was done';
        logStream.write('\n[A2A] Marked failed: the agent output says it had no file or shell tools.\n');
      }
    }
    const finalize = () => {
      taskRecord.finishedAt = new Date().toISOString();
      taskRecord.exitCode = code;
      taskRecord.process = null;
      taskRecord.changes = workspaceChanges(targetCwd);
      recordUsage(taskRecord);
      removeProcessFiles();
      logStream.write(`\n\n=== TASK FINISHED: Exit code ${code} (${taskRecord.status}) ===\n`);
      logStream.end();
      if (onDone) onDone(taskRecord);
    };

    if (!verification_command || taskRecord.status !== 'completed') {
      finalize();
      return;
    }
    removeProcessFiles();
    taskRecord.status = 'running';
    runVerification(verification_command, targetCwd, logStream).then((verification) => {
      taskRecord.verification = verification;
      taskRecord.status = 'completed';
      if (!verification.passed) {
        taskRecord.status = 'failed';
        taskRecord.error = verification.timedOut
          ? `Verification timed out: ${verification_command}`
          : `Verification failed (exit ${verification.exitCode}): ${verification_command}`;
        logStream.write(`\n[A2A] Marked failed: ${taskRecord.error}\n`);
      }
      finalize();
    });
  });

  return {
    taskId,
    taskRecord,
    cancel: () => {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
        taskRecord.status = 'cancelled';
        taskRecord.finishedAt = new Date().toISOString();
      }
    }
  };
}

module.exports = {
  AGY_BIN,
  getAgentCard,
  runAgyTask,
  cancelTask,
  isTaskProcessLive,
  readUsageTotals,
  USAGE_LOG,
  activeTasks,
  LOGS_DIR,
  TASK_ID_PATTERN
};

