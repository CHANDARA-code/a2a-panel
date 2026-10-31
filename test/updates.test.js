const { test, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TOKEN = 'u'.repeat(64);
const CURRENT = require('../package.json').version;
const instances = [];

function authed() {
  return { 'X-A2A-Token': TOKEN, 'Content-Type': 'application/json' };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitFor(check, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for condition');
}

async function fakeRegistry(answer) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    const body = typeof answer === 'function' ? answer() : answer;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  instances.push({ registry: server });
  return { url: `http://127.0.0.1:${server.address().port}`, hits };
}

async function startInstance(extraEnv = {}) {
  const port = await freePort();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-upd-test-'));
  const home = path.join(sandbox, 'home');
  const workspace = path.join(sandbox, 'ws');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(sandbox, 'token'), TOKEN + '\n');
  const npmLog = path.join(sandbox, 'npm.log');
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: {
      ...process.env,
      HOME: home,
      A2A_PORT: String(port),
      A2A_HOME: sandbox,
      A2A_TOKEN_FILE: path.join(sandbox, 'token'),
      A2A_LOGS_DIR: path.join(sandbox, 'logs'),
      A2A_ACCOUNTS_DIR: path.join(sandbox, 'accounts'),
      A2A_PRESETS_DIR: path.join(sandbox, 'presets'),
      A2A_TEAMS_DIR: path.join(sandbox, 'teams'),
      A2A_REAL_HOME: home,
      A2A_NPM_BIN: path.join(__dirname, 'fake-npm.sh'),
      FAKE_NPM_ROOT: path.dirname(ROOT),
      FAKE_NPM_LOG: npmLog,
      AGY_BIN: path.join(__dirname, 'fake-agy.sh'),
      FAKE_AGY_MODE: 'stream',
      ...extraEnv
    },
    stdio: 'ignore'
  });
  const instance = { base: `http://127.0.0.1:${port}`, sandbox, workspace, npmLog, proc };
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

after(() => {
  for (const instance of instances) {
    if (instance.registry) instance.registry.close();
    if (instance.proc) {
      try {
        instance.proc.kill('SIGKILL');
      } catch (err) {}
    }
    if (instance.sandbox) fs.rmSync(instance.sandbox, { recursive: true, force: true });
  }
});

async function version(instance, refresh = false) {
  return (await fetch(`${instance.base}/api/version${refresh ? '?refresh=1' : ''}`)).json();
}

test('versions are compared by semver, including prereleases', () => {
  const { compareVersions } = require('../src/updates');
  assert.strictEqual(compareVersions('0.10.0', '0.9.9'), 1);
  assert.strictEqual(compareVersions('1.0.0', '1.0.0-rc.1'), 1);
  assert.strictEqual(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1);
  assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.strictEqual(compareVersions('0.2.0', '0.2.0'), 0);
  assert.strictEqual(compareVersions('2.0.0', '10.0.0'), -1);
});

test('a newer version on npm shows as an available update for a global npm install', async () => {
  const registry = await fakeRegistry({ name: 'a2a-panel', version: '9.9.9' });
  const instance = await startInstance({ A2A_NPM_REGISTRY: registry.url });
  const info = await version(instance);
  assert.strictEqual(info.current, CURRENT);
  assert.strictEqual(info.latest, '9.9.9');
  assert.strictEqual(info.updateAvailable, true);
  assert.strictEqual(info.install, 'npm-global');
  assert.strictEqual(info.canUpdate, true);
  assert.strictEqual(info.restart, 'manual');
  assert.strictEqual(info.command, 'npm install -g a2a-panel@9.9.9');
  assert.match(info.notesUrl, /^https:\/\/github\.com\/.+\/blob\/main\/CHANGELOG\.md$/);
  assert.deepStrictEqual(registry.hits, ['/a2a-panel/latest']);
  await version(instance);
  assert.strictEqual(registry.hits.length, 1, 'the registry was asked again within the cache window');
});

