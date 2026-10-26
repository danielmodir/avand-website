/* ============ PRAYER TIMES (اوقات شرعی) ============
   Worked out on the phone, no network: the sun's position for the day
   (the usual low-precision formulas, good to well under a minute) and the
   angles the Institute of Geophysics, University of Tehran uses (Jafari):
   dawn at 17.7° below the horizon, maghrib at 4.5°, isha at 14°, asr when a
   shadow equals its object plus the noon shadow, and the religious midnight
   halfway between sunset and the next dawn. Sunrise and sunset are the
   sun's upper edge on the horizon (0.833° with refraction).
   Times are Iran's clock (UTC+3:30, no daylight saving since 2022) for the
   chosen city; prayerTimesFor() also gives each one as a timestamp so
   reminders fire at the right moment wherever the phone's clock is set.
   Tests: tests/prayer-times.test.js (node --test). */

const PRAYER_TZ = 3.5;
const PRAYER_ANGLES = { fajr: 17.7, maghrib: 4.5, isha: 14, horizon: 0.833 };

/* Provincial capitals and a few large cities: [id, fa, en, latitude, longitude]. */
const PRAYER_CITIES = [
  ['tehran', 'تهران', 'Tehran', 35.6892, 51.3890],
  ['mashhad', 'مشهد', 'Mashhad', 36.2972, 59.6067],
  ['isfahan', 'اصفهان', 'Isfahan', 32.6546, 51.6680],
  ['karaj', 'کرج', 'Karaj', 35.8400, 50.9391],
  ['shiraz', 'شیراز', 'Shiraz', 29.5918, 52.5837],
  ['tabriz', 'تبریز', 'Tabriz', 38.0800, 46.2919],
  ['qom', 'قم', 'Qom', 34.6399, 50.8759],
  ['ahvaz', 'اهواز', 'Ahvaz', 31.3183, 48.6706],
  ['kermanshah', 'کرمانشاه', 'Kermanshah', 34.3142, 47.0650],
  ['urmia', 'ارومیه', 'Urmia', 37.5527, 45.0761],
  ['rasht', 'رشت', 'Rasht', 37.2808, 49.5832],
  ['zahedan', 'زاهدان', 'Zahedan', 29.4963, 60.8629],
  ['hamedan', 'همدان', 'Hamedan', 34.7989, 48.5146],
  ['kerman', 'کرمان', 'Kerman', 30.2839, 57.0834],
  ['yazd', 'یزد', 'Yazd', 31.8974, 54.3569],
  ['ardabil', 'اردبیل', 'Ardabil', 38.2498, 48.2933],
  ['bandarabbas', 'بندرعباس', 'Bandar Abbas', 27.1832, 56.2666],
  ['arak', 'اراک', 'Arak', 34.0917, 49.6892],
  ['zanjan', 'زنجان', 'Zanjan', 36.6736, 48.4787],
  ['sanandaj', 'سنندج', 'Sanandaj', 35.3219, 46.9862],
  ['qazvin', 'قزوین', 'Qazvin', 36.2797, 50.0049],
  ['khorramabad', 'خرم‌آباد', 'Khorramabad', 33.4878, 48.3558],
  ['gorgan', 'گرگان', 'Gorgan', 36.8456, 54.4393],
  ['sari', 'ساری', 'Sari', 36.5633, 53.0601],
  ['bojnord', 'بجنورد', 'Bojnord', 37.4747, 57.3290],
  ['birjand', 'بیرجند', 'Birjand', 32.8649, 59.2262],
  ['bushehr', 'بوشهر', 'Bushehr', 28.9234, 50.8203],
  ['ilam', 'ایلام', 'Ilam', 33.6374, 46.4227],
  ['shahrekord', 'شهرکرد', 'Shahrekord', 32.3256, 50.8644],
  ['yasuj', 'یاسوج', 'Yasuj', 30.6682, 51.5880],
  ['semnan', 'سمنان', 'Semnan', 35.5729, 53.3971],
  ['kashan', 'کاشان', 'Kashan', 33.9850, 51.4100],
  ['dezful', 'دزفول', 'Dezful', 32.3811, 48.4058],
  ['abadan', 'آبادان', 'Abadan', 30.3392, 48.3043],
  ['neyshabur', 'نیشابور', 'Neyshabur', 36.2133, 58.7958],
  ['kish', 'کیش', 'Kish', 26.5578, 54.0194],
];

