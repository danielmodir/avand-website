/* Verified against known reference dates: 2024-03-20 = 1403-01-01, 1979-02-11 = 1357-11-22, 2000-01-01 = 1378-10-11 */
function jdiv(a,b){ return Math.trunc(a/b); }

function jalCal(jy){
  const breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14, jp = breaks[0], jump = 0;
  for(let i=1;i<bl;i++){
    const jm = breaks[i];
    jump = jm - jp;
    if(jy < jm) break;
    leapJ = leapJ + jdiv(jump,33)*8 + jdiv(jump%33,4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + jdiv(n,33)*8 + jdiv((n%33)+3,4);
  if((jump%33)===4 && (jump-n)===4) leapJ += 1;
  const leapG = jdiv(gy,4) - jdiv((jdiv(gy,100)+1)*3,4) - 150;
  const march = 20 + leapJ - leapG;
  if((jump-n) < 6) n = n - jump + jdiv(jump+4,33)*33;
  let leap = ((((n+1)%33)-1)%4);
  if(leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy,gm,gd){
  let d = jdiv((gy+jdiv(gm-8,6)+100100)*1461,4) + jdiv(153*((gm+9)%12)+2,5) + gd - 34840408;
  d = d - jdiv(jdiv(gy+100100+jdiv(gm-8,6),100)*3,4) + 752;
  return d;
}

function d2g(jdn){
  let j = 4*jdn + 139361631;
  j = j + jdiv(jdiv(4*jdn+183187720,146097)*3,4)*4 - 3908;
  const i = jdiv(j%1461,4)*5+308;
  const gd = jdiv(i%153,5)+1;
  const gm = ((jdiv(i,153)%12)+1);
  const gy = jdiv(j,1461)-100100+jdiv(8-gm,6);
  return { gy, gm, gd };
}

function j2d(jy,jm,jd){
  const r = jalCal(jy);
  return g2d(r.gy,3,r.march) + (jm-1)*31 - jdiv(jm,7)*(jm-7) + jd - 1;
}

function d2j(jdn){
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy,3,r.march);
  let k = jdn - jdn1f;
  if(k >= 0){
    if(k <= 185) return { jy, jm: 1+jdiv(k,31), jd: (k%31)+1 };
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if(r.leap === 1) k += 1;
  }
  return { jy, jm: 7+jdiv(k,30), jd: (k%30)+1 };
}

function toJalali(gy,gm,gd){ return d2j(g2d(gy,gm,gd)); }

function toGregorian(jy,jm,jd){ return d2g(j2d(jy,jm,jd)); }

/* Standard tabular/civil Islamic calendar (not astronomical Umm al-Qura —
   that needs a lookup table we don't have). Pure arithmetic, no external
   calls, used only to print a secondary Hijri day number in each calendar
   cell (see dayCellDateHtml) — distinct from Settings' "Hijri as the
   primary calendar system" toggle, which stays unimplemented/"coming
   soon" since that needs real month-length accuracy, not just a number. */
function gregorianToJDN(y,m,d){
  const a = Math.floor((14-m)/12), y2 = y+4800-a, m2 = m+12*a-3;
  return d + Math.floor((153*m2+2)/5) + 365*y2 + Math.floor(y2/4) - Math.floor(y2/100) + Math.floor(y2/400) - 32045;
}

const ISLAMIC_EPOCH_JDN = 1948440;

/* Iran starts each Hijri month by moon sighting, so pure arithmetic is
   often a day off (e.g. 15 Oct 2026 is 4 Jumada I officially, 3 by the
   formula). Official month starts — from the API, or the bundled
   assets/data/hijri-months.json — take precedence; arithmetic is only the
   fallback outside the covered range. Rows: { hy, hm, start: Date }. */
let HIJRI_MONTH_STARTS = [];

function setHijriMonthStarts(rows){
  HIJRI_MONTH_STARTS = rows
    .map(r => ({ hy: r.hijri_year, hm: r.hijri_month, start: parseDateKey(r.starts_on) }))
    .sort((a, b) => a.start - b.start);
}

function officialHijri(gy,gm,gd){
  const d = new Date(gy, gm-1, gd);
  for(let i = HIJRI_MONTH_STARTS.length - 1; i >= 0; i--){
    const row = HIJRI_MONTH_STARTS[i];
    if(row.start > d) continue;
    const offset = Math.round((d - row.start) / 86400000);
    const next = HIJRI_MONTH_STARTS[i+1];
    const limit = next ? Math.round((next.start - row.start) / 86400000) : 30;
    return offset < Math.min(limit, 30) ? { hy: row.hy, hm: row.hm, hd: offset + 1 } : null;
  }
  return null;
}

function toHijri(gy,gm,gd){
  return officialHijri(gy,gm,gd) || toHijriTabular(gy,gm,gd);
}

function toHijriTabular(gy,gm,gd){
  let l = gregorianToJDN(gy,gm,gd) - ISLAMIC_EPOCH_JDN + 10632;
  const n = Math.floor((l-1)/10631);
  l = l - 10631*n + 354;
  const j = Math.floor((10985-l)/5316)*Math.floor((50*l)/17719) + Math.floor(l/5670)*Math.floor((43*l)/15238);
  l = l - Math.floor((30-j)/15)*Math.floor((17719*j)/50) - Math.floor(j/16)*Math.floor((15238*j)/43) + 29;
  const hm = Math.floor((24*l)/709);
  const hd = l - Math.floor((709*hm)/24);
  const hy = 30*n + j - 30;
  return { hy, hm, hd };
}

/* Inverse of the JDN<->Gregorian pair above (same well-known algorithm
   family) plus the matching Hijri->JDN formula, so the tabular Hijri
   calendar can be stepped/navigated like Jalali, not just printed as a
   lone day number. */
function jdnToGregorian(jdn){
  const a = jdn + 32044, b = Math.floor((4*a+3)/146097), c = a - Math.floor((146097*b)/4);
  const d = Math.floor((4*c+3)/1461), e = c - Math.floor((1461*d)/4), m = Math.floor((5*e+2)/153);
  const day = e - Math.floor((153*m+2)/5) + 1, month = m + 3 - 12*Math.floor(m/10);
  const year = 100*b + d - 4800 + Math.floor(m/10);
  return { gy:year, gm:month, gd:day };
}

function hijriToGregorian(hy,hm,hd){
  const row = HIJRI_MONTH_STARTS.find(r => r.hy === hy && r.hm === hm);
  if(row){
    const d = addDays(row.start, hd - 1);
    return { gy: d.getFullYear(), gm: d.getMonth()+1, gd: d.getDate() };
  }
  const jdn = hd + Math.ceil(29.5*(hm-1)) + (hy-1)*354 + Math.floor((3+11*hy)/30) + ISLAMIC_EPOCH_JDN - 1;
  return jdnToGregorian(jdn);
}

const JALALI_MONTHS_FA = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

const JALALI_MONTHS_EN = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];

const HIJRI_MONTHS_FA = ['محرم','صفر','ربیع‌الاول','ربیع‌الثانی','جمادی‌الاول','جمادی‌الثانی','رجب','شعبان','رمضان','شوال','ذیقعده','ذیحجه'];

const HIJRI_MONTHS_EN = ['Muharram','Safar',"Rabi' I","Rabi' II","Jumada I","Jumada II",'Rajab',"Sha'ban",'Ramadan','Shawwal',"Dhu al-Qi'dah","Dhu al-Hijjah"];

/* "Primary" = which system shows as the big day-cell number and drives
   the month/year title + navigation; independent from which systems
   are merely *enabled* (state.settings.calendarEnabled) and therefore
   shown in a cell's small secondary line — see renderCalendarSettings
   and dayCellDateHtml. Settings enforces "at least one enabled" and
   that the primary is always itself enabled. */
function primarySystem(){ return state.settings.calendarSystem; }

function isJalali(){ return primarySystem() === 'jalali'; }

function isHijriPrimary(){ return primarySystem() === 'hijri'; }

function jalaliMonthName(i0){ return (lang()==='fa' ? JALALI_MONTHS_FA : JALALI_MONTHS_EN)[i0]; }

function hijriMonthName(i0){ return (lang()==='fa' ? HIJRI_MONTHS_FA : HIJRI_MONTHS_EN)[i0]; }

/* Each calendar system always renders its own date numbers in its own
   numeral script, independent of the app's general (Latin-digit) UI
   language: Jalali numbers are always Persian digits, Hijri numbers
   are always Arabic-Indic digits, Gregorian numbers are always Latin —
   this is a deliberate exception to the rest of the UI staying Latin,
   scoped to calendar date numbers specifically. */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // same limit as the API (photos are re-encoded server-side)

const PERSIAN_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

const ARABIC_INDIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];

