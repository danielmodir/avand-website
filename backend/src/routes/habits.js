const { itemRouter } = require('./itemRouter');
const { HttpError, DATE_RE } = require('../utils/http');

const fields = {
  title:          { col: 'title', max: 500 },
  startDate:      { col: 'start_date', type: 'date' },
  recurrence:     { col: 'recurrence', type: 'json' },
  notification:   { col: 'notification', type: 'json' },
  completedDates: { col: 'completed_dates', type: 'json' },
  skippedDates:   { col: 'skipped_dates', type: 'json' },
};

function validate(body) {
  for (const key of ['completedDates', 'skippedDates']) {
    if (body[key] === undefined) continue;
    if (!Array.isArray(body[key]) || !body[key].every((d) => typeof d === 'string' && DATE_RE.test(d))) {
      throw new HttpError(400, `${key} must be an array of YYYY-MM-DD dates`);
    }
  }
}

module.exports = itemRouter({
  table: 'habits',
  fields,
  required: ['title', 'startDate'],
  orderBy: 'created_at ASC',
  validate,
});
