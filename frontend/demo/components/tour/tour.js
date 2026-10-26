/* ============ GUIDED TOUR (first run + Profile → آموزش) ============
   The whole screen dims except one spot, with a card that says what it
   is and what to tap; "Next", "Back", and "Skip tutorial" (ends the whole
   tour). The general tour runs once by itself the first time the app is
   opened (remembered on the device); every tour can be started again
   from Profile → Tutorials, which goes to that part of the app first.
   The period tour is offered only while the period desk is on. A step
   whose target isn't on screen is skipped, so a tour never gets stuck.
   Only for people with an account (not guests). Each tour runs by itself
   once: the general one on the first visit, the others the first time
   their part is opened (maybeFeatureTour). Finished or skipped, it is
   remembered on the account (settings.prefs.tour<Id>, synced like every
   setting) and on the device, so signing in again doesn't repeat it. */
const TOUR_SEEN_KEY = 'toojibee-tours-seen-v2';

function tourOpenMenu(sub){ state.menuPanelOpen = true; state.menuSubView = sub; render(); }
function tourCloseMenu(){ if(state.menuPanelOpen){ state.menuPanelOpen = false; state.menuSubView = null; render(); } }
function tourGoToDesk(key){
  tourCloseMenu();
  const dots = [...document.querySelectorAll('#desktop-dots span')];
  const i = dots.findIndex(d => d.dataset.key === key);
  if(i >= 0 && typeof goToDesktopIndex === 'function') goToDesktopIndex(i);
}

/* Each step: sel (what to light up), k (text key: k + 'T' title, k + 'X' text), prep (runs first). */
const TOURS = {
  general: { label: 'tourGeneral', steps: [
    { sel: '#app-banner', k: 'tgWelcome', prep: tourCloseMenu },
    { sel: '#page-calendar, #home-cal-widget', k: 'tgCalendar' },
    { sel: '.desktop-box', k: 'tgDesks' },
    { sel: '#fab-add', k: 'tgAdd' },
    { sel: '#toolbar-search-btn', k: 'tgSearch' },
    { sel: '.toolbar-admin-btn[data-sub="admin"]', k: 'tgManage' },
    { sel: '#toolbar-avatar-btn', k: 'tgProfile' },
  ]},
  calendar: { label: 'tourCalendar', steps: [
    { sel: '#cal-month-label, #home-cal-month-label', k: 'tcMonth', prep: tourCloseMenu },
    { sel: '.day-cell.today, .day-cell:not(.other-month)', k: 'tcDay' },
    { sel: '#page-calendar, #home-cal-widget', k: 'tcDots' },
  ]},
  planning: { label: 'tourPlanning', steps: [
    { sel: '#desktop-box-title', k: 'tpTitle', prep: () => tourGoToDesk('planning') },
    { sel: '.desktop-box', k: 'tpItems' },
    { sel: '#fab-add', k: 'tpAdd' },
    { sel: '.desk-full-btn', k: 'tpFull' },
  ]},
  occasions: { label: 'tourOccasions', steps: [
    { sel: '.desktop-box', k: 'toDesk', prep: () => tourGoToDesk('occasionsDesktop') },
  ]},
  search: { label: 'tourSearch', steps: [
    { sel: '#toolbar-search-btn', k: 'tsButton', prep: tourCloseMenu },
  ]},
  manage: { label: 'tourManage', steps: [
    { sel: '.desktop-manage-card', k: 'tmCards', prep: () => tourOpenMenu('admin') },
    { sel: '.desktop-manage-gear', k: 'tmGear' },
  ]},
  friends: { label: 'tourFriends', steps: [
    { sel: '.invite-card, #friend-search', k: 'tfInvite', prep: () => tourOpenMenu('friends') },
    { sel: '#friend-search', k: 'tfSearch' },
  ]},
  period: { label: 'tourPeriod', available: () => typeof periodViews === 'function' && periodViews().length > 0, steps: [
    { sel: '.period-pane, .desktop-box', k: 'tdRing', prep: () => tourGoToDesk('periodDesktop') },
    { sel: '.period-log', k: 'tdLog' },
    { sel: '.desktop-box', k: 'tdShare' },
  ]},
  groups: { label: 'tourGroups', available: () => typeof groupsAvailable === 'function' && groupsAvailable() && pref('groupsEnabled'), steps: [
    { sel: '.group-new-btn', k: 'tgrNew', prep: () => tourGoToDesk('groupsDesktop') },
    { sel: '.group-tile', k: 'tgrHold' },
    { sel: '.group-tile', k: 'tgrAdd' },
  ]},
  addTask: { label: 'tourAddTask', steps: tourAddSteps('task', [
    ['#add-popup .float-field', 'taTitle'], ['#add-subtask-btn', 'taSub'], ['#add-popup [data-sub="calendar"]', 'taDate'],
    ['#add-popup [data-sub="repeat"]', 'taRepeat'], ['#add-popup [data-sub="notification"]', 'taRemind'], ['#f-description', 'taDesc'], ['#popup-submit', 'taSave'],
  ])},
  addHabit: { label: 'tourAddHabit', steps: tourAddSteps('habit', [
    ['#add-popup .float-field', 'thTitle'], ['#add-popup [data-sub="repeat"]', 'thRepeat'], ['#add-popup [data-sub="notification"]', 'taRemind'], ['#popup-submit', 'taSave'],
  ])},
  addEvent: { label: 'tourAddEvent', steps: tourAddSteps('event', [
    ['#add-popup .float-field', 'teTitle'], ['#add-popup [data-sub="calendar"]', 'teDate'], ['#add-popup [data-sub="repeat"]', 'taRepeat'],
    ['#add-popup [data-sub="notification"]', 'teRemind'], ['#popup-submit', 'taSave'],
  ])},
  // The add form's Repeat and Reminder pages: the first time each opens.
  repeat: { label: 'tourRepeat', available: () => state.popupOpen && state.popupSubView === 'repeat', steps: [
    { sel: '#add-popup .popup-body .tj-select, #rec-mode-select', k: 'trKind' },
    { sel: '#add-popup .weekday-picker, #add-popup .rec-every, #rec-day-btn', k: 'trDetail' },
    { sel: '#add-popup .rec-confirm', k: 'trDone' },
  ]},
  reminder: { label: 'tourReminder', available: () => state.popupOpen && state.popupSubView === 'notification', steps: [
    { sel: '#add-popup .popup-body .tj-select, #notif-type-select', k: 'tnKind' },
    { sel: '#add-popup .tj-time, #add-popup .rec-every, #countdown-from, #add-popup .rec-block .tj-select', k: 'tnWhen' },
    { sel: '#f-notif-text', k: 'tnText' },
    { sel: '#notif-confirm', k: 'tnDone' },
  ]},
};