function toSysDigits(num, sys){
  const str = String(num);
  // The per-system numeral script (Persian for Jalali, Arabic-Indic for
  // Hijri) only applies in the Persian UI — in English, every number
  // stays Latin regardless of which calendar system it belongs to,
  // same "everything follows the app language" rule dig() already
  // applies to plain UI numbers elsewhere.
  if(lang() !== 'fa') return str;
  if(sys === 'jalali') return str.replace(/[0-9]/g, c => PERSIAN_DIGITS[c]);
  if(sys === 'hijri') return str.replace(/[0-9]/g, c => ARABIC_INDIC_DIGITS[c]);
  return str;
}

/* Plain UI numbers (stat counts, badges, ids — anything NOT part of a
   specific calendar system, which already goes through toSysDigits
   above) — Persian digits whenever the UI language is fa, Latin for en,
   per the repo owner's request. */
function dig(num){
  const str = String(num);
  return lang() === 'fa' ? str.replace(/[0-9]/g, c => PERSIAN_DIGITS[c]) : str;
}

function displayMonthYear(d){
  if(isHijriPrimary()){
    const h = toHijri(d.getFullYear(), d.getMonth()+1, d.getDate());
    return { monthLabel: hijriMonthName(h.hm-1), yearLabel: toSysDigits(h.hy,'hijri'), hy:h.hy, hm:h.hm, hd:h.hd };
  }
  if(isJalali()){
    const j = toJalali(d.getFullYear(), d.getMonth()+1, d.getDate());
    return { monthLabel: jalaliMonthName(j.jm-1), yearLabel: toSysDigits(j.jy,'jalali'), jy:j.jy, jm:j.jm, jd:j.jd };
  }
  return { monthLabel: monthName(d.getMonth()), yearLabel: toSysDigits(d.getFullYear(),'gregorian') };
}

