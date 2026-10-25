const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN_FILE = process.env.A2A_TOKEN_FILE || path.join(__dirname, 'token');
const TOKEN_MIN_LENGTH = 32;

function loadOrCreateToken() {
  try {
    const existing = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
    if (existing.length >= TOKEN_MIN_LENGTH) {
      fs.chmodSync(TOKEN_FILE, 0o600);
      return existing;
    }
  } catch (err) {}
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(TOKEN_FILE, token + '\n', { mode: 0o600 });
  return token;
}

function allowedHosts(host, port) {
  return new Set([`${host}:${port}`, `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
}

function isAllowedHost(req, hosts) {
  const header = (req.headers.host || '').toLowerCase();
  return hosts.has(header);
}

function extractToken(req) {
  const direct = req.headers['x-a2a-token'];
  if (typeof direct === 'string' && direct) return direct;
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return '';
}

function isValidToken(req, token) {
  const supplied = Buffer.from(extractToken(req));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin.toLowerCase() === `http://${(req.headers.host || '').toLowerCase()}`;
}

module.exports = { TOKEN_FILE, loadOrCreateToken, allowedHosts, isAllowedHost, isValidToken, isSameOrigin };
