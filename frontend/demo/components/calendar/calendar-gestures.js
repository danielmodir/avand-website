/* "اسکرول درجا" — scroll/touch-driven density morph for the month grid,
   phone-only (ported in spirit, not in code, from calendar09.html's
   feed()/setMode state machine: a gesture-to-state-machine mapping with
   hysteresis, not real page scrolling or CSS scroll-snap). Re-themed to
   this app's own .month-grid/.day-cell markup rather than the
   reference's. */
const CAL_DENSITY_ORDER = ['full','mid','compact'];

/* `el` is the gesture surface (the month grid); `scopeEl` is the page
   container the data-density attribute is set on, so CSS can also
   shrink siblings of the grid (weekday header, month/year title) —
   matching the reference's broader "hide .goto, shrink title, hide nav
   arrows, shrink .occwrap" compaction, not just the grid itself. Also
   calls preventDefault on the wheel/touch handlers so this gesture
   exclusively drives density instead of fighting with the page's own
   vertical scroll underneath it, the way the reference's gesture was
   the only thing listening (it wasn't embedded in a taller scrolling
   page the way this app's calendar/home pages are). */
/* Resets density back to "full" when the viewport crosses the phone/
   desktop breakpoint, so a resize (or a device rotation) doesn't leave
   a compacted grid stuck on a layout that no longer needs it. */
if(!window.__densityBreakpointWatcher){
  window.__densityBreakpointWatcher = true;
  window.matchMedia('(min-width:768px)').addEventListener('change', () => {
    state.calDensity = 'full';
    render();
  });
}

/* Which way a sideways drag/scroll goes, matching the arrow buttons: in
   Persian the calendar is right-to-left (the "next" arrow is on the
   left), so dragging the content to the right shows the next month; in
   English it's the other way round. 1 = forward, -1 = back. */
function calDragDir(dx){ return (lang() === 'fa' ? dx > 0 : dx < 0) ? 1 : -1; }
function calWheelDir(deltaX){ return (lang() === 'fa' ? deltaX < 0 : deltaX > 0) ? 1 : -1; }

/* Horizontal wheel/trackpad scroll over the month grid steps the month,
   matching the arrow buttons' own right=previous/left=next convention —
   scrolling "right" (deltaX>0) goes back, "left" (deltaX<0) goes
   forward. Vertical scroll is left alone here (handled separately by
   attachDensityGesture on mobile); only fires when the gesture is
   clearly horizontal, so a vertical density scroll never also steps
   the month by accident. Wheel-only (not touch) — the desktop grid has
   no touch surface of its own, and the mobile home widget already has
   its own horizontal touch-drag via attachHomeCalDrag(). */
function attachCalWheelMonthNav(el, stepFn){
  if(!el) return;
  // A single trackpad swipe fires many deltaX events in a row — the old
  // "step on the first event, then ignore for 350ms" version still let
  // several of those through before the cooldown caught up, so one
  // physical swipe could jump 2-3 months. Now it requires the
  // accumulated distance to cross a real threshold (same idea as
  // attachDensityGesture's own acc/feed), and locks out further steps
  // for longer afterward so trailing trackpad inertia can't sneak in
  // an extra jump once the swipe has already been "spent".
  let acc = 0, settling = false, resetTimer = null;
  el.addEventListener('wheel', e => {
    if(Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    e.stopPropagation(); // don't also let it bubble into #page-home's own deltaX-dominant day-nav handler
    if(settling) return;
    acc += Math.abs(e.deltaX);
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { acc = 0; }, 200);
    if(acc > 140){
      acc = 0;
      settling = true;
      stepFn(calWheelDir(e.deltaX));
      setTimeout(() => { settling = false; }, 500);
    }
  }, { passive:false });
}