function displayDayNum(d){
  if(isHijriPrimary()) return toSysDigits(toHijri(d.getFullYear(), d.getMonth()+1, d.getDate()).hd, 'hijri');
  if(isJalali()) return toSysDigits(toJalali(d.getFullYear(), d.getMonth()+1, d.getDate()).jd, 'jalali');
  return toSysDigits(d.getDate(), 'gregorian');
}

/* Triple-date cell body: big primary day number (whichever system
   Settings has as primary) plus every OTHER *enabled* system's day
   number as a small secondary line underneath — same idea as the
   calendar09.html reference's day cells, re-themed to this app's own
   .day-cell markup instead of its markup/CSS. A system that's been
   switched off in Settings (calendarEnabled) is left out entirely,
   including from the secondary line — "disabled" means gone, not just
   demoted. */
function dayCellDateHtml(d){
  const primary = displayDayNum(d);
  const en = state.settings.calendarEnabled;
  const nums = {
    gregorian: () => toSysDigits(d.getDate(), 'gregorian'),
    jalali: () => toSysDigits(toJalali(d.getFullYear(),d.getMonth()+1,d.getDate()).jd, 'jalali'),
    hijri: () => toSysDigits(toHijri(d.getFullYear(),d.getMonth()+1,d.getDate()).hd, 'hijri'),
  };
  const sysOrder = ['gregorian','jalali','hijri'];
  const subVals = sysOrder.filter(s => s !== primarySystem() && en[s]).map(s => nums[s]());
  const sub = subVals.length ? `<span class="day-cell-sub">${subVals.join(' / ')}</span>` : '';
  return `<span class="day-cell-num">${primary}</span>${sub}`;
}

