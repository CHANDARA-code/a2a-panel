const fs = require('fs');
const path = require('path');
const os = require('os');

const EXTENSION_DIRS = [
  path.join('.vscode', 'extensions'),
  path.join('.vscode-insiders', 'extensions'),
  path.join('.cursor', 'extensions'),
  path.join('.windsurf', 'extensions'),
  path.join('.antigravity', 'extensions')
];

const PREFIXES = {
  claude: 'anthropic.claude-code-',
  agy: 'google.google-antigravity-',
  codex: 'openai.chatgpt-'
};

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const MAX_BYTES = 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map();

function getRealHome() {
  return process.env.A2A_REAL_HOME || os.homedir();
}

function resolveIcon(providerId) {
  const prefix = PREFIXES[providerId];
  if (!prefix) return null;

  const home = getRealHome();
  let newestFolder = null;
  let newestMtime = -1;

  for (const relDir of EXTENSION_DIRS) {
    const fullDir = path.join(home, relDir);
    let entries;
    try {
      entries = fs.readdirSync(fullDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.name.startsWith(prefix)) continue;
      const fullPath = path.join(fullDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isDirectory()) continue;
        if (stat.mtimeMs > newestMtime) {
          newestMtime = stat.mtimeMs;
          newestFolder = fullPath;
        }
      } catch {}
    }
  }

  if (!newestFolder) return null;

  const pkgPath = path.join(newestFolder, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }

  if (!pkg || typeof pkg.icon !== 'string' || !pkg.icon.trim()) {
    return null;
  }

  const candidatePath = path.resolve(newestFolder, pkg.icon.trim());

  let realFolder;
  let realIconPath;
  try {
    realFolder = fs.realpathSync(newestFolder);
    realIconPath = fs.realpathSync(candidatePath);
  } catch {
    return null;
  }

  if (!realIconPath.startsWith(realFolder + path.sep)) {
    return null;
  }

  const ext = path.extname(realIconPath).toLowerCase();
  if (ext === '.svg' || !MIME_TYPES[ext]) {
    return null;
  }

  let stat;
  try {
    stat = fs.statSync(realIconPath);
  } catch {
    return null;
  }

  if (!stat.isFile() || stat.size > MAX_BYTES || stat.size === 0) {
    return null;
  }

  try {
    const data = fs.readFileSync(realIconPath);
    return {
      data,
      contentType: MIME_TYPES[ext]
    };
  } catch {
    return null;
  }
}

function findProviderIcon(providerId) {
  const home = getRealHome();
  const key = `${home}:${providerId}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }
  const result = resolveIcon(providerId);
  cache.set(key, { value: result, expiresAt: now + CACHE_TTL_MS });
  return result;
}

function clearCache() {
  cache.clear();
}

module.exports = {
  findProviderIcon,
  clearCache
};