/* The add form's steps: the first opens the form (unless it is already
   open, as when the tour starts because the person opened it). */
function tourAddSteps(type, list){
  return list.map(([sel, k], i) => i ? { sel, k } : { sel, k, prep: () => {
    if(!(state.popupOpen && state.popupType === type && !state.editingId)){ tourCloseMenu(); openPopup(type, null); }
  } });
}

function tourPrefKey(id){ return 'tour' + id[0].toUpperCase() + id.slice(1); }
function tourSeenLocal(){ try{ return JSON.parse(localStorage.getItem(TOUR_SEEN_KEY)) || {}; }catch(e){ return {}; } }
function tourSeen(id){ return !!(state.settings.prefs && state.settings.prefs[tourPrefKey(id)]) || !!tourSeenLocal()[id]; }
function markTourSeen(id){
  if(id === 'general') trackEvent('onboarding_done', true); // opt-in anonymous count (js/core/stats.js)
  const local = tourSeenLocal(); local[id] = 1;
  try{ localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify(local)); }catch(e){}
  if(state.settings.prefs && state.settings.prefs[tourPrefKey(id)]) return;
  state.settings.prefs = Object.assign({}, state.settings.prefs, { [tourPrefKey(id)]: true });
  cloudSync(() => Cloud.saveSettings(state.settings));
}
/* Tours start by themselves only during the account's first session in
   the app (repo owner, 2026-10-25): from the next sign-in on, only from
   Profile → Tutorials. Remembered on the account (prefs.tourAutoUsed). */
let tourAutoSession = null; // null until decided for this sign-in
function tourAutoOk(){
  if(tourAutoSession === null){
    const p = state.settings.prefs || {};
    tourAutoSession = !p.tourAutoUsed && !tourSeen('general');
    if(!p.tourAutoUsed) setPref('tourAutoUsed', true);
  }
  return tourAutoSession;
}
/* A real user on a ready screen: no guests, no sign-in page, no boot screen. */
function tourAllowed(){ return !state.guest && !state.authOpen && !state.authScreen && !state.booting && !state.bootError; }

