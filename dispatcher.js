const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const AGY_BIN = process.env.AGY_BIN || '/Users/chandara-dgc/.local/bin/agy';
const AGENT_CARD_PATH = fs.existsSync(path.join(__dirname, 'agent-card.json'))
  ? path.join(__dirname, 'agent-card.json')
  : path.join(__dirname, 'agent.json');

const LOGS_DIR = process.env.A2A_LOGS_DIR || path.join(__dirname, 'logs');
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

const NO_WORK_SIGNALS = /no output produced|do not have access to (?:command|file|direct)|does not provide direct file|no file[- ]write or terminal|not provisioned/i;

const PLUGINS_DIR = path.join(process.env.HOME || '', '.gemini', 'config', 'plugins');
const PERSONA_LIMIT = 6000;

function loadRolePersona(role) {
  if (!role || !/^[\w-]+$/.test(role)) return null;
  try {
    for (const plugin of fs.readdirSync(PLUGINS_DIR)) {
      const file = path.join(PLUGINS_DIR, plugin, 'agents', `${role}.md`);
      if (fs.existsSync(file)) {
        const body = fs.readFileSync(file, 'utf-8').replace(/^---[\s\S]*?---\s*/, '').trim();
        return body.slice(0, PERSONA_LIMIT);
      }
    }
  } catch (err) {
    return null;
  }
  return null;
}

function runAgyTask({ role, prompt, workspace, mode = 'accept-edits', effort = 'high', acceptance_criteria, verification_command, onChunk, onDone, onError }) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.trim().startsWith('--')) {
    throw new Error('Invalid task prompt: ' + JSON.stringify(prompt) + ' (empty or looks like a CLI flag)');
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
    '--add-dir', targetCwd
  ];

  if (process.env.A2A_SKIP_PERMISSIONS === '1') {
    args.push('--dangerously-skip-permissions');
  }


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

  proc.stdout.on('data', (data) => {
    const text = data.toString('utf-8');
    taskRecord.output += text;
    logStream.write(text);
    if (onChunk) onChunk(text);
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString('utf-8');
    taskRecord.output += text;
    logStream.write(text);
    if (onChunk) onChunk(text);
  });

  proc.on('error', (err) => {
    spawnFailed = true;
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
    if (fs.existsSync(cancelMarkerPath(taskId))) taskRecord.status = 'cancelled';
    if (taskRecord.status !== 'cancelled') {
      taskRecord.status = code === 0 ? 'completed' : 'failed';
      if (code === 0 && NO_WORK_SIGNALS.test(taskRecord.output)) {
        taskRecord.status = 'failed';
        taskRecord.error = 'Agent reported it could not edit files or run commands; no work was done';
        logStream.write('\n[A2A] Marked failed: the agent output says it had no file or shell tools.\n');
      }
    }
    taskRecord.finishedAt = new Date().toISOString();
    taskRecord.exitCode = code;
    taskRecord.process = null;
    removeProcessFiles();
    logStream.write(`\n\n=== TASK FINISHED: Exit code ${code} (${taskRecord.status}) ===\n`);
    logStream.end();
    if (onDone) onDone(taskRecord);
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
  activeTasks,
  LOGS_DIR,
  TASK_ID_PATTERN
};

