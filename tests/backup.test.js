// Import / export (frontend/demo/js/core/backup.js). Run: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const { buildIcs, parseIcs, parseBackup, planImport } = require('../frontend/demo/js/core/backup.js');

let n = 0;
const id = () => 'id' + (++n);
const rec = (mode, extra) => Object.assign({ mode, interval: 1, weekdays: [], anchor: null, cal: null }, extra);
const data = {
  events: [
    { id: 'e1', title: 'Doctor, 2nd floor; room 4', description: 'line1\nline2', timeMode: 'single', date: '2026-11-03', startTime: '09:30', endTime: '10:15', recurrence: rec(null) },
    { id: 'e2', title: 'تولد سارا', kind: 'birthday', timeMode: 'single', date: '2000-11-05', recurrence: rec('yearly', { anchor: '2000-11-05', cal: 'jalali' }) },
  ],
  tasks: [{ id: 't1', title: 'Trip', timeMode: 'range', date: '2026-12-01', endDate: '2026-12-03', recurrence: rec(null) }],
  habits: [{ id: 'h1', title: 'Read', startDate: '2026-10-01', recurrence: rec('weekdays', { weekdays: [6, 1, 3] }) }],
};

test('ics round trip keeps titles, days, times, repeats and kinds', () => {
  const ics = buildIcs(data, '20261027T000000Z');
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.ok(ics.split('\r\n').every(l => l.length <= 75), 'folded lines');
  const back = parseIcs(ics, id);
  assert.strictEqual(back.events.length, 2);
  const doc = back.events[0];
  assert.deepStrictEqual([doc.title, doc.description, doc.date, doc.startTime, doc.endTime], ['Doctor, 2nd floor; room 4', 'line1\nline2', '2026-11-03', '09:30', '10:15']);
  const bday = back.events[1];
  assert.deepStrictEqual([bday.kind, bday.recurrence.mode, bday.date], ['birthday', 'yearly', '2000-11-05']);
  assert.deepStrictEqual([back.tasks[0].timeMode, back.tasks[0].date, back.tasks[0].endDate], ['range', '2026-12-01', '2026-12-03']);
  assert.deepStrictEqual(back.habits[0].recurrence.weekdays.sort(), [1, 3, 6]);
});

test('ics from another app: UTC times, all-day, daily repeat', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Standup\r\nDTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261103\r\nRRULE:FREQ=DAILY;INTERVAL=2\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:No date\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const back = parseIcs(ics, id);
  assert.strictEqual(back.events.length, 1, 'an event without a start is skipped');
  assert.deepStrictEqual([back.events[0].date, back.events[0].endDate, back.events[0].recurrence.mode, back.events[0].recurrence.interval], ['2026-11-02', null, 'interval', 2]);
});

test('json backup: only real backups, no group items', () => {
  assert.strictEqual(parseBackup('{"app":"x"}'), null);
  assert.strictEqual(parseBackup('not json'), null);
  const b = parseBackup(JSON.stringify({ app: 'Toojibee', kind: 'backup', tasks: [{ id: 'a', title: 'A' }, { id: 'g', title: 'G', groupId: 'x' }, { title: 'no id' }], period: { enabled: true } }));
  assert.deepStrictEqual(b.tasks.map(x => x.id), ['a']);
  assert.deepStrictEqual(b.period, { enabled: true });
});

test('import skips duplicates by id and by title + day', () => {
  const have = { tasks: [{ id: 'a', title: 'A', date: '2026-11-01' }], habits: [], events: [{ id: 'e', title: 'Party', date: '2026-11-05' }] };
  const incoming = { tasks: [{ id: 'a', title: 'A', date: '2026-11-01' }, { id: 'b', title: 'B', date: '2026-11-01' }, { id: 'b2', title: 'B', date: '2026-11-01' }],
    habits: [], events: [{ id: 'x', title: 'Party ', date: '2026-11-05' }] };
  const plan = planImport(have, incoming);
  assert.deepStrictEqual(plan.tasks.map(x => x.id), ['b']);
  assert.strictEqual(plan.events.length, 0);
  assert.strictEqual(plan.dup, 3);
});
