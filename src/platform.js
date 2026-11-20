const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');

const isWindows = process.platform === 'win32';
const PROCESS_TABLE_TTL_MS = 1000;
const SINGLE_PROCESS_WINDOW_MS = 250;
const PS_ENV = { ...process.env, LC_ALL: 'C' };

let processTable = { at: 0, rows: new Map() };

function windowsExtensions() {
  const raw = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const preferred = ['.exe', '.cmd', '.bat', '.com'];
  const seen = new Set();
  const ordered = [];
  for (const ext of [...preferred, ...raw.map((e) => e.toLowerCase())]) {
    if (!seen.has(ext)) {
      seen.add(ext);
      ordered.push(ext);
    }
  }
  ordered.push('');
  return ordered;
}

function isExecutableFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (!isWindows) fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function resolveExecutable(name, extraDirs = []) {
  if (!name) return name;
  const hasSep = name.includes('/') || name.includes('\\') || (isWindows && name.includes(':'));
  if (hasSep) {
    if (isWindows && !path.extname(name)) {
      for (const ext of windowsExtensions()) {
        const candidate = `${name}${ext}`;
        if (isExecutableFile(candidate)) return candidate;
      }
    }
    return name;
  }

  const dirs = [
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean),
    ...extraDirs.filter(Boolean)
  ];

  const exts = isWindows && !path.extname(name) ? windowsExtensions() : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, `${name}${ext}`);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return name;
}

function needsShellWrapper(bin) {
  return isWindows && /\.(cmd|bat)$/i.test(String(bin || ''));
}

function quoteCmdArg(value) {
  const str = String(value);
  if (str === '') return '""';
  if (!/[\s"&|<>^()%!]/.test(str)) return str;
  return `"${str.replace(/"/g, '\\"')}"`;
}

const cmdTargetCache = new Map();

function resolveNodeCmdTarget(bin) {
  if (!isWindows || !/\.cmd$/i.test(String(bin || ''))) return null;
  if (cmdTargetCache.has(bin)) return cmdTargetCache.get(bin);
  let target = null;
  try {
    const content = fs.readFileSync(bin, 'utf-8');
    const match = content.match(/"?(?:%~dp0|%dp0%\\?)([^"\r\n]+\.(?:js|cjs|mjs))"?/i);
    if (match) {
      const candidate = path.resolve(path.dirname(bin), match[1]);
      if (fs.existsSync(candidate)) target = candidate;
    }
  } catch (err) {}
  cmdTargetCache.set(bin, target);
  return target;
}

function wrapCommand(bin, args = []) {
  const nodeTarget = resolveNodeCmdTarget(bin);
  if (nodeTarget) {
    return { file: process.execPath, args: [nodeTarget, ...args], wrapped: false };
  }
  if (!needsShellWrapper(bin)) {
    return { file: bin, args, wrapped: false };
  }
  const cmd = process.env.ComSpec || 'cmd.exe';
  const line = [bin, ...args].map(quoteCmdArg).join(' ');
  return { file: cmd, args: ['/d', '/s', '/c', `"${line}"`], wrapped: true };
}

function spawnCommand(bin, args = [], options = {}) {
  const { file, args: finalArgs, wrapped } = wrapCommand(bin, args);
  const opts = isWindows
    ? { windowsHide: true, ...options, ...(wrapped ? { windowsVerbatimArguments: true } : {}) }
    : options;
  return spawn(file, finalArgs, opts);
}

function execFileCommand(bin, args = [], options = {}, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const { file, args: finalArgs, wrapped } = wrapCommand(bin, args);
  const opts = isWindows
    ? { windowsHide: true, ...options, ...(wrapped ? { windowsVerbatimArguments: true } : {}) }
    : options;
  return execFile(file, finalArgs, opts, callback);
}

function execFileSyncCommand(bin, args = [], options = {}) {
  const { file, args: finalArgs, wrapped } = wrapCommand(bin, args);
  const opts = isWindows
    ? { windowsHide: true, ...options, ...(wrapped ? { windowsVerbatimArguments: true } : {}) }
    : options;
  return execFileSync(file, finalArgs, opts);
}

function verificationShellCommand(command) {
  if (isWindows) {
    return {
      bin: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `"${command}"`],
      options: { windowsHide: true, windowsVerbatimArguments: true }
    };
  }
  return { bin: 'sh', args: ['-c', command], options: {} };
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function queryWindowsProcesses(filter = '') {
  const where = filter ? ` -Filter "${filter}"` : '';
  const script = `Get-CimInstance Win32_Process${where} | Select-Object ProcessId,ParentProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress`;
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    return [];
  }
}

