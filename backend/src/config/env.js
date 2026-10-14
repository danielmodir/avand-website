// Reads and validates configuration once at startup, so a missing secret
// fails loudly here instead of as a confusing error on the first request.
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}

const env = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  port: Number(process.env.PORT) || 4000,
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  sessionDays: Number(process.env.SESSION_DAYS) || 30,
};

if (env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

module.exports = env;
