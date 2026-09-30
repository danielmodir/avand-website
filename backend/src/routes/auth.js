const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const { hashToken, requireAuth } = require('../middleware/auth');

const router = express.Router();
const SESSION_DAYS = 30;

function issueSession(userId) {
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  return token;
}

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, and name are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `insert into users (email, password_hash, name) values ($1, $2, $3)
       returning id, email, name, avatar_url`,
      [email.toLowerCase(), passwordHash, name]
    );
    const user = rows[0];
    await client.query('insert into user_settings (user_id) values ($1)', [user.id]);

    const token = issueSession(user.id);
    await client.query(
      `insert into sessions (user_id, token_hash, user_agent, expires_at)
       values ($1, $2, $3, now() + interval '${SESSION_DAYS} days')`,
      [user.id, hashToken(token), req.headers['user-agent'] || null]
    );
    await client.query('commit');
    res.status(201).json({ token, user });
  } catch (err) {
    await client.query('rollback');
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    throw err;
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const { rows } = await pool.query(
    'select id, email, name, avatar_url, password_hash from users where email = $1',
    [email.toLowerCase()]
  );
  const user = rows[0];
  const valid = user && (await bcrypt.compare(password, user.password_hash));
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = issueSession(user.id);
  await pool.query(
    `insert into sessions (user_id, token_hash, user_agent, expires_at)
     values ($1, $2, $3, now() + interval '${SESSION_DAYS} days')`,
    [user.id, hashToken(token), req.headers['user-agent'] || null]
  );
  delete user.password_hash;
  res.json({ token, user });
});

router.post('/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization.slice(7);
  await pool.query('delete from sessions where token_hash = $1', [hashToken(token)]);
  res.status(204).end();
});

module.exports = router;
