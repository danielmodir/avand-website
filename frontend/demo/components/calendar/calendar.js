/* ============ TASK RANGES ON THE CALENDAR ============
   While a task or subtask with a date range is selected (long-press /
   right-click, see attachItemSelection), its days are drawn as a light
   capsule with an orange circle on the start day and the deadline. The
   band
   is capped (rounded) wherever the day before/after is not covered, and at week-row edges. */
const MAX_RANGE_DAYS = 400;

function taskRangeMap(){
  const map = new Map(); // dateKey -> { mark: true when a range starts or ends here }
  const add = item => {
    if(item.timeMode !== 'range' || !item.endDate || item.endDate <= item.date) return;
    let d = parseDateKey(item.date);
    for(let i = 0; i < MAX_RANGE_DAYS; i++){
      const key = dateKey(d);
      const entry = map.get(key) || { mark: false };
      if(key === item.date || key === item.endDate) entry.mark = true;
      map.set(key, entry);
      if(key >= item.endDate) break;
      d = addDays(d, 1);
    }
  };
  const sel = state.selection;
  if(sel && (sel.type === 'task' || sel.type === 'subtask')){
    const { item } = findTaskOrSub(sel.id);
    if(item) add(item);
  }
  return map;
}

// col = the cell's column (0-6): a range crossing into the next week row
// is rounded off at the row edge, so each row shows its own capsule.
function rangeCellClass(day, map, col){
  const entry = map.get(dateKey(day));
  if(!entry) return '';
  return [
    'rng',
    (col === 0 || !map.has(dateKey(addDays(day, -1)))) && 'rng-cap-s',
    (col === 6 || !map.has(dateKey(addDays(day, 1)))) && 'rng-cap-e',
    entry.mark && 'rng-mark',
  ].filter(Boolean).join(' ');
}

/* ============ PERIOD PHASES ON THE CALENDAR ============
   While the period desk is the active one (#device.period-desk-active,
   toggled by renderDesktops/syncDesktopTopbar), every day of the
   predicted cycle gets a faint capsule in its phase color — the same
   colors as the cycle ring. The classes are always on the cells; only
   that one #device class fades them in or out, so switching desks
   doesn't re-render the calendar. Cycles repeat from the last period
   start the user entered; nothing is drawn before it. */
function periodPhaseOn(day){
  const p = state.period;
  if(state.profile.gender !== 'female' || !p.enabled || p.step !== 'done' || !p.lastStart || periodAbnormal(p)) return null;
  const since = daysBetween(parseDateKey(p.lastStart), day);
  if(since < 0) return null;
  const { len, segments } = periodCycleSegments();
  const idx = since % len;
  const seg = segments.find(s => idx >= s.start && idx < s.start + s.len);
  return seg && seg.cat !== 'normal' ? seg.cat : null;
}

function periodPhaseClass(day, col){
  const cat = periodPhaseOn(day);
  if(!cat) return '';
  return [
    'ph', 'ph-' + cat,
    (col === 0 || periodPhaseOn(addDays(day, -1)) !== cat) && 'ph-cap-s',
    (col === 6 || periodPhaseOn(addDays(day, 1)) !== cat) && 'ph-cap-e',
  ].filter(Boolean).join(' ');
}

function syncPeriodDeskOnCalendar(activeKey){
  document.getElementById('device')?.classList.toggle('period-desk-active', activeKey === 'periodDesktop');
}

const rangeDotHtml =cls => cls.includes('rng-mark') ? '<span class="rng-dot" aria-hidden="true"></span>' : '';

/* Re-marks the cells already on screen when the selection changes, so
   selecting doesn't re-render (and visibly refresh) the whole page. */
