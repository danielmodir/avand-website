function render(){
  applyLanguageDom();
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
  document.getElementById('page-menu').innerHTML =
    `<div class="menu-panel-content">${renderMenu()}</div>`;
  document.getElementById('page-menu').classList.toggle('leave-bottom-bar', state.menuSubView !== 'profile');
  document.getElementById('page-calendar').classList.toggle('no-scroll', state.calMode === 'month');
  document.getElementById('device').classList.toggle('show-menu', state.menuPanelOpen);
  document.getElementById('device').classList.toggle('menu-maximized', state.menuMaximized);

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
  /* #period-tip-text lives in the میزکار pane (renderDesktops), not
     behind any menu navigation — it exists whenever the pane itself
     does, regardless of which میزکار the pager is currently scrolled
     to. (Previously gated on menuSubView==='period', a Management route
     that no longer exists now that period settings moved to Settings.) */
  if(state.profile.gender === 'female' && state.period.enabled){
    startPeriodTipsRotator();
  } else {
    stopPeriodTipsRotator();
  }
}
