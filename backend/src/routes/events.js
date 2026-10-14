const { itemRouter } = require('./itemRouter');

const fields = {
  title:        { col: 'title', max: 500 },
  timeMode:     { col: 'time_mode', oneOf: ['single', 'range'] },
  date:         { col: 'date', type: 'date' },
  endDate:      { col: 'end_date', type: 'date' },
  recurrence:   { col: 'recurrence', type: 'json' },
  notification: { col: 'notification', type: 'json' },
};

module.exports = itemRouter({
  table: 'events',
  fields,
  required: ['title', 'date'],
  orderBy: 'date ASC',
  validate(body) {
    if (body.timeMode === 'single') body.endDate = null;
  },
});
