/* Daily occasions (مناسبت‌ها) and Iran's official Hijri month starts.
   (PHP backend: the month starts come from GET /calendar/hijri-months.)

   With a backend (js/config.js apiBase): GET /calendar/occasions?year=…
   returns every occasion of the Jalali year already on its real date,
   plus the official Hijri month starts the server used.
   Without one (GitHub Pages): the same open dataset and month starts,
   self-hosted in assets/data/ (occasions.json, hijri-months.json),
   fetched once from this app's own origin. No third-party requests. */
let OCCASIONS_DATA = null;          // rule list (static dataset), or null
let OCCASIONS_BY_DATE = null;       // 'YYYY-MM-DD' -> [{title, is_holiday}] (from the API)

const OCC_SHAMSI_MONTH = { 'فروردین':1,'اردیبهشت':2,'خرداد':3,'تیر':4,'مرداد':5,'اَمرداد':5,'شهریور':6,'مهر':7,'آبان':8,'آذر':9,'دی':10,'بهمن':11,'اسفند':12 };

const OCC_GREGORIAN_MONTH = { January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12 };

/* The dataset writes the paired months as two words ("جمادي الثانيه").
   Reading only the first word used to put every Jumada II occasion in
   Jumada I (and Rabi' II in Rabi' I) — e.g. a wrong holiday mid-month. */
const OCC_HIJRI_MONTH = {
  'محرم':1, 'صفر':2, 'ربيع الاول':3, 'ربيع الثاني':4, 'جمادي الاولي':5, 'جمادي الثانيه':6,
  'رجب':7, 'شعبان':8, 'رمضان':9, 'شوال':10, 'ذوالقعده':11, 'ذوالحجه':12,
};

/* Identity comes from the calendar rule, never the Gregorian occurrence.
   Official Hijri month starts may move the occurrence without losing a
   person's reminder choices. URI encoding keeps notification slot IDs safe. */
function occasionRuleKey(calendar, month, day, title){
  return `${calendar}:${Number(month)}:${Number(day)}:${encodeURIComponent(String(title || '').trim())}`;
}

function loadOccasionsData(){
  if(OCCASIONS_DATA || OCCASIONS_BY_DATE) return;
  // The PHP backend has no calendar API: it uses the same static files.
  const fromApi = Cloud.isConfigured() && Cloud.supportsCalendar !== false;
  const loaded = fromApi ? loadOccasionsFromApi() : loadOccasionsFromFiles();
  loaded.then(render).catch(() => { OCCASIONS_DATA = []; });
}

async function loadOccasionsFromApi(){
  const jy = toJalali(today.getFullYear(), today.getMonth()+1, today.getDate()).jy;
  const years = await Promise.all([jy - 1, jy, jy + 1].map(y => Cloud.calendarYear(y)));
  const byDate = {}, months = [];
  years.forEach(y => {
    months.push(...y.hijri_months);
    y.occasions.forEach(o => { (byDate[o.date] = byDate[o.date] || []).push({ event_name: o.title_fa, is_holiday: o.is_holiday, calendar: o.calendar,
      key: occasionRuleKey(o.calendar, o.rule_month, o.rule_day, o.title_fa) }); });
  });
  setHijriMonthStarts(months);
  OCCASIONS_BY_DATE = byDate;
}

async function loadOccasionsFromFiles(){
  // Official Hijri month starts: from our own API on the live site (kept up
  // to date from the admin panel after each moon sighting), else the file.
  const hijriFile = () => fetch('../assets/data/hijri-months.json').then(r => r.json()).catch(() => ({ months: [] }));
  const [occasions, hijri] = await Promise.all([
    fetch('../assets/data/occasions.json').then(r => r.json()),
    Cloud.hijriMonths ? Cloud.hijriMonths().then(d => (d && d.months && d.months.length) ? d : hijriFile()).catch(hijriFile) : hijriFile(),
  ]);
  setHijriMonthStarts(hijri.months);
  const CAL = { shamsi:'jalali', gregorian:'gregorian', hijri:'hijri' };
  OCCASIONS_DATA = occasions.map(o => Object.assign({ calendar: CAL[o.date.type] }, o));
}

/* occasionsForDate() filtered by the Occasions settings (which calendars'
   occasions, holidays only). null while the data is still loading. */
function visibleOccasionsForDate(d){
  const items = occasionsForDate(d);
  if(items === null) return null;
  const allowed = { jalali: pref('occasionsJalali'), hijri: pref('occasionsHijri'), gregorian: pref('occasionsGregorian') };
  return items.filter(o => allowed[o.calendar] !== false && (!pref('occasionsHolidaysOnly') || o.is_holiday));
}

