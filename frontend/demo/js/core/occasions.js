/* Daily occasions (مناسبت‌ها) and Iran's official Hijri month starts.

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

function loadOccasionsData(){
  if(OCCASIONS_DATA || OCCASIONS_BY_DATE) return;
  const loaded = Cloud.isConfigured() ? loadOccasionsFromApi() : loadOccasionsFromFiles();
  loaded.then(render).catch(() => { OCCASIONS_DATA = []; });
}

async function loadOccasionsFromApi(){
  const jy = toJalali(today.getFullYear(), today.getMonth()+1, today.getDate()).jy;
  const years = await Promise.all([jy - 1, jy, jy + 1].map(y => Cloud.calendarYear(y)));
  const byDate = {}, months = [];
  years.forEach(y => {
    months.push(...y.hijri_months);
    y.occasions.forEach(o => { (byDate[o.date] = byDate[o.date] || []).push({ event_name: o.title_fa, is_holiday: o.is_holiday }); });
  });
  setHijriMonthStarts(months);
  OCCASIONS_BY_DATE = byDate;
}

async function loadOccasionsFromFiles(){
  const [occasions, hijri] = await Promise.all([
    fetch('../assets/data/occasions.json').then(r => r.json()),
    fetch('../assets/data/hijri-months.json').then(r => r.json()).catch(() => ({ months: [] })),
  ]);
  setHijriMonthStarts(hijri.months);
  OCCASIONS_DATA = occasions;
}

function occasionsForDate(d){
  if(OCCASIONS_BY_DATE) return OCCASIONS_BY_DATE[dateKey(d)] || [];
  if(!OCCASIONS_DATA) return null;
  const j = toJalali(d.getFullYear(), d.getMonth()+1, d.getDate());
  const h = toHijri(d.getFullYear(), d.getMonth()+1, d.getDate());
  const gm = d.getMonth()+1, gd = d.getDate();
  return OCCASIONS_DATA.filter(item => {
    const [dayStr, ...monthWords] = item.date.date;
    const monthStr = monthWords.join(' ');
    const day = Number(dayStr);
    if(item.date.type === 'shamsi') return OCC_SHAMSI_MONTH[monthStr]===j.jm && day===j.jd;
    if(item.date.type === 'gregorian') return OCC_GREGORIAN_MONTH[monthStr]===gm && day===gd;
    if(item.date.type === 'hijri') return OCC_HIJRI_MONTH[monthStr]===h.hm && day===h.hd;
    return false;
  });
}