const PRAYER_ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha', 'midnight'];

function prayerCity(id){
  const row = PRAYER_CITIES.find(c => c[0] === id) || PRAYER_CITIES[0];
  return { id: row[0], fa: row[1], en: row[2], lat: row[3], lng: row[4] };
}

const prayerRad = d => d * Math.PI / 180, prayerDeg = r => r * 180 / Math.PI;
const prayerFix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

/* Declination and equation of time (hours) for a Julian date. */
function prayerSun(jd){
  const D = jd - 2451545.0;
  const g = prayerFix(357.529 + 0.98560028 * D, 360);
  const q = prayerFix(280.459 + 0.98564736 * D, 360);
  const L = prayerFix(q + 1.915 * Math.sin(prayerRad(g)) + 0.020 * Math.sin(prayerRad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = prayerFix(prayerDeg(Math.atan2(Math.cos(prayerRad(e)) * Math.sin(prayerRad(L)), Math.cos(prayerRad(L)))) / 15, 24);
  return { decl: prayerDeg(Math.asin(Math.sin(prayerRad(e)) * Math.sin(prayerRad(L)))), eqt: q / 15 - RA };
}

/* The day's times as hours of UTC (fractions), for date y-m-d at lat/lng. */
function prayerHoursUtc(y, m, d, lat, lng){
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const jDate = jdn - 0.5 - lng / (15 * 24);
  const sun = t => prayerSun(jDate + t);
  const noon = t => prayerFix(12 - sun(t / 24).eqt, 24);
  const angleTime = (angle, t, before) => {
    const { decl } = sun(t / 24), n = noon(t);
    const c = (-Math.sin(prayerRad(angle)) - Math.sin(prayerRad(decl)) * Math.sin(prayerRad(lat))) /
      (Math.cos(prayerRad(decl)) * Math.cos(prayerRad(lat)));
    const T = prayerDeg(Math.acos(Math.max(-1, Math.min(1, c)))) / 15;
    return n + (before ? -T : T);
  };
  const asr = t => {
    const { decl } = sun(t / 24);
    const angle = -prayerDeg(Math.atan(1 / (1 + Math.tan(prayerRad(Math.abs(lat - decl))))));
    return angleTime(angle, t, false);
  };
  // One refinement pass from rough guesses (local solar hours), as is usual.
  const g = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
  const local = {
    fajr: angleTime(PRAYER_ANGLES.fajr, g.fajr, true),
    sunrise: angleTime(PRAYER_ANGLES.horizon, g.sunrise, true),
    dhuhr: noon(g.dhuhr),
    asr: asr(g.asr),
    sunset: angleTime(PRAYER_ANGLES.horizon, g.sunset, false),
    maghrib: angleTime(PRAYER_ANGLES.maghrib, g.maghrib, false),
    isha: angleTime(PRAYER_ANGLES.isha, g.isha, false),
  };
  const out = {};
  Object.keys(local).forEach(k => { out[k] = local[k] - lng / 15; });
  // Halfway from sunset to the next dawn (that dawn is within a minute of today's).
  out.midnight = out.sunset + (out.fajr + 24 - out.sunset) / 2;
  return out;
}

/* {fajr: {hm:'04:57', at: timestamp}, …} for a Date (its calendar day) and a city id. */
function prayerTimesFor(day, cityId){
  const c = prayerCity(cityId);
  const y = day.getFullYear(), m = day.getMonth() + 1, d = day.getDate();
  const utc = prayerHoursUtc(y, m, d, c.lat, c.lng);
  const base = Date.UTC(y, m - 1, d);
  const out = {};
  PRAYER_ORDER.forEach(k => {
    const mins = Math.round((utc[k] + PRAYER_TZ) * 60);
    const wrapped = ((mins % 1440) + 1440) % 1440;
    out[k] = { hm: String(Math.floor(wrapped / 60)).padStart(2, '0') + ':' + String(wrapped % 60).padStart(2, '0'),
      at: base + (mins - PRAYER_TZ * 60) * 60000 };
  });
  return out;
}

if(typeof module !== 'undefined') module.exports = { prayerTimesFor, prayerCity, PRAYER_CITIES };
