// Converts between the client's camelCase objects and table rows.
//
// A field map looks like { endDate: { col: 'end_date', type: 'date' } }.
// Types: 'string' (default), 'bool', 'date', 'json'. JSON columns are
// stringified on the way in; mysql2 already parses them on the way out.
const { HttpError, DATE_RE } = require('./http');

function toColumns(obj, fields) {
  const cols = {};
  for (const [key, def] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    let v = obj[key];
    switch (def.type) {
      case 'bool':
        v = Boolean(v);
        break;
      case 'date':
        if (v === '' || v === undefined) v = null;
        if (v !== null && !DATE_RE.test(v)) throw new HttpError(400, `${key} must be YYYY-MM-DD`);
        break;
      case 'json':
        v = v === undefined ? null : JSON.stringify(v);
        break;
      default:
        if (v !== null && typeof v !== 'string') throw new HttpError(400, `${key} must be a string`);
        if (def.max && v && v.length > def.max) throw new HttpError(400, `${key} is too long`);
        if (def.oneOf && v !== null && !def.oneOf.includes(v)) throw new HttpError(400, `Invalid ${key}`);
    }
    cols[def.col] = v;
  }
  return cols;
}

function fromRow(row, fields) {
  const obj = { id: row.id };
  for (const [key, def] of Object.entries(fields)) obj[key] = row[def.col];
  return obj;
}

module.exports = { toColumns, fromRow };
