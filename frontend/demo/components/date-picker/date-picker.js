/* Small date-picker popup, built like the main calendar (same topbar,
   weekday row and day circles, in the primary calendar system from
   Settings) — used for the date of birth (sign-up, Profile), a task's
   date or range (add popup) and the period setup.

   openDatePicker({
     value: 'YYYY-MM-DD' | '', end: 'YYYY-MM-DD' (range only),
     range: false,          // true: tap a day, or press and drag for a range
     min, max: 'YYYY-MM-DD' (optional; days outside can't be picked),
     title: '…',
     time: { start, end },  // optional: start time, and an end time that
                            // only opens with the "end time" tick
     onPick(value, end, time) // single mode closes on the first tap;
                              // time = { start, end } ('' = none)
   })

   It's its own element on top of everything (not part of render()) and
   uses data-dp attributes, not data-action, so it also works inside the
   sign-up popup a guest sees. */
let dp = null; // the open picker's state, or null

function openDatePicker(opts){
  const min = opts.min || dateKey(stepYear(today, -100));
  const max = opts.max || dateKey(stepYear(today, 10));
  const value = opts.value || '';
  const start = value || (dateKey(today) > max ? max : dateKey(today) < min ? min : dateKey(today));
  dp = {
    title: opts.title || '', range: !!opts.range, min, max, onPick: opts.onPick,
    value, end: opts.range ? (opts.end || value) : '',
    cursor: new Date(start + 'T00:00:00'), view: 'days',
    time: opts.time ? { start: opts.time.start || '', end: opts.time.end || '', hasEnd: !!opts.time.end } : null,
  };
  let el = document.getElementById('date-picker');
  if(!el){
    el = document.createElement('div');
    el.id = 'date-picker';
    el.className = 'dp-overlay';
    document.getElementById('device').appendChild(el);
    wireDatePicker(el);
  }
  renderDatePicker();
  queueBackSync(); // Back closes the picker (js/core/back-nav.js)
  requestAnimationFrame(() => { if(dp) el.classList.add('show'); }); // not if closed in the meantime
}

function closeDatePicker(){
  const el = document.getElementById('date-picker');
  if(!dp || !el) return;
  dp = null;
  el.classList.remove('show');
  queueBackSync();
}

function dpFinish(){
  const { onPick, value, end, range, time } = dp;
  let picked = null;
  if(time){
    picked = { start: time.start || '', end: time.hasEnd ? (time.end || '') : '' };
    if(time.hasEnd && !picked.end){ showToast(t('endTimeRequired')); return; }
    // Same day: the end can't come before the start.
    if(picked.start && picked.end && (!range || (end || value) === value) && picked.end <= picked.start){ showToast(t('endBeforeStart')); return; }
  }
  closeDatePicker();
  if(onPick && value) onPick(value, range ? (end || value) : value, picked);
}

function dpTimeHtml(){
  const tm = dp.time;
  return `<div class="dp-time">
    <label class="dp-time-row"><span>${t('startTime')}</span><input type="time" id="dp-start" value="${tm.start}" dir="ltr"></label>
    <label class="dp-time-check"><input type="checkbox" id="dp-has-end" ${tm.hasEnd ? 'checked' : ''}><span>${t('endTimeToggle')}</span></label>
    <label class="dp-time-row ${tm.hasEnd ? '' : 'off'}"><span>${t('endTime')}</span><input type="time" id="dp-end" value="${tm.end}" dir="ltr" ${tm.hasEnd ? '' : 'disabled'}></label>
  </div>`;
}

/* First day of the month `d` is in (primary calendar system). */
function dpMonthStart(d){ return setMonthOf(d, primaryMonthOf(d) - 1); }

function dpYears(){
  const years = [];
  for(let y = primaryYearOf(new Date(dp.max + 'T00:00:00')); y >= primaryYearOf(new Date(dp.min + 'T00:00:00')); y--) years.push(y);
  return years;
}

