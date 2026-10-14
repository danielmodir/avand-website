const express = require('express');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { toColumns, fromRow } = require('../utils/mapper');
const { HttpError } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

const fields = {
  firstName: { col: 'first_name', max: 100 },
  lastName:  { col: 'last_name', max: 100 },
  username:  { col: 'username', max: 50 },
  phone:     { col: 'phone', max: 30 },
  gender:    { col: 'gender', oneOf: ['male', 'female'] },
  dob:       { col: 'dob', type: 'date' },
  photo:     { col: 'photo_url' },
};

router.get('/', async (req, res) => {
  const rows = await query(
    `SELECT p.user_id AS id, u.email, ${Object.values(fields).map((f) => 'p.' + f.col).join(', ')}
     FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?`,
    [req.userId]
  );
  if (!rows[0]) throw new HttpError(404, 'Profile not found');
  res.json({ ...fromRow(rows[0], fields), email: rows[0].email });
});

router.patch('/', async (req, res) => {
  const body = { ...(req.body || {}) };
  if (body.gender === '') body.gender = null;       // client uses '' for "not set"
  if (body.username === '') body.username = null;
  if (body.username && !/^[a-z0-9_.]{3,50}$/i.test(body.username)) {
    throw new HttpError(400, 'Username may only contain letters, digits, _ and .');
  }
  const cols = toColumns(body, fields);
  const names = Object.keys(cols);
  if (names.length === 0) throw new HttpError(400, 'No valid fields provided');
  try {
    await query(
      `UPDATE profiles SET ${names.map((c) => `${c} = ?`).join(', ')} WHERE user_id = ?`,
      [...names.map((c) => cols[c]), req.userId]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Username is taken');
    throw err;
  }
  res.status(204).end();
});

module.exports = router;
