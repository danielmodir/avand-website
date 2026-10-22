/* ============ GUIDED TOUR (first run + Profile → آموزش) ============
   The whole screen dims except one spot, with a card that says what it
   is and what to tap; "Next", "Back", and "Skip tutorial" (ends the whole
   tour). The general tour runs once by itself the first time the app is
   opened (remembered on the device); every tour can be started again
   from Profile → Tutorials, which goes to that part of the app first.
   The period tour is offered only while the period desk is on. A step
   whose target isn't on screen is skipped, so a tour never gets stuck. */
const TOUR_DONE_KEY = 'toojibee-tour-done-v1';

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
    { sel: '.desktop-box', k: 'tdShare' },
  ]},
};

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
  if(step.prep){ step.prep(); await new Promise(r => setTimeout(r, 380)); } // let the view open / desk slide in
  if(!tour) return;
  const el = tourTarget(step);
  if(!el && steps.length > 1){ // not on screen (e.g. that desk is off): go on
    const next = tour.i + (dir < 0 ? -1 : 1);
    if(next >= 0 && next < steps.length){ tour.i = next; return tourShow(dir); }
  }
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const last = tour.i === steps.length - 1;
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
  if(markDone){ try{ localStorage.setItem(TOUR_DONE_KEY, '1'); }catch(e){} }
  tour = null;
  document.getElementById('tour-root')?.remove();
  window.removeEventListener('resize', tourPlace);
  document.removeEventListener('keydown', tourKeys);
}

/* First visit: the general tour, once, after the app has drawn. */
function maybeStartFirstTour(){
  let done = false;
  try{ done = localStorage.getItem(TOUR_DONE_KEY) === '1'; }catch(e){ done = true; }
  if(done || state.authOpen || document.getElementById('bday-overlay')) return;
  setTimeout(() => { if(!tour && !state.authOpen) startTour('general'); }, 700);
}

/* Profile → Tutorials: the list. */
function renderToursPage(){
  const rows = Object.keys(TOURS).filter(tourAvailable).map(id => `
    <div class="menu-item-row" data-action="start-tour" data-tour-id="${id}">
      <div class="menu-item-icon">${ICONS.infoIcon}</div><div class="menu-item-label">${t(TOURS[id].label)}</div>${ICONS.chevronRightSmall}
    </div>`).join('');
  return `${subHeader(t('tutorials'))}<div class="empty-hint" style="margin-bottom:12px;">${t('tutorialsSub')}</div><div class="menu-list">${rows}</div>`;
}
