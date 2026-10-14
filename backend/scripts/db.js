#!/usr/bin/env node
// Database tooling for the per-module MySQL databases in ../../database/.
//
//   node scripts/db.js setup     create databases + MySQL users (needs DB_ADMIN_*)
//   node scripts/db.js migrate   apply pending migrations in every module
//   node scripts/db.js status    list applied / pending migrations
//   node scripts/db.js seed      load development seeds (refuses in production)
//
// Every folder in database/ that has a migrations/ subfolder is a module;
// its database is toojibee_<folder>. core always runs first.
//
// SQL files may use the mysql client's DELIMITER command (needed for
// triggers), so they work the same here, in the mysql CLI and in
// Workbench. Applied migrations are recorded with a SHA-256 checksum; an
// applied file that was edited afterwards stops the run instead of being
// silently skipped.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..', '..', 'database');
const DB_PREFIX = 'toojibee_';

// ---------------------------------------------------------------- config
function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} is not set (see backend/.env.example).`);
  }
  return v;
}

function connectionOptions(user, password, database) {
  return {
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', '3306')),
    user,
    password,
    database,
    charset: 'utf8mb4',
    timezone: 'Z',
    ssl: env('DB_SSL', 'false') === 'true' ? { rejectUnauthorized: true } : undefined,
  };
}

function modules() {
  const names = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, d.name, 'migrations')))
    .map((d) => d.name);
  for (const name of names) {
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(name)) throw new Error(`Invalid module folder name: ${name}`);
  }
  return names.sort((a, b) => (a === 'core' ? -1 : b === 'core' ? 1 : a.localeCompare(b)));
}

const sqlFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : []);

// ---------------------------------------------------------------- SQL splitting
// Splits a script into statements, honoring quotes, comments and
// DELIMITER lines, so trigger bodies (which contain ';') stay whole.
function splitSql(text) {
  const statements = [];
  let delimiter = ';';
  let buf = '';
  let i = 0;
  const atLineStart = () => buf.trim() === '' ;
  while (i < text.length) {
    // DELIMITER command: only valid at the start of a statement
    if (atLineStart() && (i === 0 || text[i - 1] === '\n')) {
      const m = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*\r?(\n|$)/i.exec(text.slice(i));
      if (m) { delimiter = m[1]; buf = ''; i += m[0].length; continue; }
    }
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '-' && next === '-' && /\s/.test(text[i + 2] || ' ')) { const e = text.indexOf('\n', i); i = e === -1 ? text.length : e + 1; buf += '\n'; continue; }
    if (ch === '#') { const e = text.indexOf('\n', i); i = e === -1 ? text.length : e + 1; buf += '\n'; continue; }
    if (ch === '/' && next === '*') { const e = text.indexOf('*/', i + 2); i = e === -1 ? text.length : e + 2; buf += ' '; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\' && ch !== '`') { j += 2; continue; }
        if (text[j] === ch) { if (text[j + 1] === ch) { j += 2; continue; } break; }
        j++;
      }
      buf += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (text.startsWith(delimiter, i)) {
      if (buf.trim()) statements.push(buf.trim());
      buf = '';
      i += delimiter.length;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) statements.push(buf.trim());
  return statements;
}

async function runScript(conn, file) {
  for (const stmt of splitSql(fs.readFileSync(file, 'utf8'))) {
    try {
      await conn.query(stmt);
    } catch (err) {
      err.message = `${path.relative(ROOT, file)}: ${err.message}\n--- statement ---\n${stmt.slice(0, 400)}`;
      throw err;
    }
  }
}

async function openModule(mod) {
  const conn = await mysql.createConnection(connectionOptions(env('DB_MIGRATOR_USER', 'tj_migrator'), env('DB_MIGRATOR_PASSWORD'), DB_PREFIX + mod));
  await conn.query("SET time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY'");
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name        VARCHAR(255) NOT NULL PRIMARY KEY,
    checksum    CHAR(64)     NOT NULL,
    applied_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  return conn;
}

// Line endings are normalized first: Git may check SQL files out with CRLF
// on Windows and LF on the server, which must not count as an edit.
const checksum = (file) => crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');

// ---------------------------------------------------------------- commands
async function setup() {
  const admin = await mysql.createConnection(connectionOptions(env('DB_ADMIN_USER'), env('DB_ADMIN_PASSWORD')));
  const host = env('DB_CLIENT_HOST', 'localhost'); // where the API connects from
  const requireSsl = env('DB_SSL', 'false') === 'true' ? ' REQUIRE SSL' : '';
  const user = async (name, password) => {
    const account = `${admin.escape(name)}@${admin.escape(host)}`;
    await admin.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${admin.escape(password)}${requireSsl}`);
    await admin.query(`ALTER USER ${account} IDENTIFIED BY ${admin.escape(password)}${requireSsl}`);
    return account;
  };
  try {
    const migrator = await user(env('DB_MIGRATOR_USER', 'tj_migrator'), env('DB_MIGRATOR_PASSWORD'));
    for (const mod of modules()) {
      const db = DB_PREFIX + mod;
      await admin.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER, CREATE VIEW, SHOW VIEW ON \`${db}\`.* TO ${migrator}`);
      // The API's account for this module: data only, this database only.
      const app = await user(`tj_${mod}`, env(`DB_${mod.toUpperCase()}_PASSWORD`));
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${db}\`.* TO ${app}`);
      console.log(`${db}: database and tj_${mod} user ready`);
    }
  } finally {
    await admin.end();
  }
}

async function migrate({ dryRun = false } = {}) {
  let total = 0;
  for (const mod of modules()) {
    const conn = await openModule(mod);
    try {
      const [rows] = await conn.query('SELECT name, checksum FROM schema_migrations');
      const applied = new Map(rows.map((r) => [r.name, r.checksum]));
      for (const file of sqlFiles(path.join(ROOT, mod, 'migrations'))) {
        const full = path.join(ROOT, mod, 'migrations', file);
        const sum = checksum(full);
        if (applied.has(file)) {
          if (applied.get(file) !== sum) {
            throw new Error(`${mod}/migrations/${file} was changed after it was applied. Add a new migration instead.`);
          }
          continue;
        }
        if (dryRun) { console.log(`pending  ${mod}/${file}`); total++; continue; }
        process.stdout.write(`applying ${mod}/${file} ... `);
        await runScript(conn, full);
        await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [file, sum]);
        console.log('done');
        total++;
      }
      if (dryRun) for (const name of applied.keys()) console.log(`applied  ${mod}/${name}`);
    } finally {
      await conn.end();
    }
  }
  if (!dryRun) console.log(total ? `${total} migration(s) applied.` : 'All databases are up to date.');
}

async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to load development seeds with NODE_ENV=production.');
  for (const mod of modules()) {
    const files = sqlFiles(path.join(ROOT, mod, 'seeds')).filter((f) => f.startsWith('dev_'));
    if (!files.length) continue;
    const conn = await openModule(mod);
    try {
      for (const file of files) {
        process.stdout.write(`seeding ${mod}/${file} ... `);
        await runScript(conn, path.join(ROOT, mod, 'seeds', file));
        console.log('done');
      }
    } finally {
      await conn.end();
    }
  }
}

const commands = { setup, migrate, seed, status: () => migrate({ dryRun: true }) };
const cmd = process.argv[2];

if (require.main === module) {
  if (!commands[cmd]) {
    console.error(`Usage: node scripts/db.js <${Object.keys(commands).join('|')}>`);
    process.exit(1);
  }
  commands[cmd]().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { splitSql, modules };
