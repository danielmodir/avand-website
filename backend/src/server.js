const app = require('./app');
const env = require('./config/env');
const { pool } = require('./db/pool');

const server = app.listen(env.port, () => console.log(`Toojibee API listening on :${env.port}`));

// Finish in-flight requests and close DB connections on shutdown
// (Ctrl+C locally, SIGTERM from a process manager or container).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  });
}
