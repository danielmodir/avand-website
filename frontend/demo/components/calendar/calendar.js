/* ============ MERGED CALENDAR WIDGET (mobile only — see
   .home-cal-widget{display:none} in the >=960px block, where the full
   #page-calendar column is used instead) ============
   Collapsed: this week as a 7-day strip. Expanded: full month grid.
   Toggle via the handle (tap or drag) — see attachHomeCalDrag(). Picking
   a date in the expanded grid also collapses back to the strip. */
function renderHomeCalWidget(){
  const d = state.homeDate;
  const disp = displayMonthYear(d);
  const cells = monthMatrix(d);
  const cellHtml = (day) => {
    const inMonth = cellInCurrentMonth(day, d);
    const {tasks, events} = itemsForDate(day);
    const hasAny = tasks.length || events.length;
    const isToday = sameDay(day, today);
    const isSelected = sameDay(day, d);
    return `<button type="button" class="day-cell ${inMonth?'':'other-month'} ${isToday?'today':''} ${isSelected?'selected':''}" data-date="${dateKey(day)}" aria-label="${dayLabel(day)}" aria-current="${isToday?'date':'false'}" aria-pressed="${isSelected}">
      ${dayCellDateHtml(day)}
      <div class="day-dots">${hasAny?'<span></span>':''}</div>
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
    <div class="home-cal-widget" id="home-cal-widget" dir="${lang()==='fa'?'rtl':'ltr'}">
      <div class="cal-topbar home-cal-topbar">
        <div class="cal-corner-arrow ${lang()==='fa'?'right':'left'}" data-action="home-prev-month" aria-label="${t('prev')}">${lang()==='fa'?ICONS.chevronRight:ICONS.chevronLeft}</div>
        <span class="cal-label" id="home-cal-month-label">${disp.monthLabel}</span>
        <span class="cal-label" id="home-cal-year-label">${disp.yearLabel}</span>
        <div class="cal-corner-arrow ${lang()==='fa'?'left':'right'}" data-action="home-next-month" aria-label="${t('next')}">${lang()==='fa'?ICONS.chevronLeft:ICONS.chevronRight}</div>
        ${monthDropdown}${yearDropdown}
      </div>
      <div class="weekday-header">${weekdayOrder().map(i=>`<span>${weekdayShort(i)}</span>`).join('')}</div>
      <div class="home-cal-grid-clip" id="home-cal-grid-clip">
        <div id="home-cal-slide">
          <div class="month-grid" id="home-cal-grid">${cells.map(cellHtml).join('')}</div>
        </div>
      </div>
      <div class="home-cal-handle" id="home-cal-handle"><span></span></div>
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
    body = `
      <div class="weekday-header">${weekdayOrder().map(i=>`<span>${weekdayShort(i)}</span>`).join('')}</div>
      <div class="month-grid" id="cal-month-grid">
        ${cells.map(d => {
          const inMonth = cellInCurrentMonth(d, c);
          const {tasks,events} = itemsForDate(d);
          const hasAny = tasks.length || events.length;
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, state.homeDate);
          return `<button type="button" class="day-cell ${inMonth?'':'other-month'} ${isToday?'today':''} ${isSelected?'selected':''}" data-date="${dateKey(d)}" aria-label="${dayLabel(d)}" aria-current="${isToday?'date':'false'}" aria-pressed="${isSelected}">
            ${dayCellDateHtml(d)}
            <div class="day-dots">${hasAny?'<span></span>':''}</div>
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
    const dir = e.deltaX > 0 ? 1 : -1;
    if(state.calMode === 'month') shiftMonthRoll(dir);
    else if(state.calMode === 'week') shiftWeek(dir);
    else shiftDay(dir);
  }, { passive: true });
}