function dpCellHtml(d){
  const key = dateKey(d);
  const off = key < dp.min || key > dp.max;
  const inMonth = cellInCurrentMonth(d, dp.cursor);
  const lo = dp.value, hi = dp.range ? (dp.end || dp.value) : dp.value;
  const isEdge = key === lo || key === hi;
  const between = dp.range && lo && hi && key > lo && key < hi;
  const cls = ['day-cell', inMonth ? '' : 'other-month', sameDay(d, today) ? 'today' : '', isEdge ? 'selected' : '',
    between ? 'dp-between' : '', off ? 'dp-off' : ''].join(' ');
  return `<button type="button" class="${cls}" data-dp-date="${key}" ${off ? 'disabled' : ''} aria-label="${dayLabel(d)}" aria-pressed="${isEdge}">
    <span class="day-cell-bg" aria-hidden="true"></span>${dayCellDateHtml(d)}</button>`;
}

function renderDatePicker(){
  const el = document.getElementById('date-picker');
  if(!el || !dp) return;
  const fa = lang() === 'fa';
  const disp = displayMonthYear(dp.cursor);
  const monthStart = dpMonthStart(dp.cursor);
  const prevOff = dateKey(monthStart) <= dp.min;
  const nextOff = dateKey(stepMonth(dp.cursor, 1)) > dp.max;
  let body;
  if(dp.view === 'months'){
    const cur = primaryMonthOf(dp.cursor);
    body = `<div class="dp-pick-grid">${Array.from({length:12}, (_, i) => `<button type="button" class="${i + 1 === cur ? 'active' : ''}" data-dp-month="${i}">${monthNameFor(i)}</button>`).join('')}</div>`;
  } else if(dp.view === 'years'){
    const cur = primaryYearOf(dp.cursor);
    body = `<div class="dp-pick-grid dp-years">${dpYears().map(y => `<button type="button" class="${y === cur ? 'active' : ''}" data-dp-year="${y}">${toSysDigits(y, primarySystem())}</button>`).join('')}</div>`;
  } else {
    body = `
      <div class="weekday-header">${weekdayOrder().map(i => `<span>${weekdayShort(i)}</span>`).join('')}</div>
      <div class="month-grid dp-grid" id="dp-grid">${monthMatrix(dp.cursor).map(dpCellHtml).join('')}</div>
      ${dp.range ? `<div class="dp-hint">${t('tapOrDrag')}</div>` : ''}
      ${dp.time ? dpTimeHtml() : ''}`;
  }
  el.innerHTML = `
    <div class="dp-card" role="dialog" aria-modal="true" aria-label="${escapeAttr(dp.title)}" dir="${fa ? 'rtl' : 'ltr'}">
      <div class="dp-head">
        <span class="dp-title">${escapeHtml(dp.title)}</span>
        <button type="button" class="popup-close dp-x" data-dp="close" aria-label="${t('closeBtn')}">${ICONS.close}</button>
      </div>
      <div class="cal-topbar dp-topbar">
        <button type="button" class="cal-corner-arrow ${fa ? 'right' : 'left'}" data-dp="prev" ${prevOff ? 'disabled' : ''} aria-label="${t('prev')}">${fa ? ICONS.chevronRight : ICONS.chevronLeft}</button>
        <button type="button" class="cal-label ${dp.view === 'months' ? 'on' : ''}" data-dp="months">${disp.monthLabel}</button>
        <button type="button" class="cal-label ${dp.view === 'years' ? 'on' : ''}" data-dp="years">${disp.yearLabel}</button>
        <button type="button" class="cal-corner-arrow ${fa ? 'left' : 'right'}" data-dp="next" ${nextOff ? 'disabled' : ''} aria-label="${t('next')}">${fa ? ICONS.chevronLeft : ICONS.chevronRight}</button>
      </div>
      ${body}
      ${dp.range && dp.view === 'days' ? `<button type="button" class="btn btn-primary dp-done" data-dp="done" ${dp.value ? '' : 'disabled'}>${t('dpDone')}</button>` : ''}
    </div>`;
  if(dp.view === 'years') el.querySelector('.dp-years .active')?.scrollIntoView({ block:'center' });
}

