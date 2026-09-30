const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db/pool');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { rows } = await pool.query(
    'select 1 from sessions where token_hash = $1 and user_id = $2 and expires_at > now()',
    [hashToken(token), payload.sub]
  );
  if (rows.length === 0) return res.status(401).json({ error: 'Session revoked or expired' });

  req.userId = payload.sub;
  next();
}

module.exports = { requireAuth, hashToken };