test('the same version, a broken registry answer or turned-off checks show no update', async () => {
  const same = await fakeRegistry({ version: CURRENT });
  assert.strictEqual((await version(await startInstance({ A2A_NPM_REGISTRY: same.url }))).updateAvailable, false);

  const broken = await fakeRegistry({ version: 'latest; rm -rf /' });
  const brokenInfo = await version(await startInstance({ A2A_NPM_REGISTRY: broken.url }));
  assert.strictEqual(brokenInfo.updateAvailable, false);
  assert.match(brokenInfo.error, /no valid version/);

  const off = await fakeRegistry({ version: '9.9.9' });
  const offInfo = await version(await startInstance({ A2A_NPM_REGISTRY: off.url, A2A_UPDATE_CHECK: '0' }));
  assert.strictEqual(offInfo.checksEnabled, false);
  assert.strictEqual(offInfo.updateAvailable, false);
  assert.strictEqual(off.hits.length, 0, 'the registry was contacted although checks are off');
});

test('Update now installs the exact new version with npm, needs the token, and reports a manual restart', async () => {
  const registry = await fakeRegistry({ version: '9.9.9' });
  const instance = await startInstance({ A2A_NPM_REGISTRY: registry.url });
  assert.strictEqual((await fetch(`${instance.base}/api/update`, { method: 'POST' })).status, 401);

  const started = await fetch(`${instance.base}/api/update`, { method: 'POST', headers: authed() });
  assert.strictEqual(started.status, 202);
  const done = await waitFor(async () => {
    const info = await version(instance);
    return ['installed', 'failed', 'restarting'].includes(info.update.state) ? info : null;
  });
  assert.strictEqual(done.update.state, 'installed', done.update.error);
  assert.match(fs.readFileSync(instance.npmLog, 'utf-8'), /^ARGV: install -g a2a-panel@9\.9\.9$/m);
});

test('an update is refused while a task is running, and a failed npm install is reported', async () => {
  const registry = await fakeRegistry({ version: '9.9.9' });
  const busy = await startInstance({ A2A_NPM_REGISTRY: registry.url, FAKE_AGY_MODE: 'stubborn' });
  const task = await fetch(`${busy.base}/api/tasks`, { method: 'POST', headers: authed(), body: JSON.stringify({ role: 'web-engineer', prompt: 'long work', workspace: busy.workspace, mode: 'plan' }) });
  assert.strictEqual(task.status, 202);
  await waitFor(async () => (await (await fetch(`${busy.base}/api/health`)).json()).running === 1);
  const refused = await fetch(`${busy.base}/api/update`, { method: 'POST', headers: authed() });
  assert.strictEqual(refused.status, 409);
  assert.match((await refused.json()).error, /1 task\(s\)/);
  assert.ok(!fs.existsSync(busy.npmLog), 'npm ran while a task was running');
  const { taskId } = await task.json();
  await fetch(`${busy.base}/api/tasks/${taskId}/cancel`, { method: 'POST', headers: authed() });
  await waitFor(async () => (await (await fetch(`${busy.base}/api/health`)).json()).running === 0);

  const failing = await startInstance({ A2A_NPM_REGISTRY: registry.url, FAKE_NPM_EXIT: '1' });
  await fetch(`${failing.base}/api/update`, { method: 'POST', headers: authed() });
  const failed = await waitFor(async () => {
    const info = await version(failing);
    return info.update.state === 'failed' ? info : null;
  });
  assert.match(failed.update.error, /exited with code 1/);
  assert.match(failed.update.output, /added 1 package/);
});

test('a copy that was not installed globally with npm shows the command instead of updating itself', async () => {
  const registry = await fakeRegistry({ version: '9.9.9' });
  const instance = await startInstance({ A2A_NPM_REGISTRY: registry.url, FAKE_NPM_ROOT: path.join(os.tmpdir(), 'elsewhere') });
  const info = await version(instance);
  assert.strictEqual(info.updateAvailable, true);
  assert.strictEqual(info.install, fs.existsSync(path.join(ROOT, '.git')) ? 'source' : 'other');
  assert.strictEqual(info.canUpdate, false);
  const refused = await fetch(`${instance.base}/api/update`, { method: 'POST', headers: authed() });
  assert.strictEqual(refused.status, 409);
  assert.ok(!fs.existsSync(instance.npmLog), 'npm install ran for a copy that is not a global npm install');
});
