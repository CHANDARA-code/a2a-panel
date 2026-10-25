const fs = require('fs');
const path = require('path');
const { getAgentCard, runAgyTask, cancelTask, isTaskProcessLive, readUsageTotals, LOGS_DIR, TASK_ID_PATTERN } = require('./dispatcher');

const BASE_PATH = '/dashboard';
const DIST_DIR = path.join(__dirname, 'panel', 'dist');
const TOKEN_PLACEHOLDER = '__A2A_TOKEN__';
const LEGACY_STALE_MS = 12 * 60 * 60 * 1000;
const HEAD_BYTES = 16000;
const DETAIL_HEAD_BYTES = 80000;
const TAIL_BYTES = 6000;
const MAX_TASKS = 200;
const MAX_PROMPT_LENGTH = 20000;
const MAX_BODY_BYTES = 1024 * 1024;
const LOG_SEPARATOR = '--------------------------------------------------';
const MODES = ['accept-edits', 'plan'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const START_TIME = Date.now();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

const PAGE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function readHead(full, bytes) {
  const fd = fs.openSync(full, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.toString('utf-8', 0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function readTail(full, bytes) {
  const stat = fs.statSync(full);
  const fd = fs.openSync(full, 'r');
  try {
    const len = Math.min(bytes, stat.size);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, stat.size - len);
    return buf.toString('utf-8');
  } finally {
    fs.closeSync(fd);
  }
}

function pidFile(id) {
  return path.join(LOGS_DIR, `${id}.pid`);
}

function cancelMarker(id) {
  return path.join(LOGS_DIR, `${id}.cancelled`);
}

function isAlive(id) {
  if (!fs.existsSync(pidFile(id))) return true;
  const pid = parseInt(fs.readFileSync(pidFile(id), 'utf-8'), 10);
  if (!pid) return false;
  return isTaskProcessLive(id, pid);
}

function extractPrompt(head) {
  const start = head.indexOf('Prompt:\n');
  if (start === -1) return '';
  const rest = head.slice(start + 'Prompt:\n'.length);
  const end = rest.indexOf(`\n${LOG_SEPARATOR}\n`);
  const body = end === -1 ? rest : rest.slice(0, end);
  const marker = body.indexOf('### TASK\n');
  return marker === -1 ? body : body.slice(marker + '### TASK\n'.length);
}

function parseLog(id, headBytes = HEAD_BYTES) {
  const full = path.join(LOGS_DIR, `${id}.log`);
  const stat = fs.statSync(full);
  const head = readHead(full, headBytes);
  const grab = (re) => (head.match(re) || [])[1] || '';
  const tail = readTail(full, 1500);
  const finished = tail.match(/=== TASK FINISHED: Exit code (\S+) \((\w+)\) ===/);
  const hasPid = fs.existsSync(pidFile(id));
  const cancelRequested = fs.existsSync(cancelMarker(id));

  let status = 'running';
  if (finished) status = finished[2];
  else if (!isAlive(id)) status = 'stale';
  else if (!hasPid && Date.now() - stat.mtimeMs > LEGACY_STALE_MS) status = 'stale';
  if (cancelRequested && (status === 'failed' || status === 'stale')) status = 'cancelled';

  const startedAt = grab(/^Started: (.*)$/m);
  const finishedAt = status === 'running' ? null : new Date(stat.mtimeMs).toISOString();
  const endMs = finishedAt ? Date.parse(finishedAt) : Date.now();
  const startMs = Date.parse(startedAt);
  const errorMatch = tail.match(/\[A2A\] Marked failed: (.*)/) || tail.match(/\[TASK ERROR\]: (.*)/);

  return {
    id,
    role: grab(/^Role: (.*)$/m),
    workspace: grab(/^Workspace: (.*)$/m),
    startedAt,
    finishedAt,
    updatedAt: new Date(stat.mtimeMs).toISOString(),
    durationMs: Number.isNaN(startMs) ? null : Math.max(0, endMs - startMs),
    status,
    exitCode: finished ? finished[1] : null,
    sizeBytes: stat.size,
    cancellable: status === 'running' && hasPid,
    cancelRequested,
    error: errorMatch ? errorMatch[1].trim() : null,
    prompt: extractPrompt(head)
  };
}

function toSummary(task) {
  const { prompt, ...rest } = task;
  return { ...rest, promptPreview: prompt.replace(/\s+/g, ' ').slice(0, 160) };
}

function listTasks() {
  if (!fs.existsSync(LOGS_DIR)) return [];
  return fs.readdirSync(LOGS_DIR)
    .filter((f) => /^a2a_[\w-]+\.log$/.test(f))
    .map((f) => {
      try {
        return toSummary(parseLog(f.replace(/\.log$/, '')));
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, MAX_TASKS);
}

function recentWorkspaces(tasks) {
  const seen = new Set();
  for (const task of tasks) {
    if (task.workspace && !seen.has(task.workspace) && fs.existsSync(task.workspace)) seen.add(task.workspace);
    if (seen.size >= 10) break;
  }
  return Array.from(seen);
}

function listRoles() {
  return (getAgentCard().skills || []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    tags: s.tags || []
  }));
}

function validateDispatch(body) {
  const roles = listRoles().map((r) => r.id);
  if (typeof body.role !== 'string' || !roles.includes(body.role)) return 'Unknown role';
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) return 'Prompt is required';
  if (body.prompt.trim().startsWith('--')) return 'Prompt must not start with "--"';
  if (body.prompt.length > MAX_PROMPT_LENGTH) return `Prompt is longer than ${MAX_PROMPT_LENGTH} characters`;
  if (typeof body.workspace !== 'string' || !path.isAbsolute(body.workspace)) return 'Workspace must be an absolute path';
  let stat;
  try {
    stat = fs.statSync(body.workspace);
  } catch (err) {
    return 'Workspace does not exist';
  }
  if (!stat.isDirectory()) return 'Workspace is not a directory';
  if (body.mode !== undefined && !MODES.includes(body.mode)) return 'Unsupported mode';
  if (body.effort !== undefined && !EFFORTS.includes(body.effort)) return 'Unsupported effort';
  return null;
}

async function dispatch(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const problem = validateDispatch(body);
  if (problem) return sendJson(res, 400, { error: problem });
  try {
    const { taskId } = runAgyTask({
      role: body.role,
      prompt: body.prompt,
      workspace: body.workspace,
      mode: body.mode || 'accept-edits',
      effort: body.effort || 'high',
      model: body.model,
      conversation_id: body.conversation_id
    });
    return sendJson(res, 202, { taskId, status: 'running' });
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
}

function serveTaskLog(res, id) {
  const full = path.join(LOGS_DIR, `${id}.log`);
  if (!fs.existsSync(full)) return sendText(res, 404, 'Not found');
  const size = fs.statSync(full).size;
  const limit = TAIL_BYTES * 5;
  const body = readTail(full, size > limit ? limit : size);
  return sendText(res, 200, size > limit ? `[... earlier output truncated ...]\n${body}` : body);
}

function serveStatic(res, pathname, token) {
  const relative = pathname.slice(BASE_PATH.length).replace(/^\/+/, '');
  const resolved = path.resolve(DIST_DIR, relative || 'index.html');
  if (resolved !== DIST_DIR && !resolved.startsWith(DIST_DIR + path.sep)) return sendText(res, 403, 'Forbidden');

  let target = resolved;
  const exists = fs.existsSync(target) && fs.statSync(target).isFile();
  if (!exists) {
    if (path.extname(relative)) return sendText(res, 404, 'Not found');
    target = path.join(DIST_DIR, 'index.html');
  }
  if (!fs.existsSync(target)) {
    return sendText(res, 503, 'Panel is not built. Run: cd ~/.a2a-antigravity/panel && npm install && npm run build');
  }

  const type = MIME_TYPES[path.extname(target)] || 'application/octet-stream';
  if (path.basename(target) === 'index.html') {
    const html = fs.readFileSync(target, 'utf-8').split(TOKEN_PLACEHOLDER).join(token);
    res.writeHead(200, { ...PAGE_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  const immutable = relative.startsWith('assets/');
  res.writeHead(200, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
  });
  const stream = fs.createReadStream(target);
  stream.on('error', () => res.destroy());
  return stream.pipe(res);
}

async function handle(req, res, pathname, { token }) {
  const method = req.method;

  if (method === 'GET' && (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`))) {
    serveStatic(res, pathname, token);
    return true;
  }

  if (!pathname.startsWith('/api/')) return false;

  if (method === 'GET' && pathname === '/api/health') {
    const tasks = listTasks();
    sendJson(res, 200, {
      status: 'healthy',
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      running: tasks.filter((t) => t.status === 'running').length,
      pid: process.pid
    });
    return true;
  }

  if (method === 'GET' && pathname === '/api/roles') {
    sendJson(res, 200, { roles: listRoles(), modes: MODES, efforts: EFFORTS });
    return true;
  }

  if (method === 'GET' && pathname === '/api/usage') {
    sendJson(res, 200, readUsageTotals());
    return true;
  }

  if (method === 'GET' && pathname === '/api/workspaces') {
    sendJson(res, 200, { workspaces: recentWorkspaces(listTasks()) });
    return true;
  }

  if (method === 'GET' && pathname === '/api/tasks') {
    sendJson(res, 200, { tasks: listTasks() });
    return true;
  }

  if (method === 'POST' && pathname === '/api/tasks') {
    await dispatch(req, res);
    return true;
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([\w-]+)(?:\/(log|cancel))?$/);
  if (taskMatch && TASK_ID_PATTERN.test(taskMatch[1])) {
    const [, id, action] = taskMatch;
    if (method === 'GET' && action === 'log') {
      serveTaskLog(res, id);
      return true;
    }
    if (method === 'GET' && !action) {
      if (!fs.existsSync(path.join(LOGS_DIR, `${id}.log`))) {
        sendJson(res, 404, { error: 'Task not found' });
      } else {
        sendJson(res, 200, { task: parseLog(id, DETAIL_HEAD_BYTES) });
      }
      return true;
    }
    if (method === 'POST' && action === 'cancel') {
      const result = cancelTask(id);
      sendJson(res, result.code, result.ok ? { id, status: result.status } : { error: result.error });
      return true;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
  return true;
}

module.exports = { handle, listTasks };