function processRows(force = false) {
  if (!force && Date.now() - processTable.at < PROCESS_TABLE_TTL_MS) return processTable.rows;
  const rows = new Map();
  if (isWindows) {
    for (const item of queryWindowsProcesses()) {
      if (!item || !item.ProcessId) continue;
      rows.set(Number(item.ProcessId), {
        ppid: Number(item.ParentProcessId) || 0,
        start: String(item.CreationDate || ''),
        command: String(item.CommandLine || '').trim()
      });
    }
  } else {
    try {
      const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,lstart=,command='], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024, env: PS_ENV });
      for (const line of out.split('\n')) {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/);
        if (match) {
          rows.set(Number(match[1]), {
            ppid: Number(match[2]),
            start: match[3],
            command: match[4].trim()
          });
        }
      }
    } catch (err) {}
  }
  processTable = { at: Date.now(), rows };
  return rows;
}

function singleProcessRow(id) {
  if (isWindows) {
    const items = queryWindowsProcesses(`ProcessId=${Number(id)}`);
    const item = items[0];
    if (!item || !item.ProcessId) return null;
    const row = {
      ppid: Number(item.ParentProcessId) || 0,
      start: String(item.CreationDate || ''),
      command: String(item.CommandLine || '').trim()
    };
    processTable.rows.set(Number(id), row);
    return row;
  }
  try {
    const out = execFileSync('ps', ['-p', String(id), '-o', 'pid=,ppid=,lstart=,command='], { encoding: 'utf-8', env: PS_ENV });
    const match = out.match(/^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/m);
    if (!match) return null;
    const row = { ppid: Number(match[2]), start: match[3], command: match[4].trim() };
    processTable.rows.set(Number(id), row);
    return row;
  } catch (err) {
    return null;
  }
}

function processRow(pid) {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0 || !processExists(id)) return null;
  const cached = processRows().get(id);
  if (cached) return cached;
  if (Date.now() - processTable.at < SINGLE_PROCESS_WINDOW_MS) return singleProcessRow(id);
  return processRows(true).get(id) || null;
}

function processStart(pid) {
  if (isWindows) {
    const row = processRow(pid);
    return row ? row.start : '';
  }
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf-8', env: PS_ENV }).trim();
  } catch (err) {
    return '';
  }
}

function localeProcessStart(pid) {
  if (isWindows) return processStart(pid);
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf-8' }).trim();
  } catch (err) {
    return '';
  }
}

function listDescendants(rootPid, force = false) {
  const rows = processRows(force);
  const children = new Map();
  for (const [pid, row] of rows) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(pid);
  }
  const found = [];
  const queue = [Number(rootPid)];
  while (queue.length) {
    for (const child of children.get(queue.shift()) || []) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

function isGroupAlive(pid) {
  if (isWindows) {
    if (processExists(pid)) return true;
    return listDescendants(pid).some((child) => processExists(child));
  }
  try {
    process.kill(-pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function killProcessTree(pid, signal = 'SIGTERM') {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0) return;
  if (isWindows) {
    const force = signal === 'SIGKILL';
    const descendants = listDescendants(id, true);
    if (force) {
      try {
        execFileSync('taskkill', ['/PID', String(id), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } catch (err) {}
      for (const target of descendants) {
        if (!processExists(target)) continue;
        try {
          execFileSync('taskkill', ['/PID', String(target), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } catch (err) {}
      }
    } else {
      try {
        process.kill(id, 'SIGTERM');
      } catch (err) {}
    }
    return;
  }

  try {
    process.kill(-id, signal);
    return;
  } catch (err) {
    if (err.code !== 'ESRCH') throw err;
  }
  for (const target of [...listDescendants(id), id]) {
    try {
      process.kill(target, signal);
    } catch (err) {}
  }
}

module.exports = {
  isWindows,
  resolveExecutable,
  needsShellWrapper,
  spawnCommand,
  execFileCommand,
  execFileSyncCommand,
  verificationShellCommand,
  processExists,
  processRows,
  processRow,
  processStart,
  localeProcessStart,
  listDescendants,
  isGroupAlive,
  killProcessTree
};