function attachDensityGesture(el, scopeEl){
  if(!el || !scopeEl) return;
  if(window.innerWidth >= 768){ scopeEl.removeAttribute('data-density'); return; }
  if(el.closest('.home-cal-full')){ scopeEl.setAttribute('data-density', 'full'); return; } // full-screen calendar never shrinks
  if(!state.calDensity) state.calDensity = 'full';
  scopeEl.setAttribute('data-density', state.calDensity);
  // A sheet/dropdown open over the grid shouldn't also be eating the
  // same scroll/touch gesture to change density underneath it.
  const blocked = () => state.monthDropdownOpen || state.yearDropdownOpen || state.daySheetOpen;
  let acc = 0;
  const step = (dir) => {
    const i = CAL_DENSITY_ORDER.indexOf(state.calDensity);
    const next = i + dir;
    if(next < 0 || next > 2) return;
    state.calDensity = CAL_DENSITY_ORDER[next];
    acc = 0;
    scopeEl.classList.add('density-fade');
    scopeEl.setAttribute('data-density', state.calDensity);
    setTimeout(() => scopeEl.classList.remove('density-fade'), 180);
    positionHomeCalGrid();
  };
  const feed = (dy) => {
    acc = Math.max(0, Math.min(200, acc + Math.abs(dy)));
    const i = CAL_DENSITY_ORDER.indexOf(state.calDensity);
    if(dy > 0 && acc > (i === 0 ? 40 : 140)) step(1);
    // Opening back up is easy from both smaller sizes (the 2-week view
    // used to need a 115px drag inside an ~80px-tall grid).
    else if(dy < 0 && acc > 24) step(-1);
  };
  /* Wheel deltaY and touch's own dy (touchY-y, below) are opposite in
     sign for the same physical "scroll up" gesture — a wheel scrolled
     up is a *negative* deltaY by browser convention, while touch's dy
     is already positive on an upward drag. Negate deltaY here so both
     funnel into feed() with the same meaning: positive = scroll up =
     step forward (full → 2 weeks → 1 week), matching the touch gesture
     and the request this was built for. stopPropagation on both is
     required, not optional — without it the event bubbles up to
     #page-home's own pull-to-expand wheel/touch listeners
     (initHomeScrollExpand), which read the very same gesture and
     immediately stomp whatever density this just set. */
  el.addEventListener('wheel', e => { if(!blocked() && Math.abs(e.deltaY) > 1 && Math.abs(e.deltaY) > Math.abs(e.deltaX)){ e.preventDefault(); e.stopPropagation(); feed(-e.deltaY); } }, {passive:false});
  // The phone home widget's finger drags are handled live, following the
  // finger (attachHomeCalDrag); only the mouse wheel steps it here.
  if(el.id === 'home-cal-grid') return;
  let touchY = null;
  el.addEventListener('touchstart', e => { touchY = blocked() ? null : e.touches[0].clientY; }, {passive:true});
  el.addEventListener('touchmove', e => {
    if(touchY === null) return;
    e.preventDefault();
    e.stopPropagation();
    const y = e.touches[0].clientY;
    feed(touchY - y);
    touchY = y;
  }, {passive:false});
  el.addEventListener('touchend', () => { touchY = null; acc = 0; });
}

/* Day-cell tap / long-press state machine: a plain tap on an in-month
   cell selects it (same as the old pick-day/pick-home-day click action
   it replaces); a tap on an out-of-month cell instead jumps the view to
   that day's month; a ~500ms hold vibrates and opens the day detail
   (desktop day-sheet for the main calendar grid). Pointer events only,
   so it doesn't collide with attachDensityGesture()'s separate wheel/
   touch listeners on the same grid element. */
