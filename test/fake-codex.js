const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const home = process.env.HOME || os.homedir();

if (process.env.FAKE_ARGS_FILE) {
  const lines = [
    `ARGV: ${args.join(' ')}`,
    `HOME: ${home}`,
    `CODEX_HOME: ${process.env.CODEX_HOME || ''}`,
    `OPENAI_API_KEY_SET: ${process.env.OPENAI_API_KEY ? 'yes' : 'no'}`,
    `CODEX_API_KEY_SET: ${process.env.CODEX_API_KEY ? 'yes' : 'no'}`,
    `A2A_PROVIDER_API_KEY_SET: ${process.env.A2A_PROVIDER_API_KEY ? 'yes' : 'no'}`
  ];
  fs.appendFileSync(process.env.FAKE_ARGS_FILE, lines.join('\n') + '\n');
}

const configDir = process.env.CODEX_HOME || path.join(home, '.codex');
const marker = path.join(configDir, '.signed-in');

if (args[0] === 'debug' && args[1] === 'models') {
  console.log('{"models":[{"slug":"gpt-test-mini","display_name":"GPT Test Mini","visibility":"list","priority":5},{"slug":"internal-review","display_name":"Internal Review","visibility":"hide","priority":1},{"slug":"gpt-test","display_name":"GPT Test","visibility":"list","priority":0},{"slug":"bad model; rm","display_name":"Bad","visibility":"list","priority":9}]}');
  process.exit(0);
}

if (args[0] === 'login' && args[1] === 'status') {
  process.stderr.write(fs.existsSync(marker) ? 'Logged in using ChatGPT\n' : 'Not logged in\n');
  process.exit(0);
}

if (args[0] === 'login' && args[1] === '--device-auth') {
  console.log('Navigate to https://auth.openai.com/codex/device and enter code ABCD-EFGH2');
  const stubborn = process.env.FAKE_CODEX_LOGIN_STUBBORN;
  if (stubborn) {
    const ms = Number(stubborn) * 1000;
    spawn(process.execPath, ['-e', `process.on('SIGTERM', () => {}); setTimeout(() => {}, ${ms});`, `sleep ${stubborn}`], {
      stdio: 'ignore',
      windowsHide: true
    }).on('exit', () => process.exit(0));
    return;
  }
  setTimeout(() => process.exit(0), 300000);
  return;
}

if (args[0] === 'login') {
  console.log('Starting local login server on http://localhost:1455.');
  console.log('If your browser did not open, navigate to this URL to authenticate:');
  console.log('https://auth.openai.com/oauth/authorize?client_id=12345');
  setTimeout(() => process.exit(0), 300000);
  return;
}

if (args[0] === 'logout') {
  fs.rmSync(marker, { force: true });
  process.exit(0);
}

let stdinInput = '';
if (!process.stdin.isTTY) {
  stdinInput = fs.readFileSync(0, 'utf-8');
}
if (process.env.FAKE_ARGS_FILE && stdinInput) {
  fs.appendFileSync(process.env.FAKE_ARGS_FILE, `STDIN: ${stdinInput}\n`);
}

let mode = process.env.FAKE_CODEX_MODE || 'stream';
const replayFile = path.join(configDir, '.codex-replay');
const modeFile = path.join(configDir, '.codex-mode');
if (fs.existsSync(replayFile)) mode = 'replay';
else if (fs.existsSync(modeFile)) mode = fs.readFileSync(modeFile, 'utf-8').trim();

const pad = (n) => String(n).padStart(2, '0');
function todaySessionDir() {
  const now = new Date();
  const dir = path.join(configDir, 'sessions', String(now.getFullYear()), pad(now.getMonth() + 1), pad(now.getDate()));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

switch (mode) {
  case 'replay':
    if (fs.existsSync(replayFile)) {
      process.stdout.write(fs.readFileSync(replayFile, 'utf-8'));
      process.exit(0);
    }
    process.exit(1);
    break;
  case 'stream':
    console.log('{"type":"thread.started","thread_id":"codex-thread-111"}');
    console.log('{"type":"turn.started"}');
    console.log('{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"npm test","aggregated_output":"ok","exit_code":0,"status":"completed"}}');
    console.log('{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"Codex finished all tasks."}}');
    console.log('{"type":"turn.completed","usage":{"input_tokens":50,"cached_input_tokens":10,"output_tokens":25,"reasoning_output_tokens":5}}');
    process.exit(0);
    break;
  case 'quota': {
    const threadId = 'codex-thread-quota';
    console.log(JSON.stringify({ type: 'thread.started', thread_id: threadId }));
    console.log('{"type":"turn.started"}');
    console.log('{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Codex done."}}');
    console.log('{"type":"turn.completed","usage":{"input_tokens":50,"cached_input_tokens":10,"output_tokens":25,"reasoning_output_tokens":5}}');
    const dir = todaySessionDir();
    const ts = Math.floor(Date.now() / 1000);
    fs.writeFileSync(
      path.join(dir, `rollout-${ts}-codex-thread-other.jsonl`),
      '{"type":"session_meta","payload":{"id":"codex-thread-other"}}\n{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"limit_id":"codex","primary":{"used_percent":99.0,"window_minutes":300,"resets_at":1780902442},"secondary":{"used_percent":99.0,"window_minutes":10080,"resets_at":1781421196},"credits":null,"plan_type":"plus","rate_limit_reached_type":null}}}\n'
    );
    fs.writeFileSync(
      path.join(dir, `rollout-${ts}-${threadId}.jsonl`),
      `{"type":"session_meta","payload":{"id":"${threadId}"}}\n{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"limit_id":"codex","primary":{"used_percent":8.0,"window_minutes":300,"resets_at":1780902442},"secondary":{"used_percent":37.0,"window_minutes":10080,"resets_at":1781421196},"credits":null,"plan_type":"plus","rate_limit_reached_type":null}}}\n`
    );
    process.exit(0);
    break;
  }
  case 'quota-limited': {
    const threadId = 'codex-thread-limited';
    console.log(JSON.stringify({ type: 'thread.started', thread_id: threadId }));
    console.log('{"type":"turn.started"}');
    console.log('{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Codex limited."}}');
    console.log('{"type":"turn.completed","usage":{"input_tokens":5,"cached_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":0}}');
    const dir = todaySessionDir();
    const ts = Math.floor(Date.now() / 1000);
    fs.writeFileSync(
      path.join(dir, `rollout-${ts}-${threadId}.jsonl`),
      `{"type":"session_meta","payload":{"id":"${threadId}"}}\n{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"limit_id":"codex","primary":{"used_percent":100.0,"window_minutes":300,"resets_at":1780902442},"secondary":{"used_percent":50.0,"window_minutes":10080,"resets_at":1781421196},"credits":null,"plan_type":"plus","rate_limit_reached_type":"primary"}}}\n`
    );
    process.exit(0);
    break;
  }
  case 'error':
    console.log('{"type":"thread.started","thread_id":"codex-thread-err"}');
    console.log('{"type":"turn.started"}');
    console.log('{"type":"turn.failed","error":{"message":"Codex syntax failure"}}');
    process.exit(1);
    break;
  case 'auth-expired':
    console.log('{"type":"error","message":"Your access token could not be refreshed. Please log out and sign in again."}');
    process.exit(1);
    break;
  case 'stubborn':
    spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setTimeout(() => {}, 300000);", 'sleep 300'], {
      stdio: 'ignore',
      windowsHide: true
    }).on('exit', () => process.exit(0));
    break;
  default:
    setTimeout(() => process.exit(0), 300000);
    break;
}
