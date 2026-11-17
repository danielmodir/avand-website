const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../frontend/demo/js/core/occasions.js'), 'utf8');
const localKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const c = vm.createContext({
  state: { settings: { prefs: { occasionReminders: {} } } },
  dateKey: localKey,
  addDays: (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n),
  atTimeOn: (d, hm) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), ...hm.split(':').map(Number)).getTime(),
  t: key => key,
  dig: String,
});
vm.runInContext(source, c);

test('occasion identity stays stable when its official occurrence date changes', () => {
  const key = c.occasionRuleKey('hijri', 10, 1, 'عید');
  assert.equal(key, 'hijri:10:1:' + encodeURIComponent('عید'));
  assert.equal(key.includes('|'), false);
});

test('only enabled occasion reminders create slots at the chosen time and lead', () => {
  const key = c.occasionRuleKey('jalali', 1, 1, 'نوروز');
  c.state.settings.prefs.occasionReminders[key] = [
    { id: 'morning', daysBefore: 0, time: '10:30', enabled: true },
    { id: 'early', daysBefore: 7, time: '08:00', enabled: true },
    { id: 'off', daysBefore: 0, time: '09:00', enabled: false },
  ];
  c.occasionsForDate = d => localKey(d) === '2026-03-21'
    ? [{ key, event_name: 'نوروز' }] : [];
  const day = new Date(2026, 2, 21);
  const today = Array.from(c.occasionReminderSlots(day));
  assert.equal(today.length, 1);
  assert.equal(today[0].at, new Date(2026, 2, 21, 10, 30).getTime());
  assert.equal(today[0].date, '2026-03-21');
  assert.match(today[0].slot, /morning/);
  const early = Array.from(c.occasionReminderSlots(new Date(2026, 2, 14)));
  assert.equal(early.length, 1);
  assert.equal(early[0].date, '2026-03-21');
  assert.equal(early[0].at, new Date(2026, 2, 14, 8).getTime());
  c.state.settings.prefs.occasionReminders = {};
  assert.equal(c.occasionReminderSlots(day).length, 0);
});

test('Django settings mapping preserves nested reminder plans', () => {
  const api = fs.readFileSync(path.join(__dirname, '../frontend/demo/js/services/api.js'), 'utf8');
  const mapping = api.slice(api.indexOf('  function prefsFromApi('), api.indexOf('  function saveSettings('));
  const ctx = vm.createContext({});
  vm.runInContext(mapping, ctx);
  const key = c.occasionRuleKey('jalali', 1, 1, 'نوروز');
  const plan = { [key]: [{ id: 'one', daysBefore: 7, time: '09:30', enabled: true }] };
  const sent = ctx.prefsToApi({ occasionReminders: plan });
  assert.deepEqual(JSON.parse(JSON.stringify(sent.occasion_reminders[key][0])),
    { id: 'one', days_before: 7, time: '09:30', enabled: true });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.prefsFromApi(sent).occasionReminders)), plan);
});