function attachDayCellGestures(gridEl, isHome){
  if(!gridEl) return;
  let pressEl = null, timer = null, startX = 0, startY = 0, longFired = false, moved = false;
  const clearPress = () => {
    if(timer){ clearTimeout(timer); timer = null; }
    if(pressEl){ pressEl.classList.remove('press'); pressEl = null; }
  };
  gridEl.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.day-cell');
    if(!btn) return;
    pressEl = btn; startX = e.clientX; startY = e.clientY; moved = false; longFired = false;
    btn.classList.add('press');
    timer = setTimeout(() => {
      longFired = true;
      btn.classList.remove('press');
      haptic(15);
      const d = new Date(btn.dataset.date);
      state.selectedDate = d;
      state.homeDate = d;
      if(!isHome){ state.daySheetDate = d; state.daySheetOpen = true; }
      render();
    }, 500);
  });
  gridEl.addEventListener('pointermove', e => {
    if(!pressEl) return;
    if(Math.hypot(e.clientX - startX, e.clientY - startY) > 10){ moved = true; clearPress(); }
  });
  gridEl.addEventListener('pointerup', () => {
    if(!pressEl) return;
    const btn = pressEl;
    clearPress();
    if(longFired || moved) return;
    const d = new Date(btn.dataset.date);
    if(btn.classList.contains('other-month')){
      if(isHome) state.homeDate = d; else state.calCursor = d;
    } else {
      state.selectedDate = d;
      state.homeDate = d;
    }
    render();
  });
  gridEl.addEventListener('pointercancel', clearPress);
  gridEl.addEventListener('contextmenu', e => e.preventDefault());
}

/* Keeps the month/year dropdowns from spilling past their card's edges
   on narrow screens (they're centered under the topbar by default,
   which can overflow when the label sits near the card's left/right
   edge). */
function clampDropdowns(){
  ['month-dropdown','year-dropdown','home-month-dropdown','home-year-dropdown','sec-month-dropdown','sec-year-dropdown','home-sec-month-dropdown','home-sec-year-dropdown'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.style.transform = 'translateX(-50%)';
    const card = el.closest('.desktop-box') || el.closest('.card') || el.parentElement;
    const bounds = card.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let shift = 0;
    if(rect.left < bounds.left + pad) shift = (bounds.left + pad) - rect.left;
    else if(rect.right > bounds.right - pad) shift = (bounds.right - pad) - rect.right;
    if(shift) el.style.transform = `translateX(calc(-50% + ${shift}px))`;
  });
}

/* Scrolls the currently-selected year to the center of the year-list
   dropdown when it opens, instead of leaving the list at its native
   top-scroll position (which can bury the current year many rows down). */
function scrollYearDropdownActive(){
  ['year-dropdown','home-year-dropdown','sec-year-dropdown','home-sec-year-dropdown'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    const active = el.querySelector('.cal-dropdown-item.active');
    if(active) active.scrollIntoView({ block:'center' });
  });
}

function attachCalendarGestures(){
  attachRollGesture(document.getElementById('cal-month-label'), (dir) => {
    if(dir === 'tap'){ state.yearDropdownOpen = false; state.monthDropdownOpen = !state.monthDropdownOpen; state.secDropdown = { kind:null, sys:null, home:false }; render(); }
    else shiftMonthRoll(dir);
  });
  attachRollGesture(document.getElementById('cal-year-label'), (dir) => {
    if(dir === 'tap'){ state.monthDropdownOpen = false; state.yearDropdownOpen = !state.yearDropdownOpen; state.secDropdown = { kind:null, sys:null, home:false }; render(); }
    else shiftYearRoll(dir);
  });
}

function attachRollGesture(el, onChange){
  if(!el) return;
  let startY = null, startX = null, moved = false;
  el.addEventListener('pointerdown', e => { startY = e.clientY; startX = e.clientX; moved = false; e.stopPropagation(); });
  el.addEventListener('pointermove', e => {
    if(startY === null) return;
    if(Math.abs(e.clientY - startY) > 8 || Math.abs(e.clientX - startX) > 8) moved = true;
  });
  el.addEventListener('pointerup', e => {
    if(startY === null) return;
    const dy = e.clientY - startY;
    if(moved && Math.abs(dy) > 28) onChange(dy < 0 ? 1 : -1);
    else if(!moved) onChange('tap');
    startY = null;
  });
}

