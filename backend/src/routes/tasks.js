const { itemRouter } = require('./itemRouter');
const { HttpError } = require('../utils/http');

const MAX_SUBTASKS = 20;
const MAX_PHOTOS = 3;

const fields = {
  title:        { col: 'title', max: 500 },
  category:     { col: 'category', max: 100 },
  description:  { col: 'description', max: 20000 },
  pinned:       { col: 'pinned', type: 'bool' },
  done:         { col: 'done', type: 'bool' },
  skipped:      { col: 'skipped', type: 'bool' },
  timeMode:     { col: 'time_mode', oneOf: ['single', 'range'] },
  date:         { col: 'date', type: 'date' },
  endDate:      { col: 'end_date', type: 'date' },
  subtasks:     { col: 'subtasks', type: 'json' },
  photos:       { col: 'photos', type: 'json' },
  recurrence:   { col: 'recurrence', type: 'json' },
  notification: { col: 'notification', type: 'json' },
};

function validate(body) {
  if (body.subtasks !== undefined) {
    if (!Array.isArray(body.subtasks) || body.subtasks.length > MAX_SUBTASKS) {
      throw new HttpError(400, `subtasks must be an array of at most ${MAX_SUBTASKS}`);
    }
    for (const s of body.subtasks) {
      if (!s || typeof s.id !== 'string' || typeof s.text !== 'string') throw new HttpError(400, 'Each subtask needs an id and text');
    }
  }
  if (body.photos !== undefined && (!Array.isArray(body.photos) || body.photos.length > MAX_PHOTOS)) {
    throw new HttpError(400, `photos must be an array of at most ${MAX_PHOTOS}`);
  }
  // A single-day task has no deadline; the client sometimes still carries
  // the last range's end date in memory.
  if (body.timeMode === 'single') body.endDate = null;
}

module.exports = itemRouter({
  table: 'tasks',
  fields,
  required: ['title', 'date'],
  orderBy: 'pinned DESC, created_at DESC',
  validate,
});
