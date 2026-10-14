// Loads database/seeds/*.sql into a DEVELOPMENT database. Refuses to run
// when NODE_ENV is production.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DIR = path.join(__dirname, '..', '..', 'database', 'seeds');

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.example).');
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true, charset: 'utf8mb4' });
  try {
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
      process.stdout.write(`Seeding ${file} ... `);
      await conn.query(fs.readFileSync(path.join(DIR, file), 'utf8'));
      console.log('done');
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