function shiftMonthRoll(dir){
  const el = document.getElementById('cal-month-label');
  rollOut(el, dir, () => {
    state.calCursor = stepMonth(state.calCursor, dir);
    state.monthDropdownOpen = false; state.yearDropdownOpen = false;
    render();
    rollIn('cal-month-label', dir);
  });
}

function shiftYearRoll(dir){
  const el = document.getElementById('cal-year-label');
  rollOut(el, dir, () => {
    state.calCursor = stepYear(state.calCursor, dir);
    state.monthDropdownOpen = false; state.yearDropdownOpen = false;
    render();
    rollIn('cal-year-label', dir);
  });
}

/* Mobile merged widget: same roll/tap-to-dropdown interaction as the
   desktop calendar's month/year labels, but driving state.homeDate. */
function attachHomeCalendarGestures(){
  attachRollGesture(document.getElementById('home-cal-month-label'), (dir) => {
    if(dir === 'tap'){ state.yearDropdownOpen = false; state.monthDropdownOpen = !state.monthDropdownOpen; state.secDropdown = { kind:null, sys:null, home:false }; render(); }
    else shiftHomeMonthRoll(dir);
  });
  attachRollGesture(document.getElementById('home-cal-year-label'), (dir) => {
    if(dir === 'tap'){ state.monthDropdownOpen = false; state.yearDropdownOpen = !state.yearDropdownOpen; state.secDropdown = { kind:null, sys:null, home:false }; render(); }
    else shiftHomeYearRoll(dir);
  });
}

function shiftHomeMonthRoll(dir){
  const el = document.getElementById('home-cal-month-label');
  rollOut(el, dir, () => {
    state.homeDate = stepMonth(state.homeDate, dir);
    state.monthDropdownOpen = false; state.yearDropdownOpen = false;
    render();
    rollIn('home-cal-month-label', dir);
  });
}

function shiftHomeYearRoll(dir){
  const el = document.getElementById('home-cal-year-label');
  rollOut(el, dir, () => {
    state.homeDate = stepYear(state.homeDate, dir);
    state.monthDropdownOpen = false; state.yearDropdownOpen = false;
    render();
    rollIn('home-cal-year-label', dir);
  });
}

function rollOut(el, dir, cb){
  if(!el){ cb(); return; }
  el.style.transition = 'transform .13s ease, opacity .13s ease';
  el.style.transform = `translateY(${dir>0?'-10px':'10px'})`;
  el.style.opacity = '0';
  setTimeout(cb, 130);
}

function rollIn(id, dir){
  const el = document.getElementById(id);
  if(!el) return;
  el.style.transition = 'none';
  el.style.transform = `translateY(${dir>0?'10px':'-10px'})`;
  el.style.opacity = '0';
  requestAnimationFrame(() => {
    el.style.transition = 'transform .16s ease, opacity .16s ease';
    el.style.transform = 'translateY(0)';
    el.style.opacity = '1';
  });
}

function attachHomeHeaderSwipe(){
  const header = document.getElementById('home-header');
  if(!header) return;
  let startX = null, startY = null, moved = false;
  header.addEventListener('pointerdown', e => { startX = e.clientX; startY = e.clientY; moved = false; e.stopPropagation(); });
  header.addEventListener('pointermove', e => {
    if(startX === null) return;
    if(Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) moved = true;
  });
  header.addEventListener('pointerup', e => {
    if(startX === null) return;
    const dx = e.clientX - startX;
    if(moved && Math.abs(dx) > 40) shiftHomeDay(calDragDir(dx));
    startX = null;
  });
}

