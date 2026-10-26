// Prayer times (frontend/demo/js/core/prayer.js) against published times.
// Run: node --test tests/*.test.js
// Reference: bahesab.ir daily tables (Institute of Geophysics method),
// 5 Aban 1405 = 27 October 2026. Published times are whole minutes, so each
// computed time may differ by one minute from rounding.
const test = require('node:test');
const assert = require('node:assert');
const { prayerTimesFor } = require('../frontend/demo/js/core/prayer.js');

const REFERENCE = {
  tehran: { fajr: '04:57', sunrise: '06:21', dhuhr: '11:48', asr: '14:50', sunset: '17:15', maghrib: '17:33', isha: '18:21', midnight: '23:06' },
  mashhad: { fajr: '04:24', sunrise: '05:49', dhuhr: '11:15', asr: '14:17', sunset: '16:41', maghrib: '17:00', isha: '17:47', midnight: '22:33' },
  tabriz: { fajr: '05:18', sunrise: '06:45', dhuhr: '12:09', asr: '15:07', sunset: '17:32', maghrib: '17:51', isha: '18:40', midnight: '23:25' },
};
const minutes = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

for (const [city, ref] of Object.entries(REFERENCE)) {
  test(`${city}, 27 Oct 2026`, () => {
    const got = prayerTimesFor(new Date(2026, 9, 27), city);
    for (const [k, hm] of Object.entries(ref)) {
      assert.ok(Math.abs(minutes(got[k].hm) - minutes(hm)) <= 1, `${k}: ${got[k].hm}, published ${hm}`);
    }
  });
}

test('timestamps are Iran time (UTC+3:30)', () => {
  const got = prayerTimesFor(new Date(2026, 9, 27), 'tehran');
  const d = new Date(got.dhuhr.at);
  const iran = (d.getUTCHours() * 60 + d.getUTCMinutes() + 210) % 1440;
  assert.strictEqual(iran, minutes(got.dhuhr.hm));
});

test('times stay in order through the year', () => {
  for (let m = 0; m < 12; m++) {
    const got = prayerTimesFor(new Date(2026, m, 15), 'tehran');
    const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha'];
    for (let i = 1; i < order.length; i++) assert.ok(got[order[i]].at > got[order[i - 1]].at, `${m + 1}: ${order[i]}`);
  }
});

test('an unknown city falls back to Tehran', () => {
  assert.deepStrictEqual(prayerTimesFor(new Date(2026, 9, 27), 'nowhere'), prayerTimesFor(new Date(2026, 9, 27), 'tehran'));
});
