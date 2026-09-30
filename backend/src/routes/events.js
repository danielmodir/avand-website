const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query('select * from events where user_id = $1 order by date', [req.userId]);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.date) return res.status(400).json({ error: 'title and date are required' });

  const { rows } = await pool.query(
    `insert into events (
       user_id, title, time_mode, date, end_date,
       recurrence_mode, recurrence_interval, recurrence_weekdays,
       notification_type, notification_time, notification_repeat_hours, notification_text
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [
      req.userId, b.title, b.time_mode ?? 'single', b.date, b.end_date ?? null,
      b.recurrence_mode ?? null, b.recurrence_interval ?? 1, b.recurrence_weekdays ?? [],
      b.notification_type ?? null, b.notification_time ?? null,
      b.notification_repeat_hours ?? null, b.notification_text ?? '',
    ]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const allowed = [
    'title', 'time_mode', 'date', 'end_date',
    'recurrence_mode', 'recurrence_interval', 'recurrence_weekdays',
    'notification_type', 'notification_time', 'notification_repeat_hours', 'notification_text',
  ];
  const updates = Object.keys(req.body || {}).filter((k) => allowed.includes(k));
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields provided' });

  const setClause = updates.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = updates.map((f) => req.body[f]);
  const { rows } = await pool.query(
    `update events set ${setClause} where id = $1 and user_id = $2 returning *`,
    [req.params.id, req.userId, ...values]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Event not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('delete from events where id = $1 and user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Event not found' });
  res.status(204).end();
});

module.exports = router;
