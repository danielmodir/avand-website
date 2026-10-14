// Shared CRUD for the three item kinds (tasks, habits, events). The client
// creates ids itself and saves whole objects, so writes are a single
// upsert: PUT /:id inserts the row if it is new, or updates the fields
// that were sent if it already belongs to this user.
const express = require('express');
const { query, transaction } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { toColumns, fromRow } = require('../utils/mapper');
const { HttpError, assertUuid } = require('../utils/http');

function itemRouter({ table, fields, required, orderBy, validate }) {
  const router = express.Router();
  router.use(requireAuth);
  const select = `SELECT id, ${Object.values(fields).map((f) => f.col).join(', ')} FROM ${table}`;

  router.get('/', async (req, res) => {
    const rows = await query(`${select} WHERE user_id = ? ORDER BY ${orderBy}`, [req.userId]);
    res.json(rows.map((r) => fromRow(r, fields)));
  });

  router.put('/:id', async (req, res) => {
    assertUuid(req.params.id);
    const body = req.body || {};
    if (validate) validate(body); // may normalize body (e.g. drop a stale endDate), so it runs first
    const cols = toColumns(body, fields);

    const saved = await transaction(async (conn) => {
      const [existing] = await conn.execute(`SELECT user_id FROM ${table} WHERE id = ? FOR UPDATE`, [req.params.id]);
      if (existing.length && existing[0].user_id !== req.userId) throw new HttpError(404, 'Not found');

      if (existing.length) {
        const names = Object.keys(cols);
        if (names.length === 0) throw new HttpError(400, 'No valid fields provided');
        await conn.execute(
          `UPDATE ${table} SET ${names.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
          [...names.map((c) => cols[c]), req.params.id, req.userId]
        );
      } else {
        for (const key of required) {
          if (body[key] === undefined || body[key] === null || body[key] === '') throw new HttpError(400, `${key} is required`);
        }
        const names = ['id', 'user_id', ...Object.keys(cols)];
        await conn.execute(
          `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
          [req.params.id, req.userId, ...Object.values(cols)]
        );
      }
      const [rows] = await conn.execute(`${select} WHERE id = ?`, [req.params.id]);
      return { created: !existing.length, item: fromRow(rows[0], fields) };
    });
    res.status(saved.created ? 201 : 200).json(saved.item);
  });

  router.delete('/:id', async (req, res) => {
    assertUuid(req.params.id);
    const result = await query(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (result.affectedRows === 0) throw new HttpError(404, 'Not found');
    res.status(204).end();
  });

  return router;
}

module.exports = { itemRouter };