let tour = null; // { id, i }

function tourAvailable(id){ const tr = TOURS[id]; return !!tr && (!tr.available || tr.available()); }

function startTour(id){
  if(!tourAvailable(id)) return;
  endTour(false);
  tour = { id, i: 0 };
  const root = document.createElement('div');
  root.id = 'tour-root';
  root.className = 'tour-root';
  root.innerHTML = `<div class="tour-hole" id="tour-hole"></div><div class="tour-card" id="tour-card" role="dialog" aria-modal="true" aria-live="polite"></div>`;
  document.body.appendChild(root);
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-tour]');
    if(a){ e.stopPropagation(); const act = a.dataset.tour; if(act === 'next') tourStep(1); else if(act === 'back') tourStep(-1); else endTour(true); }
  });
  window.addEventListener('resize', tourPlace);
  document.addEventListener('keydown', tourKeys);
  tourShow();
}

function tourKeys(e){
  if(!tour) return;
  if(e.key === 'Escape') endTour(true);
  if(e.key === 'ArrowLeft') tourStep(lang() === 'fa' ? 1 : -1);
  if(e.key === 'ArrowRight') tourStep(lang() === 'fa' ? -1 : 1);
}

function tourStep(d){
  if(!tour) return;
  const steps = TOURS[tour.id].steps;
  tour.i += d;
  if(tour.i >= steps.length) return endTour(true);
  if(tour.i < 0) tour.i = 0;
  tourShow(d);
}

/* The first match that is actually on screen (the phone and desktop
   layouts put the calendar in different places). */
