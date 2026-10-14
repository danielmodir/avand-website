const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query, transaction } = require('../db/pool');
const { hashToken, requireAuth } = require('../middleware/auth');
const { HttpError } = require('../utils/http');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

async function createSession(conn, userId, userAgent) {
  const token = jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: `${env.sessionDays}d` });
  await conn.execute(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [crypto.randomUUID(), userId, hashToken(token), (userAgent || '').slice(0, 255) || null, env.sessionDays]
  );
  return token;
}

router.post('/register', async (req, res) => {
  const { email, password, firstName = '', lastName = '' } = req.body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required');
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();
  try {
    const token = await transaction(async (conn) => {
      await conn.execute('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [userId, email.trim(), passwordHash]);
      await conn.execute('INSERT INTO profiles (user_id, first_name, last_name) VALUES (?, ?, ?)', [userId, String(firstName).slice(0, 100), String(lastName).slice(0, 100)]);
      await conn.execute('INSERT INTO user_settings (user_id) VALUES (?)', [userId]);
      return createSession(conn, userId, req.headers['user-agent']);
    });
    res.status(201).json({ token, userId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Email already registered');
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') throw new HttpError(400, 'email and password are required');

  const rows = await query('SELECT id, password_hash FROM users WHERE email = ?', [email.trim()]);
  // Compare against a dummy hash when the email is unknown, so response
  // time does not reveal which emails are registered.
  const hash = rows[0]?.password_hash || DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);
  if (!rows[0] || !valid) throw new HttpError(401, 'Invalid email or password');

  const token = await transaction((conn) => createSession(conn, rows[0].id, req.headers['user-agent']));
  res.json({ token, userId: rows[0].id });
});

router.post('/logout', requireAuth, async (req, res) => {
  await query('DELETE FROM sessions WHERE token_hash = ?', [hashToken(req.token)]);
  res.status(204).end();
});

module.exports = router;
