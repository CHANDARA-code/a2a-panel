const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const args = process.argv.slice(2);
const home = process.env.HOME || os.homedir();

if (process.env.FAKE_ARGS_FILE) {
  const lines = [
    `ARGV: ${args.join(' ')}`,
    `HOME: ${home}`,
    `CLAUDE_CONFIG_DIR: ${process.env.CLAUDE_CONFIG_DIR || ''}`,
    `ANTHROPIC_API_KEY_SET: ${process.env.ANTHROPIC_API_KEY ? 'yes' : 'no'}`,
    `ANTHROPIC_AUTH_TOKEN_SET: ${process.env.ANTHROPIC_AUTH_TOKEN ? 'yes' : 'no'}`,
    `ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL || ''}`,
    `ANTHROPIC_CUSTOM_HEADERS_SET: ${process.env.ANTHROPIC_CUSTOM_HEADERS ? 'yes' : 'no'}`,
    `ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL || ''}`,
    `ANTHROPIC_DEFAULT_HAIKU_MODEL: ${process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || ''}`
  ];
  fs.appendFileSync(process.env.FAKE_ARGS_FILE, lines.join('\n') + '\n');
}

const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
const marker = path.join(configDir, '.signed-in');

if (args[0] === '--help') {
  console.log('Options:');
  console.log('  --model <model>                       Model for the current session. Provide');
  console.log('                                        an alias for the latest model (e.g.');
  console.log("                                        'fable', 'opus', or 'sonnet') or a");
  console.log("                                        model's full name.");
  process.exit(0);
}

(async () => {
  if (args[0] === 'auth' && args[1] === 'status') {
    const delay = Number(process.env.FAKE_CLAUDE_STATUS_DELAY || 0);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay * 1000));
    if (fs.existsSync(marker)) {
      console.log('{"loggedIn":true,"authMethod":"claude.ai","email":"user@example.com","subscriptionType":"max"}');
    } else {
      console.log('{"loggedIn":false,"authMethod":"none"}');
    }
    process.exit(0);
  }

  if (args[0] === 'auth' && args[1] === 'login') {
    console.log('Opening browser to sign in…');
    console.log("If the browser didn't open, visit: https://claude.ai/login/oauth/12345");
    process.stdout.write('Paste code here if prompted > ');
    const rl = readline.createInterface({ input: process.stdin });
    rl.once('line', (line) => {
      const code = line.trim();
      rl.close();
      console.log(`Received code ${code} (debug token 4/0AbCdEfGhIjKlMnOpQrStUvWxYz0123456789)`);
      if (code === 'good-code') {
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(marker, '');
        process.exit(0);
      }
      console.log('Invalid code');
      process.exit(1);
    });
    return;
  }

  if (args[0] === 'auth' && args[1] === 'logout') {
    if (process.env.FAKE_ARGS_FILE) {
      fs.appendFileSync(process.env.FAKE_ARGS_FILE, `LOGOUT: ${configDir}\n`);
    }
    if (fs.existsSync(path.join(configDir, '.logout-fail'))) {
      process.stderr.write('logout failed: the keychain is locked\n');
      process.exit(1);
    }
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

  let mode = process.env.FAKE_CLAUDE_MODE || 'stream';
  const replayFile = path.join(configDir, '.claude-replay');
  const modeFile = path.join(configDir, '.claude-mode');
  if (fs.existsSync(replayFile)) mode = 'replay';
  else if (fs.existsSync(modeFile)) mode = fs.readFileSync(modeFile, 'utf-8').trim();

  switch (mode) {
    case 'replay':
      if (fs.existsSync(replayFile)) {
        process.stdout.write(fs.readFileSync(replayFile, 'utf-8'));
        process.exit(0);
      }
      process.exit(1);
      break;
    case 'stream':
      console.log('{"type":"system","subtype":"init","session_id":"claude-session-987"}');
      console.log('{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"npm test","description":"run tests"}}]}}');
      console.log('{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"all tests passed","is_error":false}]}}');
      console.log('{"type":"assistant","message":{"content":[{"type":"text","text":"Task completed successfully."}]}}');
      console.log('{"type":"result","subtype":"success","is_error":false,"result":"Task completed successfully.","session_id":"claude-session-987","duration_ms":1234,"total_cost_usd":0.01,"permission_denials":[],"usage":{"input_tokens":10,"cache_creation_input_tokens":5,"cache_read_input_tokens":20,"output_tokens":15,"output_tokens_details":{"thinking_tokens":5}}}');
      process.exit(0);
      break;
    case 'quota':
      console.log('{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1793278800,"rateLimitType":"five_hour","overageStatus":"rejected","isUsingOverage":false,"unifiedWindows":{"five_hour":{"utilization":0.22,"resetsAt":1793278800},"seven_day":{"utilization":0.26,"resetsAt":1793520000}}}}');
      console.log('{"type":"system","subtype":"init","session_id":"claude-session-quota"}');
      console.log('{"type":"assistant","message":{"content":[{"type":"text","text":"Quota run complete."}]}}');
      console.log('{"type":"result","subtype":"success","is_error":false,"result":"Quota run complete.","session_id":"claude-session-quota","duration_ms":1000,"total_cost_usd":0.155,"permission_denials":[],"usage":{"input_tokens":10,"cache_creation_input_tokens":5,"cache_read_input_tokens":20,"output_tokens":15},"modelUsage":{"claude-opus-5-5":{"inputTokens":4,"outputTokens":299,"cacheReadInputTokens":59935,"cacheCreationInputTokens":17132,"costUSD":0.155039}}}');
      process.exit(0);
      break;
    case 'usage-limit':
      console.log('{"type":"result","subtype":"error","is_error":true,"result":"You have hit your limit for today. Rate limit exceeded.","error":"You have hit your limit for today"}');
      process.exit(1);
      break;
    case 'denied':
      console.log('{"type":"system","subtype":"init","session_id":"claude-session-denied"}');
      console.log('{"type":"result","subtype":"success","is_error":false,"result":"Done","session_id":"claude-session-denied","duration_ms":500,"permission_denials":[{"tool_name":"Write"}],"usage":{"input_tokens":5,"output_tokens":5}}');
      process.exit(0);
      break;
    case 'error':
      console.log('{"type":"result","subtype":"error","is_error":true,"result":"Claude execution failed","error":"Something went wrong"}');
      process.exit(1);
      break;
    case 'prose-final':
      console.log('{"type":"result","subtype":"success","is_error":true,"result":"Users report the app says they are not logged in, and the staging server answers invalid api key.","session_id":"claude-session-prose-final","usage":{"input_tokens":5,"output_tokens":5}}');
      process.exit(1);
      break;
    case 'prose-fail':
      console.log('{"type":"assistant","message":{"content":[{"type":"text","text":"The login page still shows the user is not logged in after refresh; the API returns 401 Unauthorized."}]}}');
      console.log('{"type":"result","subtype":"success","is_error":true,"result":"2 tests failed","session_id":"claude-session-prose","usage":{"input_tokens":5,"output_tokens":5}}');
      process.exit(1);
      break;
    case 'auth-expired':
      console.log('{"type":"result","subtype":"error","is_error":true,"result":"OAuth token has expired. Please run /login to sign in again.","error":"oauth token has expired"}');
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
})();
