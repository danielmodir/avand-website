const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const FIELDS = [
  'language', 'calendar_system', 'week_start_day',
  'notifications_enabled', 'show_add_menu_labels', 'theme'
];

router.get('/', async (req, res) => {
  const { rows } = await pool.query('select * from user_settings where user_id = $1', [req.userId]);
  res.json(rows[0]);
});

router.patch('/', async (req, res) => {
  const updates = Object.keys(req.body || {}).filter((k) => FIELDS.includes(k));
  if (updates.length === 0) return res.status(400).json({ error: 'No valid settings fields provided' });

  const setClause = updates.map((field, i) => `${field} = $${i + 2}`).join(', ');
  const values = updates.map((field) => req.body[field]);
  const { rows } = await pool.query(
    `update user_settings set ${setClause}, updated_at = now() where user_id = $1 returning *`,
    [req.userId, ...values]
  );
  res.json(rows[0]);
});

module.exports = router;