function cellInCurrentMonth(cellDate, cursorDate){
  if(isHijriPrimary()){
    const hc = toHijri(cursorDate.getFullYear(), cursorDate.getMonth()+1, cursorDate.getDate());
    const hd = toHijri(cellDate.getFullYear(), cellDate.getMonth()+1, cellDate.getDate());
    return hc.hy===hd.hy && hc.hm===hd.hm;
  }
  if(isJalali()){
    const jc = toJalali(cursorDate.getFullYear(), cursorDate.getMonth()+1, cursorDate.getDate());
    const jd = toJalali(cellDate.getFullYear(), cellDate.getMonth()+1, cellDate.getDate());
    return jc.jy===jd.jy && jc.jm===jd.jm;
  }
  return cellDate.getMonth() === cursorDate.getMonth();
}

function stepMonth(anchor, dir){
  if(isHijriPrimary()){
    const hc = toHijri(anchor.getFullYear(), anchor.getMonth()+1, anchor.getDate());
    let hm = hc.hm + dir, hy = hc.hy;
    if(hm > 12){ hm = 1; hy++; } else if(hm < 1){ hm = 12; hy--; }
    const g = hijriToGregorian(hy, hm, 1);
    return new Date(g.gy, g.gm-1, g.gd);
  }
  if(isJalali()){
    const jc = toJalali(anchor.getFullYear(), anchor.getMonth()+1, anchor.getDate());
    let jm = jc.jm + dir, jy = jc.jy;
    if(jm > 12){ jm = 1; jy++; } else if(jm < 1){ jm = 12; jy--; }
    const g = toGregorian(jy, jm, 1);
    return new Date(g.gy, g.gm-1, g.gd);
  }
  return new Date(anchor.getFullYear(), anchor.getMonth()+dir, 1);
}

function stepYear(anchor, dir){
  if(isHijriPrimary()){
    const hc = toHijri(anchor.getFullYear(), anchor.getMonth()+1, anchor.getDate());
    const g = hijriToGregorian(hc.hy+dir, hc.hm, 1);
    return new Date(g.gy, g.gm-1, g.gd);
  }
  if(isJalali()){
    const jc = toJalali(anchor.getFullYear(), anchor.getMonth()+1, anchor.getDate());
    const g = toGregorian(jc.jy+dir, jc.jm, 1);
    return new Date(g.gy, g.gm-1, g.gd);
  }
  return new Date(anchor.getFullYear()+dir, anchor.getMonth(), 1);
}

function setMonthOf(anchor, monthIndex0){
  if(isHijriPrimary()){
    const hc = toHijri(anchor.getFullYear(), anchor.getMonth()+1, anchor.getDate());
    const g = hijriToGregorian(hc.hy, monthIndex0+1, 1);
    return new Date(g.gy, g.gm-1, g.gd);
  }
  if(isJalali()){
    const jc = toJalali(anchor.getFullYear(), anchor.getMonth()+1, anchor.getDate());
    const g = toGregorian(jc.jy, monthIndex0+1, 1);
    return new Date(g.gy, g.gm-1, g.gd);
  }
  return new Date(anchor.getFullYear(), monthIndex0, 1);
}

