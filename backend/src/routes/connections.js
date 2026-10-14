// Friends. Every change goes through these endpoints, which check the
// pair's current state inside a transaction; clients never write the
// table directly (same model as the Supabase RPCs the demo uses today).
const express = require('express');
const { query, transaction } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { HttpError, assertUuid } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// Rows are stored once per pair with user_a < user_b.
const pairOf = (x, y) => (x < y ? [x, y] : [y, x]);

async function lockPair(conn, me, other) {
  const [a, b] = pairOf(me, other);
  const [rows] = await conn.execute(
    'SELECT status, requested_by FROM connections WHERE user_a = ? AND user_b = ? FOR UPDATE',
    [a, b]
  );
  return { a, b, row: rows[0] || null };
}

function targetFrom(req) {
  const target = req.params.userId;
  assertUuid(target, 'user id');
  if (target === req.userId) throw new HttpError(400, 'You cannot connect with yourself');
  return target;
}

// Status from the caller's point of view, in the client's vocabulary.
function perspective(status, requestedBy, me) {
  if (status === 'pending') return requestedBy === me ? 'pending-outgoing' : 'pending-incoming';
  if (status === 'blocked') return requestedBy === me ? 'blocked' : 'blocked-by-them';
  return status;
}

router.get('/', async (req, res) => {
  const rows = await query(
    `SELECT c.status, c.requested_by,
            IF(c.user_a = ?, c.user_b, c.user_a) AS friend_id,
            p.first_name, p.last_name, p.username, p.phone
       FROM connections c
       JOIN profiles p ON p.user_id = IF(c.user_a = ?, c.user_b, c.user_a)
      WHERE c.user_a = ? OR c.user_b = ?
      ORDER BY c.updated_at DESC`,
    [req.userId, req.userId, req.userId, req.userId]
  );
  res.json(rows
    // Someone who blocked me should simply disappear from my list.
    .filter((r) => !(r.status === 'blocked' && r.requested_by !== req.userId))
    .map((r) => ({
      id: r.friend_id,
      name: `${r.first_name} ${r.last_name}`.trim() || r.username || 'Toojibee user',
      username: r.username,
      phone: r.phone,
      status: perspective(r.status, r.requested_by, req.userId),
    })));
});

// Exact match on username or phone only: no partial search, so the
// endpoint cannot be used to enumerate users.
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().replace(/^@/, '');
  if (q.length < 3) return res.json([]);
  const rows = await query(
    `SELECT p.user_id AS id, p.first_name, p.last_name, p.username
       FROM profiles p
      WHERE (p.username = ? OR p.phone = ?) AND p.user_id <> ?
        AND NOT EXISTS (
          SELECT 1 FROM connections c
           WHERE c.status = 'blocked' AND c.requested_by = p.user_id
             AND ((c.user_a = p.user_id AND c.user_b = ?) OR (c.user_b = p.user_id AND c.user_a = ?)))
      LIMIT 5`,
    [q, q, req.userId, req.userId, req.userId]
  );
  res.json(rows.map((r) => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`.trim() || r.username,
    username: r.username,
  })));
});

router.post('/:userId/request', async (req, res) => {
  const target = targetFrom(req);
  const exists = await query('SELECT 1 FROM users WHERE id = ?', [target]);
  if (!exists.length) throw new HttpError(404, 'User not found');

  await transaction(async (conn) => {
    const { a, b, row } = await lockPair(conn, req.userId, target);
    if (!row) {
      await conn.execute(
        "INSERT INTO connections (user_a, user_b, status, requested_by) VALUES (?, ?, 'pending', ?)",
        [a, b, req.userId]
      );
    } else if (row.status === 'pending' && row.requested_by !== req.userId) {
      // They already asked me: sending a request back means yes.
      await conn.execute("UPDATE connections SET status = 'accepted' WHERE user_a = ? AND user_b = ?", [a, b]);
    } else if (row.status === 'blocked') {
      throw new HttpError(404, 'User not found');
    }
    // pending-outgoing or accepted: nothing to do.
  });
  res.status(204).end();
});

router.post('/:userId/respond', async (req, res) => {
  const target = targetFrom(req);
  const accept = req.body?.accept === true;
  await transaction(async (conn) => {
    const { a, b, row } = await lockPair(conn, req.userId, target);
    if (!row || row.status !== 'pending' || row.requested_by === req.userId) {
      throw new HttpError(404, 'No pending request from this user');
    }
    if (accept) await conn.execute("UPDATE connections SET status = 'accepted' WHERE user_a = ? AND user_b = ?", [a, b]);
    else await conn.execute('DELETE FROM connections WHERE user_a = ? AND user_b = ?', [a, b]);
  });
  res.status(204).end();
});

// Unfriend, cancel my request, or decline theirs.
router.delete('/:userId', async (req, res) => {
  const target = targetFrom(req);
  const [a, b] = pairOf(req.userId, target);
  await query("DELETE FROM connections WHERE user_a = ? AND user_b = ? AND status <> 'blocked'", [a, b]);
  res.status(204).end();
});

router.post('/:userId/block', async (req, res) => {
  const target = targetFrom(req);
  await transaction(async (conn) => {
    const { a, b, row } = await lockPair(conn, req.userId, target);
    if (!row) {
      await conn.execute(
        "INSERT INTO connections (user_a, user_b, status, requested_by) VALUES (?, ?, 'blocked', ?)",
        [a, b, req.userId]
      );
    } else if (!(row.status === 'blocked' && row.requested_by !== req.userId)) {
      // Keep an existing block by the other side as it is; otherwise the
      // pair becomes "blocked by me".
      await conn.execute(
        "UPDATE connections SET status = 'blocked', requested_by = ? WHERE user_a = ? AND user_b = ?",
        [req.userId, a, b]
      );
    }
  });
  res.status(204).end();
});

router.delete('/:userId/block', async (req, res) => {
  const target = targetFrom(req);
  const [a, b] = pairOf(req.userId, target);
  await query(
    "DELETE FROM connections WHERE user_a = ? AND user_b = ? AND status = 'blocked' AND requested_by = ?",
    [a, b, req.userId]
  );
  res.status(204).end();
});

module.exports = router;
