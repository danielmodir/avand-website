const express = require('express');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { toColumns, fromRow } = require('../utils/mapper');
const { HttpError } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

const fields = {
  language:          { col: 'language', oneOf: ['fa', 'en'] },
  calendarSystem:    { col: 'calendar_system', oneOf: ['jalali', 'gregorian', 'hijri'] },
  weekStartDay:      { col: 'week_start_day', oneOf: ['saturday', 'sunday', 'monday'] },
  notifications:     { col: 'notifications', type: 'bool' },
  showAddMenuLabels: { col: 'show_add_menu_labels', type: 'bool' },
  theme:             { col: 'theme', oneOf: ['dark', 'light'] },
};

router.get('/', async (req, res) => {
  const rows = await query(
    `SELECT user_id AS id, ${Object.values(fields).map((f) => f.col).join(', ')} FROM user_settings WHERE user_id = ?`,
    [req.userId]
  );
  if (!rows[0]) throw new HttpError(404, 'Settings not found');
  const { id, ...settings } = fromRow(rows[0], fields);
  res.json(settings);
});

router.patch('/', async (req, res) => {
  const cols = toColumns(req.body || {}, fields);
  const names = Object.keys(cols);
  if (names.length === 0) throw new HttpError(400, 'No valid settings fields provided');
  await query(
    `UPDATE user_settings SET ${names.map((c) => `${c} = ?`).join(', ')} WHERE user_id = ?`,
    [...names.map((c) => cols[c]), req.userId]
  );
  res.status(204).end();
});

module.exports = router;
