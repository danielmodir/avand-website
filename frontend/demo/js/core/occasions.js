/* Daily occasions (مناسبت‌ها) — self-hosted static dataset, not a live
   third-party API call: CLAUDE.md's hard rule is zero external requests
   at runtime (the only standing exception is this app's own Supabase
   backend), so assets/data/occasions.json is a one-time download of
   BaseMax/persian-holidays-api's holidays.json (same self-hosting
   pattern as the fonts), fetched once from this app's own origin and
   cached in memory. Covers Jalali, Gregorian and Hijri occasions; the
   month-name spellings below match that specific dataset's strings,
   not necessarily this file's own display month-name arrays. */
let OCCASIONS_DATA = null;

const OCC_SHAMSI_MONTH = { 'فروردین':1,'اردیبهشت':2,'خرداد':3,'تیر':4,'مرداد':5,'اَمرداد':5,'شهریور':6,'مهر':7,'آبان':8,'آذر':9,'دی':10,'بهمن':11,'اسفند':12 };

const OCC_GREGORIAN_MONTH = { January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12 };

/* The dataset doesn't distinguish Rabi I/II or Jumada I/II (one shared
   spelling for each pair) — mapped to the first of the pair as a
   best-effort; a handful of entries may land a lunar month off. */
const OCC_HIJRI_MONTH = { 'محرم':1,'صفر':2,'ربيع':3,'ربیع':3,'جمادي':5,'جمادی':5,'رجب':7,'شعبان':8,'رمضان':9,'شوال':10,'ذوالقعده':11,'ذیقعده':11,'ذوالحجه':12,'ذیحجه':12 };

function loadOccasionsData(){
  if(OCCASIONS_DATA) return;
  fetch('../assets/data/occasions.json').then(r => r.json()).then(data => { OCCASIONS_DATA = data; render(); }).catch(() => { OCCASIONS_DATA = []; });
}

function occasionsForDate(d){
  if(!OCCASIONS_DATA) return null;
  const j = toJalali(d.getFullYear(), d.getMonth()+1, d.getDate());
  const h = toHijri(d.getFullYear(), d.getMonth()+1, d.getDate());
  const gm = d.getMonth()+1, gd = d.getDate();
  return OCCASIONS_DATA.filter(item => {
    const [dayStr, monthStr] = item.date.date;
    const day = Number(dayStr);
    if(item.date.type === 'shamsi') return OCC_SHAMSI_MONTH[monthStr]===j.jm && day===j.jd;
    if(item.date.type === 'gregorian') return OCC_GREGORIAN_MONTH[monthStr]===gm && day===gd;
    if(item.date.type === 'hijri') return OCC_HIJRI_MONTH[monthStr]===h.hm && day===h.hd;
    return false;
  });
}
