const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `select
       u.id, u.email, u.name, u.avatar_url,
       (select count(*) from tasks where user_id = u.id and done) as tasks_done,
       (select count(*) from habits where user_id = u.id) as habit_count,
       (select count(*) from habit_completions hc
          join habits h on h.id = hc.habit_id where h.user_id = u.id) as checkins
     from users u where u.id = $1`,
    [req.userId]
  );
  res.json(rows[0]);
});

router.patch('/', async (req, res) => {
  const { name, avatar_url } = req.body || {};
  const { rows } = await pool.query(
    `update users set name = coalesce($2, name), avatar_url = coalesce($3, avatar_url)
     where id = $1 returning id, email, name, avatar_url`,
    [req.userId, name ?? null, avatar_url ?? null]
  );
  res.json(rows[0]);
});

// avatar_url = null explicitly removes the photo (falls back to initials in the UI)
router.delete('/avatar', async (req, res) => {
  await pool.query('update users set avatar_url = null where id = $1', [req.userId]);
  res.status(204).end();
});

module.exports = router;