function shiftHomeDay(dir){
  const header = document.getElementById('home-header');
  if(!header){ state.homeDate = addDays(state.homeDate, dir); render(); return; }
  header.style.transition = 'transform .13s ease, opacity .13s ease';
  header.style.transform = `translateX(${dir>0?'-14px':'14px'})`;
  header.style.opacity = '0';
  setTimeout(() => {
    state.homeDate = addDays(state.homeDate, dir);
    render();
    const h2 = document.getElementById('home-header');
    if(h2){
      h2.style.transition = 'none';
      h2.style.transform = `translateX(${dir>0?'14px':'-14px'})`;
      h2.style.opacity = '0';
      requestAnimationFrame(() => {
        h2.style.transition = 'transform .18s ease, opacity .18s ease';
        h2.style.transform = 'translateX(0)';
        h2.style.opacity = '1';
      });
    }
  }, 130);
}

/* Phone home calendar: the size follows the finger LIVE (no fixed steps
   while dragging), then on release settles on the nearest of the three
   sizes — 1 week, 2 weeks, the whole month — with the swipe's speed
   taken into account, so a flick goes all the way and a slow drag stops
   where it is. Each size owns an equal share of the drag range, which is
   what makes the 2-week stop easy to land on. Horizontal swipes still
   page weeks/months; a tap on the handle toggles month <-> 1 week. */
function homeCalMetrics(){
  const clip = document.getElementById('home-cal-grid-clip');
  const grid = document.getElementById('home-cal-grid');
  if(!clip || !grid || !grid.children.length) return null;
  const rowGap = 4;
  const rowH = grid.children[0].getBoundingClientRect().height;
  const total = Math.ceil(grid.children.length / 7);
  const key = dateKey(state.homeDate);
  let rowIndex = 0;
  for(let i = 0; i < grid.children.length; i++){
    if(grid.children[i].dataset.date === key){ rowIndex = Math.floor(i / 7); break; }
  }
  const heightFor = rows => rows * rowH + Math.max(0, rows - 1) * rowGap;
  return { clip, grid, rowGap, rowH, total, rowIndex, heightFor };
}

// Draws the grid at any (fractional) number of visible rows — the window
// slides so the selected day's row stays in view, like the snapped sizes.
function drawHomeCalAt(m, rows){
  const startRow = Math.max(0, Math.min(m.rowIndex, m.total - rows));
  m.clip.style.height = m.heightFor(rows) + 'px';
  m.grid.style.transform = `translateY(-${startRow * (m.rowH + m.rowGap)}px)`;
  syncBackTodayButton();
}

