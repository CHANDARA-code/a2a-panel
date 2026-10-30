const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const accounts = require('./accounts');

const GOOGLE_USERINFO_URL = process.env.A2A_GOOGLE_USERINFO_URL || 'https://www.googleapis.com/oauth2/v3/userinfo';
const TEST_PICTURE_HOSTS = (process.env.A2A_PICTURE_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean);
const PICTURE_HOST_SUFFIXES = ['.googleusercontent.com'];
const MAX_PICTURE_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;

function decodeJwtPayload(jwt) {
  if (typeof jwt !== 'string' || jwt.split('.').length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf-8'));
  } catch (err) {
    return null;
  }
}

function providerHome(account) {
  if (account.provider === 'codex') {
    return account.system ? (process.env.CODEX_HOME || path.join(accounts.getRealHome(), '.codex')) : accounts.accountFolder(account);
  }
  if (account.provider === 'agy') {
    return account.system ? accounts.getRealHome() : accounts.ensureAgyHome(account);
  }
  return null;
}

function codexIdentity(home) {
  let auth;
  try {
    auth = JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf-8'));
  } catch (err) {
    return null;
  }
  const claims = decodeJwtPayload(auth && auth.tokens && auth.tokens.id_token);
  if (!claims) return null;
  const openai = claims['https://api.openai.com/auth'] || {};
  return { name: claims.name || null, email: claims.email || null, plan: openai.chatgpt_plan_type || null, pictureUrl: null, source: 'codex-token' };
}

function decodeKeyringValue(value) {
  if (value.startsWith('go-keyring-base64:')) return Buffer.from(value.slice('go-keyring-base64:'.length), 'base64').toString('utf-8');
  if (value.startsWith('go-keyring-encoded:')) return Buffer.from(value.slice('go-keyring-encoded:'.length), 'hex').toString('utf-8');
  return value;
}

function agyStoredSignIn(home) {
  try {
    return JSON.parse(fs.readFileSync(path.join(home, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'), 'utf-8'));
  } catch (err) {}
  if (process.platform !== 'darwin') return null;
  try {
    const value = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'antigravity', '-w'], {
      env: { ...process.env, HOME: home },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: TIMEOUT_MS
    }).trim();
    return JSON.parse(decodeKeyringValue(value));
  } catch (err) {
    return null;
  }
}

async function agyIdentity(home) {
  const stored = agyStoredSignIn(home);
  if (!stored) return null;
  const email = stored.id_token_email || null;
  const token = stored.token || {};
  const fresh = token.access_token && (!token.expiry || Date.parse(token.expiry) > Date.now() + 30000);
  if (!fresh) return email ? { name: null, email, plan: null, pictureUrl: null, source: 'google' } : null;
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`userinfo ${res.status}`);
    const info = await res.json();
    return { name: info.name || null, email: info.email || email, plan: null, pictureUrl: typeof info.picture === 'string' ? info.picture : null, source: 'google' };
  } catch (err) {
    return email ? { name: null, email, plan: null, pictureUrl: null, source: 'google' } : null;
  }
}

function allowedPictureUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch (err) {
    return null;
  }
  if (TEST_PICTURE_HOSTS.includes(url.hostname)) return url;
  if (url.protocol !== 'https:') return null;
  return PICTURE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix)) ? url : null;
}

async function downloadPicture(raw) {
  const url = allowedPictureUrl(raw);
  if (!url) return null;
  if (url.hostname.endsWith('.googleusercontent.com')) url.pathname = url.pathname.replace(/=s\d+(-c)?$/, '=s256-c');
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_PICTURE_BYTES) return null;
    const ext = accounts.imageExtension(buf);
    return ext ? { buf, ext } : null;
  } catch (err) {
    return null;
  }
}

async function refreshIdentity(account) {
  if (!account || account.status.state !== 'signed-in') return null;
  let identity = null;
  if (account.provider === 'claude') {
    identity = account.status.email ? { name: null, email: account.status.email, plan: account.status.plan || null, pictureUrl: null, source: 'claude-status' } : null;
  } else if (account.provider === 'codex') {
    identity = codexIdentity(providerHome(account));
  } else if (account.provider === 'agy') {
    identity = await agyIdentity(providerHome(account));
  }
  if (!identity) return null;
  const { pictureUrl, ...saved } = identity;
  if (pictureUrl) {
    const picture = await downloadPicture(pictureUrl);
    if (picture) accounts.saveProfilePicture(account.id, picture.buf, picture.ext);
  }
  accounts.saveIdentity(account.id, { ...saved, fetchedAt: new Date().toISOString() });
  return saved;
}

module.exports = { refreshIdentity, decodeJwtPayload };
