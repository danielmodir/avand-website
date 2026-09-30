// One-shot: applies schema.sql to whatever DATABASE_URL points at.
// Not idempotent beyond Postgres's own "if not exists" guards in the SQL —
// fine for a fresh dev database, not a real migration tool.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema applied.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
