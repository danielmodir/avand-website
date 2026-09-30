const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query('select * from habits where user_id = $1 order by created_at', [req.userId]);
  const ids = rows.map((r) => r.id);
  const completions = ids.length
    ? (await pool.query('select habit_id, completed_date from habit_completions where habit_id = any($1)', [ids])).rows
    : [];
  res.json(rows.map((h) => ({
    ...h,
    completed_dates: completions.filter((c) => c.habit_id === h.id).map((c) => c.completed_date),
  })));
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.start_date) return res.status(400).json({ error: 'title and start_date are required' });

  const { rows } = await pool.query(
    `insert into habits (
       user_id, title, start_date, recurrence_mode, recurrence_interval, recurrence_weekdays,
       notification_type, notification_time, notification_repeat_hours, notification_text
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [
      req.userId, b.title, b.start_date,
      b.recurrence_mode ?? 'interval', b.recurrence_interval ?? 1, b.recurrence_weekdays ?? [],
      b.notification_type ?? null, b.notification_time ?? null,
      b.notification_repeat_hours ?? null, b.notification_text ?? '',
    ]
  );
  res.status(201).json({ ...rows[0], completed_dates: [] });
});

router.patch('/:id', async (req, res) => {
  const allowed = [
    'title', 'start_date', 'recurrence_mode', 'recurrence_interval', 'recurrence_weekdays',
    'notification_type', 'notification_time', 'notification_repeat_hours', 'notification_text',
  ];
  const updates = Object.keys(req.body || {}).filter((k) => allowed.includes(k));
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields provided' });

  const setClause = updates.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = updates.map((f) => req.body[f]);
  const { rows } = await pool.query(
    `update habits set ${setClause} where id = $1 and user_id = $2 returning *`,
    [req.params.id, req.userId, ...values]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Habit not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('delete from habits where id = $1 and user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Habit not found' });
  res.status(204).end();
});

// Toggling a single day's check-in — matches the UI's tap-to-toggle exactly.
router.put('/:id/completions/:date', async (req, res) => {
  const owner = await pool.query('select 1 from habits where id = $1 and user_id = $2', [req.params.id, req.userId]);
  if (owner.rowCount === 0) return res.status(404).json({ error: 'Habit not found' });

  await pool.query(
    `insert into habit_completions (habit_id, completed_date) values ($1, $2)
     on conflict (habit_id, completed_date) do nothing`,
    [req.params.id, req.params.date]
  );
  res.status(204).end();
});

router.delete('/:id/completions/:date', async (req, res) => {
  await pool.query('delete from habit_completions where habit_id = $1 and completed_date = $2', [req.params.id, req.params.date]);
  res.status(204).end();
});

module.exports = router;