function attachHomeCalDrag(){
  const handle = document.getElementById('home-cal-handle');
  const surface = document.getElementById('home-cal-grid-clip');
  if(!surface || document.querySelector('.home-cal-full')) return;
  let startX = null, startY = null, moved = false, axis = null, m = null, startRows = 1;
  let lastY = 0, lastT = 0, velocity = 0, fromHandle = false;

  const rowsFor = d => d === 'compact' ? 1 : d === 'mid' ? Math.min(2, m.total) : m.total;

  function onDown(e, isHandle){
    if(state.monthDropdownOpen || state.yearDropdownOpen) return;
    startX = e.clientX; startY = e.clientY; moved = false; axis = null; fromHandle = isHandle;
    lastY = e.clientY; lastT = e.timeStamp; velocity = 0;
    m = homeCalMetrics();
    if(m) startRows = rowsFor(state.calDensity || 'full');
    // Only the handle captures the pointer: capturing on the grid surface
    // would steal pointerup from the day cells (tap to pick a day).
    if(isHandle){ try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(err){} }
    e.stopPropagation(); // #page-home's own pull-to-expand must not also act on this drag
  }
  function onMove(e){
    if(startY === null || !m) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if(!axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)){
      axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
      moved = true;
      if(axis === 'y'){ m.clip.style.transition = 'none'; m.grid.style.transition = 'none'; }
    }
    if(axis !== 'y') return;
    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = 0.8 * ((e.clientY - lastY) / dt) + 0.2 * velocity; // px per ms, smoothed
    lastY = e.clientY; lastT = e.timeStamp;
    // 1 row of drag = 1 row of calendar; a soft rubber band past the ends.
    let rows = startRows + dy / (m.rowH + m.rowGap);
    if(rows < 1) rows = 1 - (1 - rows) * 0.25;
    if(rows > m.total) rows = m.total + (rows - m.total) * 0.25;
    drawHomeCalAt(m, rows);
  }
  function onUp(e){
    if(startY === null) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if(axis === 'x' && Math.abs(dx) > 50){
      // Horizontal: previous/next week (collapsed) or month (expanded),
      // sliding in the swipe's direction (calDragDir: mirrored in Persian).
      const dir = calDragDir(dx);
      slideHomeCalDate(dir, () => {
        state.homeDate = state.calDensity === 'full' ? stepMonth(state.homeDate, dir) : addDays(state.homeDate, dir*7);
      });
    } else if(axis === 'y' && m){
      // Where the finger would have gone in ~180ms, then the nearest size.
      const projected = startRows + (dy + velocity * 180) / (m.rowH + m.rowGap);
      const stops = [['compact', 1], ['mid', Math.min(2, m.total)], ['full', m.total]];
      let best = stops[0];
      stops.forEach(s => { if(Math.abs(s[1] - projected) < Math.abs(best[1] - projected)) best = s; });
      m.clip.style.transition = ''; m.grid.style.transition = '';
      setCalDensity(best[0]);
    } else if(!moved && fromHandle){
      setCalDensity(state.calDensity === 'full' ? 'compact' : 'full');
    }
    startY = null;
  }
  function onCancel(){
    if(startY === null) return;
    startY = null;
    if(m){ m.clip.style.transition = ''; m.grid.style.transition = ''; }
    positionHomeCalGrid(); // back to the size it had
  }

  if(handle){
    handle.addEventListener('pointerdown', e => onDown(e, true));
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  }
  surface.addEventListener('pointerdown', e => onDown(e, false));
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onCancel);
  // a real drag shouldn't also register as a day pick
  surface.addEventListener('click', e => { if(moved) e.stopPropagation(); }, true);
}

/* Slides the calendar grid out in the swipe's direction, applies the
   date change, then slides the new grid in from the opposite side —
   independent of #home-cal-grid's own translateY (expand/collapse), so
   the two animations never fight each other. */
function slideHomeCalDate(dir, updateFn){
  const slide = document.getElementById('home-cal-slide');
  if(!slide){ updateFn(); render(); return; }
  slide.style.transition = 'transform .16s ease, opacity .16s ease';
  // The old month leaves the way the finger went, the new one comes from
  // the other side (mirrored for the right-to-left Persian calendar).
  const away = (dir > 0) === (lang() === 'fa') ? 28 : -28;
  slide.style.transform = `translateX(${away}px)`;
  slide.style.opacity = '0';
  setTimeout(() => {
    updateFn();
    render();
    const s2 = document.getElementById('home-cal-slide');
    if(!s2) return;
    s2.style.transition = 'none';
    s2.style.transform = `translateX(${-away}px)`;
    s2.style.opacity = '0';
    requestAnimationFrame(() => {
      s2.style.transition = 'transform .2s cubic-bezier(.4,0,.2,1), opacity .2s ease';
      s2.style.transform = 'translateX(0)';
      s2.style.opacity = '1';
    });
  }, 150);
}

/* Expanding/collapsing the widget never changes which date is selected
   or the grid's content (the month grid is always fully rendered — only
   positionHomeCalGrid()'s clip-height/translateY decide how much of it
   shows), so it never needed to re-render anything at all. It used to
   replace the whole widget via outerHTML "to be safe", but that's what
   caused the resize to look sudden instead of smooth: a freshly-inserted
   node has no prior height for the CSS transition to animate FROM, so
   the browser just jumps straight to the target size. Updating state and
   calling positionHomeCalGrid() on the SAME, already-transitioning DOM
   node is what makes the grow/shrink animate properly — and also avoids
   re-attaching gesture listeners onto elements that never went away. */
