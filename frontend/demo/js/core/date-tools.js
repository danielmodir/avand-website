/* ============ DATE TOOLS (Profile → Date tools) ============
   Converter (Solar Hijri ↔ Gregorian ↔ lunar Hijri), the gap between two
   dates and an age calculator. All on the phone; the calendars come from
   calendars.js (the Hijri one from the official month table).
   Tests: tests/date-tools.test.js. */

/* The Gregorian day of y-m-d in `sys`, or null when there's no such day. */
function convertDate(sys, y, m, d){
  y = Math.round(Number(y)); m = Math.round(Number(m)); d = Math.round(Number(d));
  if(!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  let g;
  if(sys === 'jalali') g = toGregorian(y, m, d);
  else if(sys === 'hijri') g = hijriToGregorian(y, m, d);
  else g = { gy: y, gm: m, gd: d };
  const date = new Date(g.gy, g.gm - 1, g.gd);
  // Round trip: 31 Esfand or 30 Safar where the month is shorter isn't a day.
  const back = sys === 'jalali' ? toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
    : sys === 'hijri' ? toHijri(date.getFullYear(), date.getMonth() + 1, date.getDate()) : null;
  if(sys === 'jalali' && (back.jy !== y || back.jm !== m || back.jd !== d)) return null;
  if(sys === 'hijri' && (back.hy !== y || back.hm !== m || back.hd !== d)) return null;
  if(sys === 'gregorian' && (date.getMonth() + 1 !== m || date.getDate() !== d)) return null;
  return date;
}

/* From a to b (either order): whole days, and years / months / days. */
function dateSpan(a, b){
  let x = new Date(a.getFullYear(), a.getMonth(), a.getDate()), z = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  if(x > z){ const s = x; x = z; z = s; }
  const days = Math.round((Date.UTC(z.getFullYear(), z.getMonth(), z.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000);
  // Whole months from a (a 31st lands on the month's last day when it's shorter), then the days left.
  const plus = n => { const t = new Date(x.getFullYear(), x.getMonth() + n, 1); t.setDate(Math.min(x.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return t; };
  let months = (z.getFullYear() - x.getFullYear()) * 12 + z.getMonth() - x.getMonth();
  if(plus(months) > z) months--;
  const d = Math.round((Date.UTC(z.getFullYear(), z.getMonth(), z.getDate()) - Date.UTC(plus(months).getFullYear(), plus(months).getMonth(), plus(months).getDate())) / 86400000);
  return { days, y: Math.floor(months / 12), m: months % 12, d };
}

if(typeof module !== 'undefined') module.exports = { convertDate, dateSpan };

/* ---- the page (components/menu: sub 'date-tools') ---- */
const dtState = { sys: null, y: '', m: '', d: '', from: null, to: null, dob: null };

function spanText(s){
  const parts = [[s.y, 'dtYears'], [s.m, 'dtMonths'], [s.d, 'dtDays']].filter(p => p[0]).map(p => t(p[1]).replace('{n}', dig(p[0])));
  return parts.join(lang() === 'fa' ? ' و ' : ', ') || t('dtSameDay');
}
function dayInAllCalendars(date){
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate(), j = toJalali(y, m, d), h = toHijri(y, m, d);
  return [weekdayFull(date.getDay()),
    `${toSysDigits(j.jd, 'jalali')} ${jalaliMonthName(j.jm - 1)} ${toSysDigits(j.jy, 'jalali')}`,
    `${toSysDigits(d, 'gregorian')} ${monthName(m - 1)} ${toSysDigits(y, 'gregorian')}`,
    `${toSysDigits(h.hd, 'hijri')} ${hijriMonthName(h.hm - 1)} ${toSysDigits(h.hy, 'hijri')}`];
}

function renderDateToolsPage(){
  if(!dtState.sys){
    const j = toJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    Object.assign(dtState, { sys: 'jalali', y: j.jy, m: j.jm, d: j.jd, from: dateKey(today), to: dateKey(addDays(today, 30)), dob: state.profile.dob || '' });
  }
  const conv = convertDate(dtState.sys, dtState.y, dtState.m, dtState.d);
  const btn = (id, v) => `<button type="button" class="dob-field-btn" data-action="dt-pick" data-k="${id}">${ICONS.calendarIcon}<span>${v ? formatDateLabel(v) : t('dtPick')}</span></button>`;
  const span = dateSpan(parseDateKey(dtState.from), parseDateKey(dtState.to));
  let age = '';
  if(dtState.dob && dtState.dob <= dateKey(today)){
    const s = dateSpan(parseDateKey(dtState.dob), today);
    let next = 0; while(next < 367 && !isBirthdayOn(dtState.dob, addDays(today, next))) next++;
    age = `<div class="dt-result"><b>${spanText(s)}</b><div class="sub">${t('dtLived').replace('{n}', dig(s.days.toLocaleString('en-US')))} · ${next === 0 ? t('dtBirthdayToday') : t('dtNextBirthday').replace('{n}', dig(next))}</div></div>`;
  }
  return `
    ${subHeader(t('dateTools'))}
    <div class="section-title">${t('dtConvert')}</div>
    <div class="dt-row">
      <select class="settings-select" id="dt-sys" aria-label="${escapeAttr(t('calendarSystem'))}">${['jalali', 'gregorian', 'hijri'].map(s => `<option value="${s}" ${dtState.sys === s ? 'selected' : ''}>${t(s)}</option>`).join('')}</select>
      <input type="number" id="dt-d" class="dt-num" inputmode="numeric" value="${dtState.d}" aria-label="${t('dtDay')}" placeholder="${t('dtDay')}">
      <input type="number" id="dt-m" class="dt-num" inputmode="numeric" value="${dtState.m}" aria-label="${t('dtMonth')}" placeholder="${t('dtMonth')}">
      <input type="number" id="dt-y" class="dt-num dt-year" inputmode="numeric" value="${dtState.y}" aria-label="${t('dtYear')}" placeholder="${t('dtYear')}">
    </div>
    <div class="dt-result">${conv ? dayInAllCalendars(conv).map((l, i) => i ? `<div>${l}</div>` : `<b>${l}</b>`).join('') : t('dtNoSuchDay')}</div>
    <div class="section-title">${t('dtBetween')}</div>
    <div class="dt-row">${btn('from', dtState.from)}${btn('to', dtState.to)}</div>
    <div class="dt-result"><b>${t('dtDaysCount').replace('{n}', dig(span.days.toLocaleString('en-US')))}</b>${span.y || span.m ? `<div class="sub">${spanText(span)}</div>` : ''}</div>
    <div class="section-title">${t('dtAge')}</div>
    <div class="dt-row">${btn('dob', dtState.dob)}</div>
    ${age}`;
}

function wireDateTools(){
  const sel = document.getElementById('dt-sys');
  if(!sel) return;
  sel.addEventListener('change', () => {
    // Keep the same day, shown in the newly chosen calendar.
    const cur = convertDate(dtState.sys, dtState.y, dtState.m, dtState.d) || today;
    const y = cur.getFullYear(), m = cur.getMonth() + 1, d = cur.getDate();
    const v = sel.value === 'jalali' ? (o => [o.jy, o.jm, o.jd])(toJalali(y, m, d)) : sel.value === 'hijri' ? (o => [o.hy, o.hm, o.hd])(toHijri(y, m, d)) : [y, m, d];
    Object.assign(dtState, { sys: sel.value, y: v[0], m: v[1], d: v[2] });
    render();
  });
  ['y', 'm', 'd'].forEach(k => document.getElementById('dt-' + k).addEventListener('change', e => { dtState[k] = e.target.value; render(); }));
}

function pickDateToolsDay(k){
  openDatePicker({ title: t(k === 'dob' ? 'dtAge' : 'dtBetween'), value: dtState[k] || '', min: dateKey(stepYear(today, -120)), max: k === 'dob' ? dateKey(today) : dateKey(stepYear(today, 50)),
    onPick: v => { dtState[k] = v; render(); } });
}
