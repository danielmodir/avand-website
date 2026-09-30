require('dotenv').config();
require('express-async-errors'); // lets the async route handlers below just `throw`/reject

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const settingsRoutes = require('./routes/settings');
const taskRoutes = require('./routes/tasks');
const habitRoutes = require('./routes/habits');
const eventRoutes = require('./routes/events');

const app = express();

app.use(cors({ origin: (process.env.CORS_ORIGIN || '').split(',').filter(Boolean) }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/events', eventRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Avand API listening on :${port}`));
