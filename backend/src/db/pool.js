const mysql = require('mysql2/promise');
const env = require('../config/env');

const pool = mysql.createPool({
  uri: env.databaseUrl,
  charset: 'utf8mb4',
  connectionLimit: 10,
  // DATE/DATETIME come back as 'YYYY-MM-DD' strings, the same format the
  // client keeps in memory, instead of JS Dates shifted by the server's
  // timezone.
  dateStrings: true,
  // BOOLEAN is TINYINT(1) in MySQL; hand the client real true/false.
  typeCast(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      const v = field.string();
      return v === null ? null : v === '1';
    }
    return next();
  },
});

/** Runs one statement and returns its rows (or the OkPacket for writes). */
async function query(sql, params) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/** Runs fn(conn) inside a transaction on one pooled connection. */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, transaction };
