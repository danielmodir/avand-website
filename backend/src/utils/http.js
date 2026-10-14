/** An error that the error handler turns into `{ error: message }` with this status. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertUuid(value, what = 'id') {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new HttpError(400, `Invalid ${what}`);
}

module.exports = { HttpError, assertUuid, UUID_RE, DATE_RE };