function refreshCalendarRanges(){
  const map = taskRangeMap();
  document.querySelectorAll('#cal-month-grid, #home-cal-grid').forEach(grid => {
    [...grid.querySelectorAll('.day-cell[data-date]')].forEach((cell, i) => {
      cell.classList.remove('rng', 'rng-cap-s', 'rng-cap-e', 'rng-mark');
      cell.querySelector('.rng-dot')?.remove();
      const cls = rangeCellClass(parseDateKey(cell.dataset.date), map, i % 7);
      if(!cls) return;
      cell.classList.add(...cls.split(' '));
      if(cls.includes('rng-mark')) cell.insertAdjacentHTML('afterbegin', rangeDotHtml(cls));
    });
  });
}
/* ============ MERGED CALENDAR WIDGET (mobile only — see
   .home-cal-widget{display:none} in the >=960px block, where the full
   #page-calendar column is used instead) ============
   Collapsed: this week as a 7-day strip. Expanded: full month grid.
   Toggle via the handle (tap or drag) — see attachHomeCalDrag(). Picking
   a date in the expanded grid also collapses back to the strip. */
/* One dot per kind the day has, in that kind's color (Settings → Planning).
   Always on (its setting was removed, 2026-10-25). */
function dayDotsHtml(day){
  const {tasks, events} = itemsForDate(day);
  return (tasks.length ? '<span class="dot-task"></span>' : '') + (events.length ? `<span class="dot-event"${eventColor(events[0]) ? ` style="--event-color:${eventColor(events[0])}"` : ''}></span>` : '');
}

/* fullScreen: every workspace desktop is off (phone only) — the widget is
   the whole page, always the full month, with no expand/collapse handle. */
function renderHomeCalWidget(fullScreen){
  const d = state.homeDate;
  const disp = displayMonthYear(d);
  const cells = monthMatrix(d);
  const ranges = taskRangeMap();
  if(fullScreen) state.calDensity = 'full';
  const cellHtml = (day, i) => {
    const inMonth = cellInCurrentMonth(day, d);
    const isToday = sameDay(day, today);
    const isSelected = sameDay(day, d);
    const rng = rangeCellClass(day, ranges, i % 7);
    return `<button type="button" class="day-cell ${inMonth?'':'other-month'} ${isToday?'today':''} ${isSelected?'selected':''} ${isHolidayOn(day)?'holiday':''} ${isOwnBirthday(day)?'birthday':''} ${periodPhaseClass(day, i % 7)} ${rng}" data-date="${dateKey(day)}" aria-label="${dayLabel(day)}" aria-current="${isToday?'date':'false'}" aria-pressed="${isSelected}">
      <span class="day-cell-bg" aria-hidden="true"></span>${rangeDotHtml(rng)}${dayCellDateHtml(day)}${birthdayMarkHtml(day)}
      <div class="day-dots">${dayDotsHtml(day)}</div>
    </button>`;
  };
  const monthDropdown = state.monthDropdownOpen ? `
    <div class="cal-dropdown" id="home-month-dropdown">
      ${Array.from({length:12},(_,i)=>i).map(i => `<div class="cal-dropdown-item ${(i+1)===primaryMonthOf(d)?'active':''}" data-action="home-pick-month" data-month="${i}">${monthNameFor(i)}</div>`).join('')}
    </div>` : '';
  const yearDropdown = state.yearDropdownOpen ? `
    <div class="cal-dropdown" id="home-year-dropdown">
      ${yearRangeFor().map(y => `<div class="cal-dropdown-item ${y===primaryYearOf(d)?'active':''}" data-action="home-pick-year" data-year="${y}">${toSysDigits(y,primarySystem())}</div>`).join('')}
    </div>` : '';
  return `
    <div class="home-cal-widget ${fullScreen?'home-cal-full':''}" id="home-cal-widget" dir="${lang()==='fa'?'rtl':'ltr'}">
      <div class="cal-topbar home-cal-topbar">
        <div class="cal-corner-arrow ${lang()==='fa'?'right':'left'}" data-action="home-prev-month" aria-label="${t('prev')}">${lang()==='fa'?ICONS.chevronRight:ICONS.chevronLeft}</div>
        <span class="cal-label" id="home-cal-month-label">${disp.monthLabel}</span>
        <span class="cal-label" id="home-cal-year-label">${disp.yearLabel}</span>
        <div class="cal-corner-arrow ${lang()==='fa'?'left':'right'}" data-action="home-next-month" aria-label="${t('next')}">${lang()==='fa'?ICONS.chevronLeft:ICONS.chevronRight}</div>
        ${calFullBtnHtml()}
        ${monthDropdown}${yearDropdown}
      </div>
      <div class="weekday-header">${weekdayOrder().map(i=>`<span>${weekdayShort(i)}</span>`).join('')}</div>
      <div class="home-cal-grid-clip" id="home-cal-grid-clip">
        <div id="home-cal-slide">
          <div class="month-grid" id="home-cal-grid">${cells.map(cellHtml).join('')}</div>
        </div>
      </div>
      ${fullScreen ? '' : '<div class="home-cal-handle" id="home-cal-handle"><span></span></div>'}
    </div>
  `;
}

