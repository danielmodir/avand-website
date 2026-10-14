const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../db/pool');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// A valid signature is not enough: the token's session row must still
// exist, so logout and revocation take effect immediately.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const rows = await query(
    'SELECT 1 FROM sessions WHERE token_hash = ? AND user_id = ? AND expires_at > NOW()',
    [hashToken(token), payload.sub]
  );
  if (rows.length === 0) return res.status(401).json({ error: 'Session revoked or expired' });

  req.userId = payload.sub;
  req.token = token;
  next();
}

module.exports = { requireAuth, hashToken };
