// Builds the Express app without listening, so tests can mount it
// directly. src/server.js is the process entry point.
require('express-async-errors'); // lets async handlers just throw

const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: env.corsOrigins }));
// 6 MB: a task can carry up to three photos as data URLs.
app.use(express.json({ limit: '6mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/habits', require('./routes/habits'));
app.use('/api/events', require('./routes/events'));
app.use('/api/connections', require('./routes/connections'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
