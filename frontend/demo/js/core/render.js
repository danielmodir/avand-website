let lastRenderedMenuSub = null; // which menu page the last render showed (entrance animations)

/* The HTML each page was last given by render(), so an unchanged page
   isn't rebuilt. Anything else that adds or removes elements in a page
   (a checkbox flipped in place, selectDay(), the period wheel's center,
   swipe), or changes a class or inline style in it (a drag, a press),
   makes the page differ from that HTML, so the next render() rebuilds it
   as before. Text-only updates (counters) don't count. */
const pageHtml = {};
let pageObserver = null;
function setPageHtml(id, html){
  const el = document.getElementById(id);
  if(!el) return false;
  if(!pageObserver && window.MutationObserver){
    pageObserver = new MutationObserver(records => records.forEach(forgetPageHtml));
    ['page-calendar', 'page-home', 'page-menu'].forEach(p => {
      const page = document.getElementById(p);
      if(page) pageObserver.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    });
  }
  if(pageHtml[id] === html) return false;
  el.innerHTML = html;
  pageHtml[id] = html;
  return true;
}
function forgetPageHtml(r){
  if(r.type === 'childList' && ![...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1)) return;
  const page = r.target.closest && r.target.closest('#page-calendar, #page-home, #page-menu');
  if(page) delete pageHtml[page.id];
}

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
  if(periodViews().length){ startPeriodTipsRotator(); attachPeriodWheel(); }
  scheduleLocalSave();
  syncBackSteps();
}

/* Screen readers and keyboards: every on/off switch and back arrow is a
   div, so it gets its role, state, a name (the row's label) and a tab stop
   here instead of in each template. Enter/Space press them (events.js). */
function labelControls(){
  document.querySelectorAll('#device .switch').forEach(sw => {
    if(sw.getAttribute('role') !== 'switch') sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', sw.classList.contains('on') ? 'true' : 'false');
    if(!sw.hasAttribute('tabindex')) sw.tabIndex = 0;
    if(!sw.hasAttribute('aria-label')){
      const lbl = sw.parentElement && sw.parentElement.querySelector('.lbl, .store-item-name, .menu-item-label');
      if(lbl) sw.setAttribute('aria-label', lbl.textContent.trim());
    }
  });
  document.querySelectorAll('#device .popup-back:not([role])').forEach(b => {
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    b.setAttribute('aria-label', t('quizBack'));
  });
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
  /* Each page is rebuilt only when its HTML changed (a tick changes the
     desk, not the menu): rebuilding and re-laying-out every page on every
     change was the app's main slowness on phones. A page that's left as it
     is keeps its listeners, so its attach*() calls below are skipped too
     (they expect fresh elements). */
  // Changes made just before this call (a handler that patched the page and
  // then called render()) haven't reached the observer's callback yet.
  if(pageObserver) pageObserver.takeRecords().forEach(forgetPageHtml);
  const calChanged = setPageHtml('page-calendar', renderCalendar());
  /* Calendar-only RTL: real layout mirroring (day order, controls,
     alignment), not just text direction — scoped to the calendar
     specifically per spec, while the rest of the app stays LTR-always
     (see SPEC.md for why that's still true everywhere else). */
  document.getElementById('page-calendar').setAttribute('dir', lang()==='fa' ? 'rtl' : 'ltr');
  const homeChanged = setPageHtml('page-home', renderHome());
  // Entrance animation only when a page is newly opened, not on every
  // re-render while it stays open (e.g. picking a gender re-renders).
  const menuEnter = state.menuPanelOpen && state.menuSubView !== lastRenderedMenuSub ? `enter-${state.menuSubView}` : '';
  lastRenderedMenuSub = state.menuPanelOpen ? state.menuSubView : null;
  const menuChanged = setPageHtml('page-menu',
    `<div class="menu-panel-content ${menuEnter}">${renderMenu()}</div>`);
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
  if(calChanged){
    attachCalendarGestures();
    attachDensityGesture(document.getElementById('cal-month-grid'), document.getElementById('page-calendar'));
    attachDayCellGestures(document.getElementById('cal-month-grid'), false);
    attachCalWheelMonthNav(document.getElementById('cal-month-grid'), dir => shiftMonthRoll(dir));
  }
  if(homeChanged){
    attachHomeCalendarGestures();
    attachDensityGesture(document.getElementById('home-cal-grid'), document.getElementById('page-home'));
    attachDayCellGestures(document.getElementById('home-cal-grid'), true);
  }
  /* Only when home-cal-grid is standalone (<960px, above the میزکار
     pager — see renderDesktops()) does a horizontal scroll over it mean
     "change month". At >=960px this same widget is embedded *inside*
     the pager's "planning" pane, where horizontal scroll must mean
     "switch میزکار desktops" and nothing else — attaching month-nav
     there too made the same gesture do two different, conflicting
     things depending on exactly where the pointer sat. */
  if(homeChanged && window.innerWidth < 960){
    attachCalWheelMonthNav(document.getElementById('home-cal-grid'), dir => shiftHomeMonthRoll(dir));
  }
  clampDropdowns();
  scrollYearDropdownActive();
  if(homeChanged){
    attachDesktopPager();
    attachSwipeToDelete(document.getElementById('page-home'));
    attachHomeHeaderSwipe();
    attachHomeCalDrag();
  }
  if(calChanged) attachSwipeToDelete(document.getElementById('page-calendar'));
  positionHomeCalGrid();
  /* Runs after positionHomeCalGrid() specifically because the
     back-to-today pill measures #home-cal-widget's own rendered
     height to anchor itself to its bottom edge, and that height is
     set by positionHomeCalGrid()'s clip-height write just above —
     measuring any earlier caught the previous month's (stale) height
     whenever a month change also changed the row count. */
  updateNav();
  if(homeChanged) animateDayStats();
  if(menuChanged) wireMenuInteractivity();
  /* #period-tips lives in the میزکار pane (renderDesktops), not
     behind any menu navigation — it exists whenever the pane itself
     does, regardless of which میزکار the pager is currently scrolled
     to. (Previously gated on menuSubView==='period', a Management route
     that no longer exists now that period settings moved to Settings.) */
  if(periodViews().length){ // own cycle, or one a friend shares (period.js)
    if(homeChanged){ startPeriodTipsRotator(); attachPeriodWheel(); }
  } else {
    stopPeriodTipsRotator();
  }
  refreshGroupView(); // an open group page follows the changes (components/groups)
  syncBackSteps(); // Back closes what's open (js/core/back-nav.js)
  tourWatch(); // a part opened for the first time: its tutorial (tour.js)
  scheduleWidgetData(); // the Android app's home-screen widgets (js/core/android.js)
  labelControls();
  // What render() itself just changed matches pageHtml: not a reason to rebuild.
  if(pageObserver) pageObserver.takeRecords();
}
