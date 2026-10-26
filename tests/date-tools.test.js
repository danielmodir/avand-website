// Date tools (frontend/demo/js/core/date-tools.js) with the app's own
// calendars (calendars.js, official Hijri month table). Run: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'frontend');
const ctx = vm.createContext({ state: { settings: { calendarSystem: 'jalali' } }, lang: () => 'fa', console,
  parseDateKey: k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); },
  addDays: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; } }); // util.js's
for (const f of ['demo/js/core/calendars.js', 'demo/js/core/date-tools.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8').replace(/if\(typeof module[^\n]*\n/, ''), ctx, { filename: f });
}
const hijriRows = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/hijri-months.json'), 'utf8'));
vm.runInContext('setHijriMonthStarts(rows)', Object.assign(ctx, { rows: hijriRows.months || hijriRows }));
const tools = vm.runInContext('({ convertDate, dateSpan })', ctx);
const convertDate = tools.convertDate;
const dateSpan = (a, b) => JSON.parse(JSON.stringify(tools.dateSpan(a, b))); // a plain object from the other realm
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('Solar Hijri to Gregorian', () => {
  assert.strictEqual(key(convertDate('jalali', 1405, 8, 5)), '2026-10-27');
  assert.strictEqual(key(convertDate('jalali', 1406, 1, 1)), '2027-03-21');
  assert.strictEqual(key(convertDate('jalali', 1379, 8, 15)), '2000-11-05');
});

test('lunar Hijri (official table) to Gregorian', () => {
  // 16 Jumada I 1448 = 27 Oct 2026 (bahesab.ir, the same day as above).
  assert.strictEqual(key(convertDate('hijri', 1448, 5, 16)), '2026-10-27');
});

test('Gregorian stays itself; impossible days are null', () => {
  assert.strictEqual(key(convertDate('gregorian', 2026, 10, 27)), '2026-10-27');
  assert.strictEqual(convertDate('gregorian', 2026, 2, 30), null);
  assert.strictEqual(convertDate('jalali', 1404, 12, 31), null); // 1404 isn't a leap year
  assert.strictEqual(convertDate('jalali', 1405, 13, 1), null);
  assert.strictEqual(convertDate('jalali', '', 1, 1), null);
});

test('span between two dates', () => {
  assert.deepStrictEqual(dateSpan(new Date(2026, 9, 27), new Date(2026, 9, 27)), { days: 0, y: 0, m: 0, d: 0 });
  assert.deepStrictEqual(dateSpan(new Date(2000, 10, 5), new Date(2026, 9, 27)), { days: 9487, y: 25, m: 11, d: 22 });
  assert.deepStrictEqual(dateSpan(new Date(2026, 9, 27), new Date(2000, 10, 5)), dateSpan(new Date(2000, 10, 5), new Date(2026, 9, 27)));
  assert.deepStrictEqual(dateSpan(new Date(2024, 0, 31), new Date(2024, 2, 1)), { days: 30, y: 0, m: 1, d: 1 });
});
