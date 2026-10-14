// Applies every database/migrations/*.sql file that has not run yet, in
// file-name order, and records each one in schema_migrations.
//
// MySQL commits DDL implicitly, so a migration cannot be rolled back as a
// whole: if one fails halfway, fix the database by hand, then re-run.
// Keep each file small and never edit one that has already been applied;
// add a new numbered file instead.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DIR = path.join(__dirname, '..', '..', 'database', 'migrations');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.example).');
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true, charset: 'utf8mb4' });
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [done] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(done.map((r) => r.name));

    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      process.stdout.write(`Applying ${file} ... `);
      await conn.query(fs.readFileSync(path.join(DIR, file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log('done');
      count++;
    }
    console.log(count ? `${count} migration(s) applied.` : 'Database is up to date.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