function monthMatrix(cursor){
  let firstOfMonth;
  if(isHijriPrimary()){
    const hc = toHijri(cursor.getFullYear(), cursor.getMonth()+1, cursor.getDate());
    const g = hijriToGregorian(hc.hy, hc.hm, 1);
    firstOfMonth = new Date(g.gy, g.gm-1, g.gd);
  } else if(isJalali()){
    const jc = toJalali(cursor.getFullYear(), cursor.getMonth()+1, cursor.getDate());
    const g = toGregorian(jc.jy, jc.jm, 1);
    firstOfMonth = new Date(g.gy, g.gm-1, g.gd);
  } else {
    firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  }
  const gridStart = startOfWeek(firstOfMonth);
  let cells = Array.from({length:42}, (_,i) => addDays(gridStart,i));
  /* Drop a trailing week row only when it's entirely next-month filler —
     e.g. if the month's last day falls on a Monday, the grid still
     shows Tue-Sun of that same week as other-month (to complete the
     row), but doesn't add a whole extra all-gray week on top of it. The
     first row never needs this: it always contains day 1 by
     construction, so it's never fully other-month. */
  while(cells.length > 7 && cells.slice(-7).every(d => !cellInCurrentMonth(d, cursor))){
    cells = cells.slice(0, -7);
  }
  return cells;
}

