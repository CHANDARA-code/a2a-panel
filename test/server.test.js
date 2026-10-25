const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TOKEN = 'a'.repeat(64);
const FAKE_AGENT = path.join(__dirname, 'fake-agy.sh');
const instances = [];

function authed(extra = {}) {
  return { 'X-A2A-Token': TOKEN, 'Content-Type': 'application/json', ...extra };
}

async function waitFor(check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for condition');
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function descendantsMatching(rootPid, pattern) {
  const out = execFileSync('ps', ['-A', '-o', 'pid=,pgid=,command='], { encoding: 'utf-8' });
  return out
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m) => m && Number(m[2]) === rootPid && pattern.test(m[3]))
    .map((m) => Number(m[1]));
}

async function startInstance(extraEnv = {}) {
  const port = 5200 + Math.floor(Math.random() * 700);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-test-'));
  const logsDir = path.join(sandbox, 'logs');
  const tokenFile = path.join(sandbox, 'token');
  const workspace = path.join(sandbox, 'ws');
  fs.mkdirSync(workspace);
  fs.writeFileSync(tokenFile, TOKEN + '\n');
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, A2A_PORT: String(port), A2A_LOGS_DIR: logsDir, A2A_TOKEN_FILE: tokenFile, AGY_BIN: FAKE_AGENT, ...extraEnv },
    stdio: 'ignore'
  });
  const instance = { port, base: `http://127.0.0.1:${port}`, sandbox, logsDir, workspace, proc };
  instances.push(instance);
  await waitFor(async () => {
    try {
      return (await fetch(`${instance.base}/health`)).ok;
    } catch (err) {
      return false;
    }
  });
  return instance;
}

function rawRequest(instance, requestPath, { method = 'GET', host } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: instance.port, path: requestPath, method, headers: host ? { Host: host } : {} },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function dispatch(instance, overrides = {}) {
  const res = await fetch(`${instance.base}/api/tasks`, {
    method: 'POST',
    headers: authed(),
    body: JSON.stringify({ role: 'web-engineer', prompt: 'long task', workspace: instance.workspace, mode: 'plan', effort: 'low', ...overrides })
  });
  return { res, body: await res.json() };
}

function leaderPid(instance, taskId) {
  return waitFor(() => {
    try {
      return parseInt(fs.readFileSync(path.join(instance.logsDir, `${taskId}.pid`), 'utf-8'), 10);
    } catch (err) {
      return 0;
    }
  });
}

async function taskOf(instance, taskId) {
  return (await (await fetch(`${instance.base}/api/tasks/${taskId}`)).json()).task;
}

let main;

before(async () => {
  main = await startInstance();
});

after(() => {
  for (const instance of instances) {
    try {
      for (const file of fs.readdirSync(instance.logsDir).filter((f) => f.endsWith('.pid'))) {
        const pid = parseInt(fs.readFileSync(path.join(instance.logsDir, file), 'utf-8'), 10);
        try {
          process.kill(-pid, 'SIGKILL');
        } catch (err) {}
      }
    } catch (err) {}
    instance.proc.kill('SIGKILL');
    fs.rmSync(instance.sandbox, { recursive: true, force: true });
  }
});

test('rejects a request whose Host header is not local', async () => {
  assert.strictEqual((await rawRequest(main, '/health', { host: 'evil.example' })).status, 403);
  assert.strictEqual((await rawRequest(main, '/health', { host: `evil.example:${main.port}` })).status, 403);
  assert.strictEqual((await rawRequest(main, '/health', { host: `localhost:${main.port}` })).status, 200);
});

test('sends no CORS headers', async () => {
  const res = await fetch(`${main.base}/health`);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(`${main.base}/rpc`, { method: 'OPTIONS' });
  assert.strictEqual(preflight.headers.get('access-control-allow-origin'), null);
});