function setYearOf(anchor, year){
  if(isHijriPrimary()){
    const hc = toHijri(anchor.getFullYear(), anchor.getMonth()+1, anchor.getDate());
    const g = hijriToGregorian(year, hc.hm, 1);
    return new Date(g.gy, g.gm-1, g.gd);
  }
  if(isJalali()){
    const jc = toJalali(anchor.getFullYear(), anchor.getMonth()+1, anchor.getDate());
    const g = toGregorian(year, jc.jm, 1);
    return new Date(g.gy, g.gm-1, g.gd);
  }
  return new Date(year, anchor.getMonth(), 1);
}

function monthNameFor(i0){ return isHijriPrimary() ? hijriMonthName(i0) : isJalali() ? jalaliMonthName(i0) : monthName(i0); }

function primaryYearOf(anchor){
  if(isHijriPrimary()) return toHijri(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()).hy;
  if(isJalali()) return toJalali(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()).jy;
  return anchor.getFullYear();
}

function primaryMonthOf(anchor){
  if(isHijriPrimary()) return toHijri(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()).hm;
  if(isJalali()) return toJalali(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()).jm;
  return anchor.getMonth()+1;
}

function yearRangeFor(){ return yearRangeForSys(primarySystem()); }

/* Same idea as monthNameFor/primaryYearOf/primaryMonthOf/yearRangeFor/
   setMonthOf/setYearOf above, but parameterized by an explicit system
   instead of always reading the current primary — used by the
   secondary (non-primary) cal-subrow labels, which each need to act on
   their OWN system regardless of which one is primary right now. */
function monthNameForSys(sys, i0){ return sys==='hijri' ? hijriMonthName(i0) : sys==='jalali' ? jalaliMonthName(i0) : monthName(i0); }

function yearOfSys(anchor, sys){
  if(sys==='hijri') return toHijri(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()).hy;
  if(sys==='jalali') return toJalali(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()).jy;
  return anchor.getFullYear();
}

function monthOfSys(anchor, sys){
  if(sys==='hijri') return toHijri(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()).hm;
  if(sys==='jalali') return toJalali(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()).jm;
  return anchor.getMonth()+1;
}

function setMonthOfSys(anchor, sys, monthIndex0){
  if(sys==='hijri'){ const hc = toHijri(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()); const g = hijriToGregorian(hc.hy, monthIndex0+1, 1); return new Date(g.gy,g.gm-1,g.gd); }
  if(sys==='jalali'){ const jc = toJalali(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()); const g = toGregorian(jc.jy, monthIndex0+1, 1); return new Date(g.gy,g.gm-1,g.gd); }
  return new Date(anchor.getFullYear(), monthIndex0, 1);
}

function setYearOfSys(anchor, sys, year){
  if(sys==='hijri'){ const hc = toHijri(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()); const g = hijriToGregorian(year, hc.hm, 1); return new Date(g.gy,g.gm-1,g.gd); }
  if(sys==='jalali'){ const jc = toJalali(anchor.getFullYear(),anchor.getMonth()+1,anchor.getDate()); const g = toGregorian(year, jc.jm, 1); return new Date(g.gy,g.gm-1,g.gd); }
  return new Date(year, anchor.getMonth(), 1);
}

function yearRangeForSys(sys){
  const years = [];
  if(sys==='hijri'){
    const curHY = toHijri(today.getFullYear(),today.getMonth()+1,today.getDate()).hy;
    for(let y = curHY-60; y <= curHY+10; y++) years.push(y);
  } else if(sys==='jalali'){
    const curJY = toJalali(today.getFullYear(), today.getMonth()+1, today.getDate()).jy;
    for(let y = 1369; y <= curJY+10; y++) years.push(y);
  } else {
    for(let y = 1990; y <= today.getFullYear()+10; y++) years.push(y);
  }
  return years;
}