function renderCalendar(){
  const c = state.calCursor;
  let body = '';
  if(state.calMode === 'month'){
    const cells = monthMatrix(c);
    const ranges = taskRangeMap();
    body = `
      <div class="weekday-header">${weekdayOrder().map(i=>`<span>${weekdayShort(i)}</span>`).join('')}</div>
      <div class="month-grid" id="cal-month-grid">
        ${cells.map((d, i) => {
          const inMonth = cellInCurrentMonth(d, c);
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, state.homeDate);
          const rng = rangeCellClass(d, ranges, i % 7);
          return `<button type="button" class="day-cell ${inMonth?'':'other-month'} ${isToday?'today':''} ${isSelected?'selected':''} ${isHolidayOn(d)?'holiday':''} ${isOwnBirthday(d)?'birthday':''} ${periodPhaseClass(d, i % 7)} ${rng}" data-date="${dateKey(d)}" aria-label="${dayLabel(d)}" aria-current="${isToday?'date':'false'}" aria-pressed="${isSelected}">
            <span class="day-cell-bg" aria-hidden="true"></span>${rangeDotHtml(rng)}${dayCellDateHtml(d)}${birthdayMarkHtml(d)}
            <div class="day-dots">${dayDotsHtml(d)}</div>
          </button>`;
        }).join('')}
      </div>`;
  } else if(state.calMode === 'week'){
    const start = startOfWeek(c);
    const days = Array.from({length:7}, (_,i) => addDays(start,i));
    body = `<div class="week-list">${days.map(d => {
      const {tasks,events} = itemsForDate(d);
      const n = tasks.length + events.length;
      return `<div class="week-row ${sameDay(d,today)?'today':''}" data-action="pick-day" data-date="${dateKey(d)}">
        <div class="wd"><span class="num">${displayDayNum(d)}</span><span class="name">${weekdayShort(d.getDay())}</span></div>
        <div class="counts">${n ? n + ' ' + (n>1?t('items'):t('item')) : t('nothingPlanned')}</div>
      </div>`;
    }).join('')}</div>`;
  } else if(state.calMode === 'day'){
    const {tasks, habits, events} = itemsForDate(c);
    body = `
      <div class="empty-hint" style="margin-bottom:10px; border-style:solid; background:var(--bg-soft); padding:10px 14px;">${dayLabel(c)}</div>
      ${renderItemSections(tasks, habits, events, c)}
    `;
  }

  const disp = displayMonthYear(c);
  const monthDropdown = state.monthDropdownOpen ? `
    <div class="cal-dropdown" id="month-dropdown">
      ${Array.from({length:12},(_,i)=>i).map(i => `<div class="cal-dropdown-item ${(i+1)===primaryMonthOf(c)?'active':''}" data-action="pick-month" data-month="${i}">${monthNameFor(i)}</div>`).join('')}
    </div>` : '';
  const yearDropdown = state.yearDropdownOpen ? `
    <div class="cal-dropdown" id="year-dropdown">
      ${yearRangeFor().map(y => `<div class="cal-dropdown-item ${y===primaryYearOf(c)?'active':''}" data-action="pick-year" data-year="${y}">${toSysDigits(y,primarySystem())}</div>`).join('')}
    </div>` : '';

  /* Icon-only prev/next arrows now show in every mode, not just week/
     day — month mode used to have no visible way to step the month
     besides the (undiscoverable) roll/drag gesture on the label, no
     text on the buttons themselves (just the chevron), matching the
     reference's icon-only nav. */
  const prevAction = state.calMode === 'day' ? 'cal-prev-day' : state.calMode === 'week' ? 'cal-prev-week' : 'cal-prev-month';
  const nextAction = state.calMode === 'day' ? 'cal-next-day' : state.calMode === 'week' ? 'cal-next-week' : 'cal-next-month';

  return `
    <div id="cal-content">
      <div class="cal-topbar">
        <div class="cal-corner-arrow ${lang()==='fa'?'right':'left'}" data-action="${prevAction}" aria-label="${t('prev')}">${lang()==='fa'?ICONS.chevronRight:ICONS.chevronLeft}</div>
        <span class="cal-label" id="cal-month-label" data-action="tap-month">${disp.monthLabel}</span>
        <span class="cal-label" id="cal-year-label" data-action="tap-year">${disp.yearLabel}</span>
        <div class="cal-corner-arrow ${lang()==='fa'?'left':'right'}" data-action="${nextAction}" aria-label="${t('next')}">${lang()==='fa'?ICONS.chevronLeft:ICONS.chevronRight}</div>
        ${calFullBtnHtml()}
        ${monthDropdown}${yearDropdown}
      </div>
      <div class="cal-mode-tabs">
        <button class="${state.calMode==='day'?'active':''}" data-action="set-cal-mode" data-mode="day">${t('day')}</button>
        <button class="${state.calMode==='week'?'active':''}" data-action="set-cal-mode" data-mode="week">${t('week')}</button>
        <button class="${state.calMode==='month'?'active':''}" data-action="set-cal-mode" data-mode="month">${t('month')}</button>
      </div>
      <div id="cal-gesture-area">${body}</div>
    </div>
  `;
}

/* ============ FULL-SCREEN MONTH (like Google Calendar's month view) ============
   The expand button on either calendar (phone widget / desktop column)
   opens the month over the whole app: big day cells, each listing that
   day's occasions, events and tasks. A chip opens the item's editor;
   tapping a day picks it and returns to the normal view on that day.
   Back (js/core/back-nav.js), the button or Esc closes it. */