test('every write route and every non-GET method needs the token', async () => {
  for (const route of ['/api/tasks', '/tasks/send', '/rpc', '/api/tasks/a2a_x/cancel', '/tasks/a2a_x/cancel']) {
    const res = await fetch(`${main.base}${route}`, { method: 'POST', body: '{}' });
    assert.strictEqual(res.status, 401, route);
  }
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    const res = await fetch(`${main.base}/api/tasks`, { method, body: '{}' });
    assert.strictEqual(res.status, 401, method);
  }
});

test('POST with a wrong token is rejected', async () => {
  const res = await fetch(`${main.base}/api/tasks`, { method: 'POST', headers: { 'X-A2A-Token': 'b'.repeat(64) }, body: '{}' });
  assert.strictEqual(res.status, 401);
});

test('POST with a valid token from a foreign Origin is rejected', async () => {
  const res = await fetch(`${main.base}/api/tasks`, { method: 'POST', headers: authed({ Origin: 'http://evil.example' }), body: '{}' });
  assert.strictEqual(res.status, 403);
});

test('Authorization bearer token is accepted', async () => {
  const res = await fetch(`${main.base}/rpc`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'agent.getCard' })
  });
  assert.strictEqual(res.status, 200);
});

test('dispatch validates role, workspace, prompt, mode and effort', async () => {
  const bad = async (overrides) => (await dispatch(main, overrides)).res.status;
  assert.strictEqual(await bad({ role: 'nope' }), 400);
  assert.strictEqual(await bad({ prompt: '   ' }), 400);
  assert.strictEqual(await bad({ prompt: '--workspace' }), 400);
  assert.strictEqual(await bad({ workspace: 'relative/path' }), 400);
  assert.strictEqual(await bad({ workspace: path.join(main.sandbox, 'missing') }), 400);
  assert.strictEqual(await bad({ mode: 'auto' }), 400);
  assert.strictEqual(await bad({ effort: 'extreme' }), 400);
});

test('static serving rejects traversal with a literal dot-dot path', async () => {
  const toToken = await rawRequest(main, '/dashboard/../../token');
  assert.strictEqual(toToken.status, 403);
  assert.ok(!toToken.body.includes(TOKEN));
  const toSource = await rawRequest(main, '/dashboard/../server.js');
  assert.strictEqual(toSource.status, 403);
  assert.ok(!toSource.body.includes('require('));
});

test('dashboard page carries the token, a CSP and is never cached; no API leaks the token', async (t) => {
  if (!fs.existsSync(path.join(ROOT, 'panel', 'dist', 'index.html'))) return t.skip('panel is not built');
  const page = await rawRequest(main, '/dashboard');
  assert.strictEqual(page.status, 200);
  assert.ok(page.body.includes(`content="${TOKEN}"`));
  assert.ok(!page.body.includes('__A2A_TOKEN__'));
  assert.match(page.headers['content-security-policy'], /default-src 'self'/);
  assert.strictEqual(page.headers['cache-control'], 'no-store');
  assert.strictEqual(page.headers['x-frame-options'], 'DENY');
  for (const route of ['/api/health', '/api/tasks', '/api/roles', '/health', '/tasks']) {
    assert.ok(!(await rawRequest(main, route)).body.includes(TOKEN), route);
  }
});

test('dispatch then cancel stops the agent and its whole process group', async () => {
  const { res, body } = await dispatch(main);
  assert.strictEqual(res.status, 202);
  const pid = await leaderPid(main, body.taskId);
  const children = await waitFor(() => {
    const found = descendantsMatching(pid, /sleep 300/);
    return found.length ? found : null;
  });

  const running = await taskOf(main, body.taskId);
  assert.strictEqual(running.status, 'running');
  assert.strictEqual(running.cancellable, true);

  const cancelled = await fetch(`${main.base}/api/tasks/${body.taskId}/cancel`, { method: 'POST', headers: authed() });
  assert.strictEqual(cancelled.status, 200);

  await waitFor(() => !processAlive(pid) && children.every((child) => !processAlive(child)));
  const finished = await waitFor(async () => {
    const task = await taskOf(main, body.taskId);
    return task.status === 'cancelled' ? task : null;
  });
  assert.strictEqual(finished.cancellable, false);

  const again = await fetch(`${main.base}/api/tasks/${body.taskId}/cancel`, { method: 'POST', headers: authed() });
  assert.strictEqual(again.status, 409);
});

