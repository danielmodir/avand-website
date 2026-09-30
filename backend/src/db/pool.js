const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env and point it at a real Postgres instance.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