function tourTarget(step){
  for(const s of step.sel.split(',')){
    for(const el of document.querySelectorAll(s.trim())){
      const r = el.getBoundingClientRect();
      if(r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

async function tourShow(dir = 1){
  if(!tour) return;
  const steps = TOURS[tour.id].steps;
  const step = steps[tour.i];
  if(step.prep){ step.prep(); await new Promise(r => setTimeout(r, 650)); } // let the view open / desk slide in (all the way)
  if(!tour) return;
  const el = tourTarget(step);
  if(!el && steps.length > 1){ // not on screen (e.g. that desk is off): go on
    const next = tour.i + (dir < 0 ? -1 : 1);
    if(next >= 0 && next < steps.length){ tour.i = next; return tourShow(dir); }
  }
  // Inside a desk only scroll up/down: scrollIntoView also moved the sideways
  // desk pager, which left the desk (and the lit spot) cut in half.
  const pane = el && el.closest('.desktop-pane');
  if(pane){
    const r = el.getBoundingClientRect(), pr = pane.getBoundingClientRect();
    if(r.bottom > pr.bottom) pane.scrollTop += r.bottom - pr.bottom + 16; else if(r.top < pr.top) pane.scrollTop -= pr.top - r.top + 16;
  } else el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const last = tour.i === steps.length - 1;
  document.getElementById('tour-card').dir = lang() === 'fa' ? 'rtl' : 'ltr'; // the app is LTR outside the calendar
  document.getElementById('tour-card').innerHTML = `
    <div class="tour-progress">${steps.map((_, j) => `<i class="${j === tour.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-title">${escapeHtml(t(step.k + 'T'))}</div>
    <div class="tour-text">${escapeHtml(t(step.k + 'X'))}</div>
    <div class="tour-actions">
      <button type="button" class="tour-skip" data-tour="skip">${t('tourSkip')}</button>
      <span class="tour-nav">
        ${tour.i > 0 ? `<button type="button" class="btn btn-outline btn-small" data-tour="back">${t('tourBack')}</button>` : ''}
        <button type="button" class="btn btn-primary btn-small" data-tour="next">${t(last ? 'tourDone' : 'tourNext')}</button>
      </span>
    </div>`;
  tour.el = el;
  tourPlace();
  setTimeout(tourPlace, 350); // again once any scrolling has settled
  document.querySelector('#tour-card [data-tour="next"]')?.focus({ preventScroll: true });
}

/* The lit spot follows its element; the card sits above or below it, never off screen. */
function tourPlace(){
  if(!tour) return;
  const hole = document.getElementById('tour-hole'), card = document.getElementById('tour-card');
  if(!hole || !card) return;
  const el = tour.el;
  const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
  if(!el){
    hole.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
    card.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%);`;
    return;
  }
  const r = el.getBoundingClientRect();
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - 8, r.width + pad * 2), h = Math.min(vh - 8, r.height + pad * 2);
  hole.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${Math.min(22, h / 2)}px;`;
  const cw = Math.min(340, vw - 24);
  const ch = card.offsetHeight || 170;
  const below = y + h + 12, above = y - ch - 12;
  let top = below + ch < vh - 8 ? below : above > 8 ? above : Math.max(8, vh - ch - 8);
  let left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
  card.style.cssText = `left:${left}px;top:${top}px;width:${cw}px;`;
}

function endTour(markDone){
  if(markDone && tour) markTourSeen(tour.id);
  if(tour) tourLastView = tourCurrentView(); // where the tour left off isn't a new opening
  tour = null;
  document.getElementById('tour-root')?.remove();
  window.removeEventListener('resize', tourPlace);
  document.removeEventListener('keydown', tourKeys);
}

/* First visit: the general tour, once, after the app has drawn. */
function maybeStartFirstTour(){
  if(!tourAllowed() || tourSeen('general') || document.getElementById('bday-overlay') || !tourAutoOk()) return;
  // The three-step quick start instead of the long tour (js/core/onboarding.js).
  setTimeout(() => { if(!tour && tourAllowed() && !tourSeen('general')) startQuickStart(); }, 700);
}

/* The first time a part of the app is opened: its own tour (after the
   view has drawn). Not while another tour runs, nor before the general one. */
function maybeFeatureTour(id){
  return; // since the quick start (Phase 3.9) part tours no longer start by themselves: Profile → Tutorials
  if(tour || !tourAllowed() || !tourAvailable(id) || tourSeen(id) || !tourSeen('general') || !tourAutoOk()) return;
  setTimeout(() => { if(!tour && tourAllowed() && !tourSeen(id)) startTour(id); }, 450);
}

/* Which part is open now, checked after each render and desk change: when
   it changes to one with a tour, that tour runs the first time. */
const TOUR_DESKS = { planning: 'planning', occasionsDesktop: 'occasions', periodDesktop: 'period', groupsDesktop: 'groups' };
let tourLastView = null; // null until the first look: the view the app opens on isn't "opened"
function tourCurrentView(){
  let view = '';
  if(state.popupOpen && state.popupSubView === 'repeat') view = 'repeat';
  else if(state.popupOpen && state.popupSubView === 'notification') view = 'reminder';
  else if(state.popupOpen && !state.editingId && ['task', 'habit', 'event'].includes(state.popupType)) view = 'add' + state.popupType[0].toUpperCase() + state.popupType.slice(1);
  else if(state.menuPanelOpen && state.menuSubView === 'friends') view = 'friends';
  else if(state.menuPanelOpen && state.menuSubView === 'admin') view = 'manage';
  else if(state.searchOpen) view = 'search';
  else if(state.calFull) view = 'calendar';
  else if(!state.menuPanelOpen && !state.popupOpen){
    const dot = document.querySelectorAll('#desktop-dots span')[state.activeDesktopIndex || 0];
    view = (dot && TOUR_DESKS[dot.dataset.key]) || '';
  }
  return view;
}
function tourWatch(){
  if(tour) return;
  const view = tourCurrentView();
  if(tourLastView === null){ tourLastView = view; return; }
  if(view === tourLastView) return;
  tourLastView = view;
  if(view) maybeFeatureTour(view);
}

/* Profile → Tutorials: the list. */
function renderToursPage(){
  const rows = Object.keys(TOURS).filter(tourAvailable).map(id => `
    <div class="menu-item-row" data-action="start-tour" data-tour-id="${id}">
      <div class="menu-item-icon">${ICONS.infoIcon}</div><div class="menu-item-label">${t(TOURS[id].label)}</div>${ICONS.chevronRightSmall}
    </div>`).join('');
  return `${subHeader(t('tutorials'))}<div class="empty-hint" style="margin-bottom:12px;">${t('tutorialsSub')}</div><div class="menu-list"><div class="menu-item-row" data-action="start-quickstart"><div class="menu-item-icon">${ICONS.infoIcon}</div><div class="menu-item-label">${t('obQuickStart')}</div>${ICONS.chevronRightSmall}</div>${rows}</div>`;
}