const CAL_EXPAND_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h7v2H7.4l4.3 4.3-1.4 1.4L6 7.4V11H4V4zm16 16h-7v-2h3.6l-4.3-4.3 1.4-1.4 4.3 4.3V13h2v7z"/></svg>';
const CAL_SHRINK_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 4h2v7H4V9h3.6L3.3 4.7l1.4-1.4L9 7.6V4zm6 16h-2v-7h7v2h-3.6l4.3 4.3-1.4 1.4-4.3-4.3V20z"/></svg>';

function calFullBtnHtml(){
  return `<button type="button" class="cal-full-btn" data-action="toggle-cal-full" aria-label="${t('calFull')}" title="${t('calFull')}">${CAL_EXPAND_SVG}</button>`;
}

function calFullChips(day){
  const key = dateKey(day);
  const chips = [];
  if(pref('occasionsEnabled')){
    (visibleOccasionsForDate(day) || []).forEach(o => chips.push(
      `<span class="cf-chip cf-occ ${o.is_holiday?'holiday':''}">${escapeHtml(o.event_name)}</span>`));
  }
  const { tasks, events } = itemsForDate(day);
  sortEvents(events).forEach(e => {
    const time = eventTime(e);
    chips.push(`<span class="cf-chip cf-event"${eventColor(e) ? ` style="--event-color:${eventColor(e)};--event-on:${colorIsLight(eventColor(e)) ? '#1A1708' : '#FFFFFF'}"` : ''} data-action="view-item" data-type="event" data-id="${e.id}">${time ? `<b dir="ltr">${dig(time)}</b> ` : ''}${escapeHtml(e.title)}</span>`);
  });
  tasks.forEach(tk => {
    const st = taskStatusOn(tk, key);
    chips.push(`<span class="cf-chip cf-task ${st === 'done' ? 'done' : st === 'not_done' ? 'missed' : ''}" data-action="view-item" data-type="task" data-id="${tk.id}">${tk.startTime ? `<b dir="ltr">${dig(tk.startTime)}</b> ` : ''}${escapeHtml(tk.title)}</span>`);
  });
  return chips;
}

function renderCalFull(){
  const c = state.calFullCursor || state.homeDate;
  const cells = monthMatrix(c);
  const rows = cells.length / 7;
  const disp = displayMonthYear(c);
  const limit = window.innerWidth < 960 ? 2 : 4; // chips per day before "+n"
  const fa = lang() === 'fa';
  const cellHtml = day => {
    const chips = calFullChips(day);
    const shown = chips.length > limit + 1 ? chips.slice(0, limit) : chips;
    const more = chips.length - shown.length;
    return `<div class="cf-cell ${cellInCurrentMonth(day, c)?'':'other-month'} ${sameDay(day, today)?'today':''} ${sameDay(day, state.homeDate)?'selected':''} ${isHolidayOn(day)?'holiday':''} ${isOwnBirthday(day)?'birthday':''}" data-action="cal-full-pick" data-date="${dateKey(day)}" role="button" tabindex="0" aria-label="${dayLabel(day)}">
      <div class="cf-head">${dayCellDateHtml(day)}${birthdayMarkHtml(day)}</div>
      <div class="cf-chips">${shown.join('')}${more ? `<span class="cf-more">+${dig(more)}</span>` : ''}</div>
    </div>`;
  };
  return `
    <div class="cal-full" dir="${fa?'rtl':'ltr'}">
      <div class="cf-top">
        <button type="button" class="cal-full-btn cf-exit" data-action="toggle-cal-full" aria-label="${t('deskExitFull')}" title="${t('deskExitFull')}">${CAL_SHRINK_SVG}</button>
        <div class="cf-nav">
          <button type="button" class="cf-arrow" data-action="cal-full-step" data-dir="-1" aria-label="${t('prev')}">${fa?ICONS.chevronRight:ICONS.chevronLeft}</button>
          <h2 class="cf-title" id="cf-title">${disp.monthLabel} ${disp.yearLabel}</h2>
          <button type="button" class="cf-arrow" data-action="cal-full-step" data-dir="1" aria-label="${t('next')}">${fa?ICONS.chevronLeft:ICONS.chevronRight}</button>
        </div>
        <button type="button" class="cf-today" data-action="cal-full-today">${t('today')}</button>
      </div>
      <div class="weekday-header cf-weekdays">${weekdayOrder().map(i=>`<span>${weekdayShort(i)}</span>`).join('')}</div>
      <div class="cf-grid" id="cf-grid" style="grid-template-rows:repeat(${rows}, minmax(0, 1fr));">${cells.map(cellHtml).join('')}</div>
    </div>`;
}

