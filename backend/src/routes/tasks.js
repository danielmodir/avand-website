const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const MAX_SUBTASKS = 3;
const MAX_PHOTOS = 3;

async function loadTask(client, userId, taskId) {
  const { rows } = await client.query('select * from tasks where id = $1 and user_id = $2', [taskId, userId]);
  if (rows.length === 0) return null;
  const task = rows[0];
  const [subtasks, photos] = await Promise.all([
    client.query('select id, text, done from task_subtasks where task_id = $1 order by position', [taskId]),
    client.query('select id, url from task_photos where task_id = $1 order by position', [taskId]),
  ]);
  task.subtasks = subtasks.rows;
  task.photos = photos.rows;
  return task;
}

// ?date=YYYY-MM-DD narrows to tasks whose [date, end_date] window covers it
// (recurrence expansion — interval/weekdays — stays client-side, same as
// the prototype's occursOnDate(), since it's cheap and date-range-bound).
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'select * from tasks where user_id = $1 order by pinned desc, done, created_at desc',
    [req.userId]
  );
  const ids = rows.map((r) => r.id);
  const [subtasks, photos] = await Promise.all([
    ids.length
      ? pool.query('select * from task_subtasks where task_id = any($1) order by position', [ids])
      : { rows: [] },
    ids.length
      ? pool.query('select * from task_photos where task_id = any($1) order by position', [ids])
      : { rows: [] },
  ]);
  const byTask = (list, taskId) => list.filter((r) => r.task_id === taskId);
  res.json(rows.map((t) => ({
    ...t,
    subtasks: byTask(subtasks.rows, t.id).map(({ id, text, done }) => ({ id, text, done })),
    photos: byTask(photos.rows, t.id).map(({ id, url }) => ({ id, url })),
  })));
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.date) return res.status(400).json({ error: 'title and date are required' });

  const { rows } = await pool.query(
    `insert into tasks (
       user_id, category_id, title, description, pinned, time_mode, date, end_date,
       recurrence_mode, recurrence_interval, recurrence_weekdays,
       notification_type, notification_time, notification_repeat_hours, notification_text
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     returning *`,
    [
      req.userId, b.category_id ?? null, b.title, b.description ?? '', b.pinned ?? false,
      b.time_mode ?? 'single', b.date, b.end_date ?? null,
      b.recurrence_mode ?? null, b.recurrence_interval ?? 1, b.recurrence_weekdays ?? [],
      b.notification_type ?? null, b.notification_time ?? null,
      b.notification_repeat_hours ?? null, b.notification_text ?? '',
    ]
  );
  const task = rows[0];
  task.subtasks = [];
  task.photos = [];
  res.status(201).json(task);
});

router.patch('/:id', async (req, res) => {
  const allowed = [
    'category_id', 'title', 'description', 'pinned', 'done', 'time_mode', 'date', 'end_date',
    'recurrence_mode', 'recurrence_interval', 'recurrence_weekdays',
    'notification_type', 'notification_time', 'notification_repeat_hours', 'notification_text',
  ];
  const updates = Object.keys(req.body || {}).filter((k) => allowed.includes(k));
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields provided' });

  const setClause = updates.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = updates.map((f) => req.body[f]);
  const { rows } = await pool.query(
    `update tasks set ${setClause} where id = $1 and user_id = $2 returning *`,
    [req.params.id, req.userId, ...values]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
  res.json(await loadTask(pool, req.userId, req.params.id));
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('delete from tasks where id = $1 and user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});

router.post('/:id/subtasks', async (req, res) => {
  const owner = await pool.query('select 1 from tasks where id = $1 and user_id = $2', [req.params.id, req.userId]);
  if (owner.rowCount === 0) return res.status(404).json({ error: 'Task not found' });

  const { count } = (await pool.query('select count(*)::int from task_subtasks where task_id = $1', [req.params.id])).rows[0];
  if (count >= MAX_SUBTASKS) return res.status(422).json({ error: `A task can have at most ${MAX_SUBTASKS} subtasks` });

  const { rows } = await pool.query(
    'insert into task_subtasks (task_id, text, position) values ($1, $2, $3) returning id, text, done',
    [req.params.id, req.body?.text || '', count]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id/subtasks/:subtaskId', async (req, res) => {
  const { rows } = await pool.query(
    `update task_subtasks set text = coalesce($3, text), done = coalesce($4, done)
     where id = $1 and task_id = $2 returning id, text, done`,
    [req.params.subtaskId, req.params.id, req.body?.text ?? null, req.body?.done ?? null]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Subtask not found' });
  res.json(rows[0]);
});

router.delete('/:id/subtasks/:subtaskId', async (req, res) => {
  await pool.query('delete from task_subtasks where id = $1 and task_id = $2', [req.params.subtaskId, req.params.id]);
  res.status(204).end();
});

router.post('/:id/photos', async (req, res) => {
  if (!req.body?.url) return res.status(400).json({ error: 'url is required (upload storage is out of scope here)' });
  const owner = await pool.query('select 1 from tasks where id = $1 and user_id = $2', [req.params.id, req.userId]);
  if (owner.rowCount === 0) return res.status(404).json({ error: 'Task not found' });

  const { count } = (await pool.query('select count(*)::int from task_photos where task_id = $1', [req.params.id])).rows[0];
  if (count >= MAX_PHOTOS) return res.status(422).json({ error: `A task can have at most ${MAX_PHOTOS} photos` });

  const { rows } = await pool.query(
    'insert into task_photos (task_id, url, position) values ($1, $2, $3) returning id, url',
    [req.params.id, req.body.url, count]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id/photos/:photoId', async (req, res) => {
  await pool.query('delete from task_photos where id = $1 and task_id = $2', [req.params.photoId, req.params.id]);
  res.status(204).end();
});

module.exports = router;