function setCalDensity(density){
  if(document.querySelector('.home-cal-full')) density = 'full';
  state.calDensity = density;
  const widget = document.getElementById('home-cal-widget');
  const scopeEl = document.getElementById('page-home');
  if(scopeEl) scopeEl.setAttribute('data-density', density);
  if(!widget){ render(); return; }
  positionHomeCalGrid();
}

/* Sizes/positions the merged widget's month grid so only a window of
   rows around state.homeDate shows, driven by state.calDensity (the
   same full/mid/compact stages attachDensityGesture's scroll/touch
   feed already steps through): full = all weeks, mid = a 2-week
   window, compact = just the one week containing homeDate — all via
   the same transform/height technique, so stepping between stages is
   a smooth animation instead of a content swap. */
let homeCalFirstPosition = true;

function positionHomeCalGrid(){
  const clip = document.getElementById('home-cal-grid-clip');
  const grid = document.getElementById('home-cal-grid');
  if(!clip || !grid || !grid.children.length) return;
  const rowGap = 4;
  const rowH = grid.children[0].getBoundingClientRect().height;
  if(!rowH) return;
  const totalRows = Math.ceil(grid.children.length / 7);
  const key = dateKey(state.homeDate);
  let rowIndex = 0;
  for(let i = 0; i < grid.children.length; i++){
    if(grid.children[i].dataset.date === key){ rowIndex = Math.floor(i / 7); break; }
  }
  const density = state.calDensity || 'full';
  const visibleRows = density === 'compact' ? 1 : density === 'mid' ? Math.min(2, totalRows) : totalRows;
  // The window always starts at the row containing homeDate, except
  // near the bottom of the grid where it instead ends there, so a
  // 2-row (or 1-row) window never runs off the end of the month.
  const startRow = Math.max(0, Math.min(rowIndex, totalRows - visibleRows));
  const visibleHeight = visibleRows * rowH + Math.max(0, visibleRows - 1) * rowGap;

  if(homeCalFirstPosition){ clip.style.transition = 'none'; grid.style.transition = 'none'; }
  clip.style.height = visibleHeight + 'px';
  grid.style.transform = `translateY(-${startRow * (rowH + rowGap)}px)`;
  if(homeCalFirstPosition){
    requestAnimationFrame(() => {
      clip.style.transition = '';
      grid.style.transition = '';
      homeCalFirstPosition = false;
    });
  }
  followBackTodayButton();
}

/* "Back to today" sits on the calendar widget's bottom edge. While the
   widget grows/shrinks (CSS transition, or a live drag) that edge moves
   every frame, so the button is re-anchored every frame for the length
   of the animation instead of jumping at the end. */
function syncBackTodayButton(){
  if(window.innerWidth >= 960) return;
  const btn = document.getElementById('back-today-btn');
  const box = document.querySelector('#page-home .home-cal-widget');
  if(!btn || !box) return;
  const r = box.getBoundingClientRect();
  btn.style.left = (r.left + r.width / 2) + 'px';
  btn.style.bottom = 'auto';
  // Just above the calendar's bottom edge, with a small gap (not on the line).
  btn.style.top = (r.bottom - btn.offsetHeight - BACK_TODAY_GAP) + 'px';
}
const BACK_TODAY_GAP = 8;

let backTodayFollowUntil = 0;
function followBackTodayButton(){
  const running = backTodayFollowUntil > performance.now();
  backTodayFollowUntil = performance.now() + 480; // a bit longer than the .42s resize
  if(running) return;
  const tick = () => {
    syncBackTodayButton();
    if(performance.now() < backTodayFollowUntil) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