test('legacy REST cancel and JSON-RPC cancel use the same group-wide stop', async () => {
  for (const via of ['rest', 'rpc']) {
    const { body } = await dispatch(main);
    const pid = await leaderPid(main, body.taskId);
    await waitFor(() => descendantsMatching(pid, /sleep 300/).length);
    const res =
      via === 'rest'
        ? await fetch(`${main.base}/tasks/${body.taskId}/cancel`, { method: 'POST', headers: authed() })
        : await fetch(`${main.base}/rpc`, {
            method: 'POST',
            headers: authed(),
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tasks/cancel', params: { taskId: body.taskId } })
          });
    assert.strictEqual(res.status, 200, via);
    await waitFor(() => !processAlive(pid) && descendantsMatching(pid, /sleep 300/).length === 0);
  }
});

test('SIGKILL escalation kills a descendant that ignores SIGTERM', async () => {
  const stubborn = await startInstance({ FAKE_AGY_MODE: 'stubborn', A2A_KILL_ESCALATION_MS: '800' });
  const { body } = await dispatch(stubborn);
  const pid = await leaderPid(stubborn, body.taskId);
  const children = await waitFor(() => {
    const found = descendantsMatching(pid, /sleep 300/);
    return found.length ? found : null;
  });
  const res = await fetch(`${stubborn.base}/api/tasks/${body.taskId}/cancel`, { method: 'POST', headers: authed() });
  assert.strictEqual(res.status, 200);
  await waitFor(() => !processAlive(pid), 3000);
  assert.ok(children.some((child) => processAlive(child)), 'child should still be alive right after SIGTERM');
  await waitFor(() => children.every((child) => !processAlive(child)), 6000);
});

test('a task whose leader exited but whose group is alive stays running and can be cancelled', async () => {
  const lingering = await startInstance({ FAKE_AGY_MODE: 'detached-child' });
  const { body } = await dispatch(lingering);
  const pid = await leaderPid(lingering, body.taskId);
  await waitFor(() => !processAlive(pid), 4000);
  await new Promise((resolve) => setTimeout(resolve, 400));

  const task = await taskOf(lingering, body.taskId);
  assert.strictEqual(task.status, 'running');
  assert.strictEqual(task.cancellable, true);

  const res = await fetch(`${lingering.base}/api/tasks/${body.taskId}/cancel`, { method: 'POST', headers: authed() });
  assert.strictEqual(res.status, 200);
  const finished = await waitFor(async () => {
    const current = await taskOf(lingering, body.taskId);
    return current.status === 'cancelled' ? current : null;
  });
  assert.strictEqual(finished.cancellable, false);
});

test('a missing agent binary fails the task without crashing the server', async () => {
  const broken = await startInstance({ AGY_BIN: '/nonexistent/agy' });
  const { res, body } = await dispatch(broken);
  assert.strictEqual(res.status, 202);
  const task = await waitFor(async () => {
    const current = await taskOf(broken, body.taskId);
    return current.status === 'failed' ? current : null;
  });
  assert.match(task.error, /ENOENT/);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.strictEqual((await fetch(`${broken.base}/health`)).status, 200);
  assert.strictEqual(broken.proc.exitCode, null);
});

test('cancelling an unknown or malformed task id fails cleanly', async () => {
  const unknown = await fetch(`${main.base}/api/tasks/a2a_0_none/cancel`, { method: 'POST', headers: authed() });
  assert.strictEqual(unknown.status, 409);
  const malformed = await fetch(`${main.base}/api/tasks/..%2f..%2fx/cancel`, { method: 'POST', headers: authed() });
  assert.ok([400, 404].includes(malformed.status));
});