function wireDatePicker(el){
  el.addEventListener('click', e => {
    if(!dp) return;
    if(e.target === el){ closeDatePicker(); return; } // the dimmed backdrop
    const b = e.target.closest('[data-dp], [data-dp-month], [data-dp-year], [data-dp-date]');
    if(!b || b.disabled) return;
    const act = b.dataset.dp;
    if(act === 'close'){ closeDatePicker(); return; }
    if(act === 'done'){ dpFinish(); return; }
    if(act === 'prev' || act === 'next'){ dp.cursor = stepMonth(dp.cursor, act === 'prev' ? -1 : 1); dp.view = 'days'; }
    else if(act === 'months' || act === 'years'){ dp.view = dp.view === act ? 'days' : act; }
    else if(b.dataset.dpMonth !== undefined){ dp.cursor = setMonthOf(dp.cursor, Number(b.dataset.dpMonth)); dp.view = 'days'; }
    else if(b.dataset.dpYear !== undefined){ dp.cursor = setYearOf(dp.cursor, Number(b.dataset.dpYear)); dp.view = 'months'; }
    else if(b.dataset.dpDate && !dp.range){ dp.value = b.dataset.dpDate; dpFinish(); return; }
    else return; // range taps are handled by the pointer events below
    renderDatePicker();
  });

  // Range mode: press a day, drag to another to make a range.
  let anchor = null;
  const keyAt = e => {
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-dp-date]');
    return cell && !cell.disabled ? cell.dataset.dpDate : null;
  };
  el.addEventListener('pointerdown', e => {
    if(!dp || !dp.range) return;
    const key = e.target.closest('[data-dp-date]:not([disabled])')?.dataset.dpDate;
    if(!key) return;
    anchor = key; dp.value = key; dp.end = key;
    e.target.releasePointerCapture?.(e.pointerId);
    renderDatePicker();
  });
  el.addEventListener('pointermove', e => {
    if(!dp || !anchor) return;
    const key = keyAt(e);
    if(!key) return;
    const [lo, hi] = key < anchor ? [key, anchor] : [anchor, key];
    if(lo === dp.value && hi === dp.end) return;
    dp.value = lo; dp.end = hi;
    renderDatePicker();
  });
  // Time fields (dp.time): kept in dp so re-renders of the grid keep them.
  el.addEventListener('input', e => {
    if(!dp || !dp.time) return;
    if(e.target.id === 'dp-start') dp.time.start = e.target.value;
    else if(e.target.id === 'dp-end') dp.time.end = e.target.value;
  });
  el.addEventListener('change', e => {
    if(!dp || !dp.time || e.target.id !== 'dp-has-end') return;
    dp.time.hasEnd = e.target.checked;
    if(!dp.time.hasEnd) dp.time.end = '';
    renderDatePicker();
    if(dp.time.hasEnd) document.getElementById('dp-end')?.focus();
  });

  const end = () => { anchor = null; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // Esc closes only the picker, not the popup under it.
  document.addEventListener('keydown', e => {
    if(dp && e.key === 'Escape'){ e.stopImmediatePropagation(); closeDatePicker(); }
  }, true);
}

/* The latest birth date allowed: someone at least `years` old today. */
function dateYearsAgo(years){
  const d = new Date(today);
  d.setFullYear(d.getFullYear() - years);
  return dateKey(d);
}

/* "۲۵ مهر ۱۳۷۴" style label for a stored 'YYYY-MM-DD', in the primary
   calendar system. */
function formatDateLabel(key){
  if(!key) return '';
  const d = new Date(key + 'T00:00:00');
  const disp = displayMonthYear(d);
  return `${displayDayNum(d)} ${disp.monthLabel} ${disp.yearLabel}`;
}