function isHolidayOn(d){
  if(!pref('occasionsEnabled') || !pref('occasionsMarkHolidays')) return false;
  return (visibleOccasionsForDate(d) || []).some(o => o.is_holiday);
}

/* The dataset indexed once by "type|month|day", and each day's answer kept
   (per date key): every calendar cell asks for its holiday and occasions
   on every render, and scanning all 238 entries per cell was most of a
   month change's time on a phone. Both are rebuilt when the data or the
   Hijri month starts change. */
let occIndex = null, occIndexOf = null, occDayCache = {}, occHijriSig = null;
function occasionsIndex(){
  if(occIndexOf !== OCCASIONS_DATA){
    occIndex = {}; occIndexOf = OCCASIONS_DATA; occDayCache = {};
    const MONTHS = { shamsi: OCC_SHAMSI_MONTH, gregorian: OCC_GREGORIAN_MONTH, hijri: OCC_HIJRI_MONTH };
    OCCASIONS_DATA.forEach(item => {
      const [dayStr, ...monthWords] = item.date.date;
      const month = (MONTHS[item.date.type] || {})[monthWords.join(' ')];
      if(!month) return;
      item.key = occasionRuleKey(item.calendar, month, dayStr, item.event_name);
      const k = `${item.date.type}|${month}|${Number(dayStr)}`;
      (occIndex[k] = occIndex[k] || []).push(item);
    });
  }
  // The Hijri dates of every day move when the official month starts do.
  // (setHijriMonthStarts() always assigns a new array.)
  if(HIJRI_MONTH_STARTS !== occHijriSig){ occHijriSig = HIJRI_MONTH_STARTS; occDayCache = {}; }
  return occIndex;
}

function occasionsForDate(d){
  if(OCCASIONS_BY_DATE) return OCCASIONS_BY_DATE[dateKey(d)] || [];
  if(!OCCASIONS_DATA) return null;
  const idx = occasionsIndex();
  const key = dateKey(d);
  if(occDayCache[key]) return occDayCache[key];
  const j = toJalali(d.getFullYear(), d.getMonth()+1, d.getDate());
  const h = toHijri(d.getFullYear(), d.getMonth()+1, d.getDate());
  return occDayCache[key] = [].concat(
    idx[`shamsi|${j.jm}|${j.jd}`] || [],
    idx[`gregorian|${d.getMonth()+1}|${d.getDate()}`] || [],
    idx[`hijri|${h.hm}|${h.hd}`] || []);
}

/* Optional per-occasion plans share the task/event notification pipeline.
   Each plan has its own ID, lead in days and wall-clock time. Nothing is
   scheduled by default, and an updated official date shifts future slots. */
function occasionReminderSlots(day){
  const plans = state.settings.prefs?.occasionReminders || {};
  if(!plans || typeof plans !== 'object' || Array.isArray(plans)) return [];
  const leads = new Set();
  Object.values(plans).forEach(list => {
    if(Array.isArray(list)) list.forEach(r => {
      if(r?.enabled && Number.isInteger(r.daysBefore) && r.daysBefore >= 0 && r.daysBefore <= 56 && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) leads.add(r.daysBefore);
    });
  });
  const out = [];
  leads.forEach(ahead => {
    const occurrence = addDays(day, ahead);
    (occasionsForDate(occurrence) || []).forEach(o => {
      const reminders = plans[o.key];
      if(!Array.isArray(reminders)) return;
      reminders.forEach(r => {
        if(!r.enabled || r.daysBefore !== ahead || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) return;
        const at = atTimeOn(day, r.time), date = dateKey(occurrence);
        out.push({ slot: `occasion|occasion|${o.key}|${date}|${r.id}|${at}`, kind: 'occasion', id: o.key,
          date, title: o.event_name, body: ahead ? `${ahead} ${t('occasionDaysAhead')}` : t('occasionToday'), at,
          item: { id: o.key, title: o.event_name } });
      });
    });
  });
  return out;
}

function saveOccasionReminderList(key, list){
  if(!key || !Array.isArray(list) || list.length > 10 || list.some(r =>
    !r.id || !Number.isInteger(r.daysBefore) || r.daysBefore < 0 || r.daysBefore > 56 ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) || typeof r.enabled !== 'boolean')) return false;
  const old = state.settings.prefs?.occasionReminders || {};
  const next = Object.assign({}, old);
  if(list.length) next[key] = list;
  else delete next[key];
  setPref('occasionReminders', next);
  forgetItemReminders('occasion', key);
  return true;
}
