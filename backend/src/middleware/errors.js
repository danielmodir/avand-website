const { HttpError } = require('../utils/http');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(400).json({ error: 'Invalid field combination' });
  if (err.code === 'ER_TRUNCATED_WRONG_VALUE' || err.code === 'WARN_DATA_TRUNCATED') {
    return res.status(400).json({ error: 'Invalid field value' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
