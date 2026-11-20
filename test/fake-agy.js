const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const args = process.argv.slice(2);
const home = process.env.HOME || os.homedir();

if (process.env.FAKE_ARGS_FILE) {
  const entry = `ARGV: ${args.join(' ')}\nHOME: ${home}\nAGY_ADC_AUTH_SET: ${process.env.AGY_ADC_AUTH ? 'yes' : 'no'}\n`;
  fs.appendFileSync(process.env.FAKE_ARGS_FILE, entry);
}

if (args[0] === 'models') {
  if (fs.existsSync(path.join(home, '.gemini', 'antigravity-cli', '.signed-in'))) {
    process.stdout.write('gemini-1.5-pro\tGemini 1.5 Pro\ngemini-1.5-flash\tGemini 1.5 Flash\n');
    process.exit(0);
  }
  console.log('Error: Please sign in to view available models. Launch the CLI without arguments to sign in.');
  process.exit(1);
}

let mode = process.env.FAKE_AGY_MODE || '';
const replayFile = path.join(home, '.agy-replay');
const modeFile = path.join(home, '.agy-mode');
if (fs.existsSync(replayFile)) mode = 'replay';
else if (fs.existsSync(modeFile)) mode = fs.readFileSync(modeFile, 'utf-8').trim();

function spawnStubbornChild() {
  const child = spawn(
    process.execPath,
    ['-e', "process.on('SIGTERM', () => {}); setTimeout(() => {}, 300000);", 'sleep 300'],
    { detached: true, stdio: 'ignore', windowsHide: true }
  );
  child.on('exit', () => process.exit(0));
}

(async () => {
  switch (mode) {
    case 'replay':
      if (fs.existsSync(replayFile)) {
        process.stdout.write(fs.readFileSync(replayFile, 'utf-8'));
        process.exit(0);
      }
      process.exit(1);
      break;
    case 'stubborn':
      spawnStubbornChild();
      break;
    case 'signin-stdout':
      console.log('Authentication required. Please visit the URL to log in:');
      setTimeout(() => process.exit(0), 300000);
      break;
    case 'signin-crash': {
      process.stderr.write('Authentication required. Please visit the URL to log in:\n');
      process.stderr.write('  https://accounts.google.com/o/oauth2/auth?client_id=fake\n');
      process.stderr.write('Or, paste the authorization code here and press Enter: ');
      const rl = readline.createInterface({ input: process.stdin });
      rl.once('line', () => {
        process.stderr.write('fatal: token exchange failed\n');
        process.exit(3);
      });
      break;
    }
    case 'signin': {
      process.stderr.write('Authentication required. Please visit the URL to log in:\n');
      process.stderr.write('  https://accounts.google.com/o/oauth2/auth?client_id=fake&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback\n');
      process.stderr.write('Or, paste the authorization code here and press Enter: ');
      const rl = readline.createInterface({ input: process.stdin });
      let gotLine = false;
      rl.once('line', (line) => {
        gotLine = true;
        rl.close();
        if (line.trim() === 'good-code') {
          const dir = path.join(home, '.gemini', 'antigravity-cli');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, '.signed-in'), '');
          console.log('{"event":"result","result":{"status":"SUCCESS","response":"OK","usage":{"total_tokens":3}}}');
          process.exit(0);
        }
        console.log('{"event":"result","result":{"status":"ERROR","response":"","error":"authentication failed or timed out","usage":{"total_tokens":0}}}');
        process.exit(0);
      });
      rl.once('close', () => {
        if (!gotLine) setTimeout(() => process.exit(0), 300000);
      });
      break;
    }
    case 'detached-child': {
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 300000)'], {
        detached: true,
        stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true
      });
      child.unref();
      process.exit(0);
      break;
    }
    case 'stream': {
      const delaySec = Number(process.env.FAKE_AGY_STREAM_DELAY || 0);
      if (delaySec > 0) await new Promise((r) => setTimeout(r, delaySec * 1000));
      console.log('{"event":"init","conversation_id":"conv-12345678","init":{"cwd":"/x"}}');
      console.log('{"event":"step_update","step_update":{"step_index":2,"state":"ACTIVE","step_type":"agent_response","text_delta":"Hello "}}');
      console.log('{"event":"step_update","step_update":{"step_index":3,"state":"DONE","step_type":"run_command"}}');
      console.log('{"event":"step_update","step_update":{"step_index":4,"state":"ACTIVE","step_type":"agent_response","text_delta":"world"}}');
      console.log('plain passthrough line');
      console.log('{"event":"result","result":{"conversation_id":"conv-12345678","status":"SUCCESS","response":"Hello world","duration_seconds":1.5,"usage":{"input_tokens":100,"output_tokens":20,"thinking_tokens":0,"cache_read_tokens":50,"total_tokens":120}}}');
      process.exit(0);
      break;
    }
    case 'tools':
      console.log('{"event":"step_update","step_update":{"step_index":1,"state":"DONE","step_type":"tool","tool_name":"run_command","tool_info":{"name":"run_command","parameters":{"CommandLine":"npm test"}}}}');
      console.log('{"event":"step_update","step_update":{"step_index":2,"state":"ERROR","step_type":"tool","tool_name":"run_command","tool_info":{"name":"run_command","parameters":{"CommandLine":"ls -la"},"error":{"type":"TOOL_ERROR","message":"user denied permission to run command:\\nls -la"}}}}');
      console.log('{"event":"result","result":{"status":"SUCCESS","response":"done","usage":{"total_tokens":7},"denied_actions":[{"action":"command","display_name":"RunCommand"}]}}');
      process.exit(0);
      break;
    case 'failed':
      console.log('{"event":"result","result":{"status":"ERROR","response":"","usage":{"total_tokens":5}}}');
      process.exit(0);
      break;
    case 'quota':
      console.log('{"event":"result","result":{"status":"ERROR","response":"","error":"Resource has been exhausted (check quota or rate limit, resets in 1h)","usage":{"total_tokens":5}}}');
      process.exit(1);
      break;
    case 'busy': {
      const count = Number(process.env.FAKE_AGY_BUSY_LINES || 600);
      for (let i = 0; i < count; i++) {
        console.log('{"event":"step_update","step_update":{"step_index":2,"state":"ACTIVE","step_type":"agent_response","text_delta":"working on the change, reading files and running the tests "}}');
        await new Promise((r) => setTimeout(r, 50));
      }
      console.log('{"event":"result","result":{"status":"SUCCESS","response":"done","usage":{"total_tokens":10}}}');
      process.exit(0);
      break;
    }
    case 'chatty':
      process.stdout.write('line of agent output\n'.repeat(5000));
      process.exit(0);
      break;
    case 'echo-home':
      console.log(`HOME=${home}`);
      process.exit(0);
      break;
    default:
      spawn(process.execPath, ['-e', 'setTimeout(() => {}, 300000)', 'sleep 300'], { stdio: 'ignore', windowsHide: true })
        .on('exit', () => process.exit(0));
      break;
  }
})();
