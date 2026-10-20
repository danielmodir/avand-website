let lastRenderedMenuSub = null; // which menu page the last render showed (entrance animations)

/* Picking a day on a calendar: move the "selected" circle and rebuild only
   the desk under it (that day's items) — not the whole page, so nothing
   flashes or restarts (the calendars, their scroll and animations stay). */
function selectDay(d){
  state.selectedDate = d; state.homeDate = d;
  const key = dateKey(d);
  document.querySelectorAll('#cal-month-grid .day-cell[data-date], #home-cal-grid .day-cell[data-date]').forEach(c => {
    const on = c.dataset.date === key;
    c.classList.toggle('selected', on);
    c.setAttribute('aria-pressed', String(on));
  });
  const home = document.getElementById('page-home');
  const old = home && home.querySelector(':scope > .desktop-box');
  const tmp = document.createElement('div');
  tmp.innerHTML = renderHome();
  const fresh = tmp.querySelector(':scope > .desktop-box');
  if(!old || !fresh){ render(); return; }
  old.replaceWith(fresh);
  if(state.daySheetOpen) renderDaySheet();
  attachDesktopPager();
  attachSwipeToDelete(home);
  positionHomeCalGrid();
  updateNav();
  animateDayStats();
  if(state.profile.gender === 'female' && state.period.enabled){ startPeriodTipsRotator(); attachPeriodWheel(); }
  scheduleLocalSave();
  syncBackSteps();
}

function render(){
  scheduleLocalSave(); // no-backend mode: keep this device's data (local-store.js)
  if(Cloud.onStateChanged) Cloud.onStateChanged(); // PHP backend: debounced account sync (api-php.js)
  applyLanguageDom();
  applyItemColors(); // task / habit / event colors (items.js)
  renderAuth();
  renderBootScreen();
  /* Desktop's calendar column only ever shows Monthly (see SPEC.md
     §11.5) — guard here too in case calMode was left on week/day from
     an earlier narrower viewport. */
  if(window.innerWidth >= 960 && state.calMode !== 'month') state.calMode = 'month';
  document.getElementById('page-calendar').innerHTML = renderCalendar();
  /* Calendar-only RTL: real layout mirroring (day order, controls,
     alignment), not just text direction — scoped to the calendar
     specifically per spec, while the rest of the app stays LTR-always
     (see SPEC.md for why that's still true everywhere else). */
  document.getElementById('page-calendar').setAttribute('dir', lang()==='fa' ? 'rtl' : 'ltr');
  document.getElementById('page-home').innerHTML = renderHome();
  // Entrance animation only when a page is newly opened, not on every
  // re-render while it stays open (e.g. picking a gender re-renders).
  const menuEnter = state.menuPanelOpen && state.menuSubView !== lastRenderedMenuSub ? `enter-${state.menuSubView}` : '';
  lastRenderedMenuSub = state.menuPanelOpen ? state.menuSubView : null;
  document.getElementById('page-menu').innerHTML =
    `<div class="menu-panel-content ${menuEnter}">${renderMenu()}</div>`;
  // Phone: Profile, Management and everything under them cover the whole
  // screen (back arrow or a sideways swipe closes them); only the Store
  // keeps the bottom bar visible below it.
  document.getElementById('page-menu').classList.toggle('leave-bottom-bar', state.menuSubView === 'store');
  document.getElementById('page-calendar').classList.toggle('no-scroll', state.calMode === 'month');
  document.getElementById('device').classList.toggle('show-menu', state.menuPanelOpen);
  document.getElementById('device').classList.toggle('menu-maximized', state.menuMaximized);
  // The desk's full-screen button (workspace.js); off when there's no desk.
  if(state.deskFull && !document.querySelector('.desktop-box:not(.desktop-box-empty)')) state.deskFull = false;
  document.getElementById('device').classList.toggle('desk-full', !!state.deskFull);
  syncCalFull(); // the full-screen month (calendar.js)

  renderDaySheet();
  attachCalendarGestures();
  attachHomeCalendarGestures();
  attachDensityGesture(document.getElementById('cal-month-grid'), document.getElementById('page-calendar'));
  attachDensityGesture(document.getElementById('home-cal-grid'), document.getElementById('page-home'));
  attachDayCellGestures(document.getElementById('cal-month-grid'), false);
  attachDayCellGestures(document.getElementById('home-cal-grid'), true);
  attachCalWheelMonthNav(document.getElementById('cal-month-grid'), dir => shiftMonthRoll(dir));
  /* Only when home-cal-grid is standalone (<960px, above the میزکار
     pager — see renderDesktops()) does a horizontal scroll over it mean
     "change month". At >=960px this same widget is embedded *inside*
     the pager's "planning" pane, where horizontal scroll must mean
     "switch میزکار desktops" and nothing else — attaching month-nav
     there too made the same gesture do two different, conflicting
     things depending on exactly where the pointer sat. */
  if(window.innerWidth < 960){
    attachCalWheelMonthNav(document.getElementById('home-cal-grid'), dir => shiftHomeMonthRoll(dir));
  }
  clampDropdowns();
  scrollYearDropdownActive();
  attachDesktopPager();
  attachSwipeToDelete(document.getElementById('page-home'));
  attachSwipeToDelete(document.getElementById('page-calendar'));
  attachHomeHeaderSwipe();
  attachHomeCalDrag();
  positionHomeCalGrid();
  /* Runs after positionHomeCalGrid() specifically because the
     back-to-today pill measures #home-cal-widget's own rendered
     height to anchor itself to its bottom edge, and that height is
     set by positionHomeCalGrid()'s clip-height write just above —
     measuring any earlier caught the previous month's (stale) height
     whenever a month change also changed the row count. */
  updateNav();
  animateDayStats();
  wireMenuInteractivity();
  /* #period-tips lives in the میزکار pane (renderDesktops), not
     behind any menu navigation — it exists whenever the pane itself
     does, regardless of which میزکار the pager is currently scrolled
     to. (Previously gated on menuSubView==='period', a Management route
     that no longer exists now that period settings moved to Settings.) */
  if(state.profile.gender === 'female' && state.period.enabled){
    startPeriodTipsRotator();
    attachPeriodWheel();
  } else {
    stopPeriodTipsRotator();
  }
  syncBackSteps(); // Back closes what's open (js/core/back-nav.js)
}