/* Keeps #cal-full-root (inside #device, so the app's click handler
   covers it) in step with state.calFull. */
function syncCalFull(){
  let root = document.getElementById('cal-full-root');
  if(!state.calFull){ if(root) root.remove(); document.getElementById('device').classList.remove('cal-full-open'); return; }
  const opening = !root;
  if(!root){
    root = document.createElement('div');
    root.id = 'cal-full-root';
    document.getElementById('device').appendChild(root);
  }
  root.innerHTML = renderCalFull();
  root.classList.toggle('cf-enter', opening);
  document.getElementById('device').classList.add('cal-full-open');
  attachCalFullGestures(root);
}

function stepCalFull(dir){
  state.calFullCursor = stepMonth(state.calFullCursor || state.homeDate, dir);
  render();
  const grid = document.getElementById('cf-grid');
  if(grid && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    // Slide in from the side the arrow points to (mirrored in Persian).
    const from = (dir > 0) !== (lang() === 'fa') ? 24 : -24;
    grid.animate([{ transform:`translateX(${from}px)`, opacity:.4 }, { transform:'none', opacity:1 }], { duration:240, easing:'cubic-bezier(.22,1,.36,1)' });
  }
}

/* Horizontal swipe / trackpad over the grid changes the month, same
   directions as the small calendars (calDragDir / calWheelDir). */
function attachCalFullGestures(root){
  const grid = root.querySelector('#cf-grid');
  if(!grid) return;
  let x0 = null, y0 = null, lastWheel = 0;
  grid.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; });
  grid.addEventListener('pointerup', e => {
    if(x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5){
      grid.dataset.swiped = '1'; // the click that follows isn't a day pick
      setTimeout(() => { delete grid.dataset.swiped; }, 0);
      stepCalFull(calDragDir(dx));
    }
  });
  grid.addEventListener('wheel', e => {
    if(Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 30 || Date.now() - lastWheel < 400) return;
    lastWheel = Date.now();
    stepCalFull(calWheelDir(e.deltaX));
  }, { passive: true });
}

document.addEventListener('keydown', e => {
  if(!state.calFull || state.popupOpen || e.target.closest?.('input, textarea')) return;
  if(e.key === 'Escape'){ state.calFull = false; render(); }
  else if(e.key === 'ArrowLeft' || e.key === 'ArrowRight') stepCalFull((e.key === 'ArrowRight') !== (lang() === 'fa') ? 1 : -1);
});

function shiftWeek(dir){ state.calCursor = addDays(state.calCursor, 7*dir); render(); }

function shiftDay(dir){ state.calCursor = addDays(state.calCursor, dir); render(); }

/* Desktop-only: trackpad horizontal swipe over the calendar grid moves
   to the previous/next day, week or month depending on the active tab —
   same debounced deltaX-dominant pattern as the Home widget's version. */
function initCalendarWheelSwipe(){
  const el = document.getElementById('page-calendar');
  if(!el) return;
  let lastWheelNav = 0;
  el.addEventListener('wheel', (e) => {
    if(Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    if(Math.abs(e.deltaX) < 30 || Date.now() - lastWheelNav < 400) return;
    lastWheelNav = Date.now();
    const dir = calWheelDir(e.deltaX); // same direction as the arrows, mirrored in Persian
    if(state.calMode === 'month') shiftMonthRoll(dir);
    else if(state.calMode === 'week') shiftWeek(dir);
    else shiftDay(dir);
  }, { passive: true });
}
