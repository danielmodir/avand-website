/* ============ QUICK START (first run) ============
   Three short steps instead of the long tours: 1. what you want (calendar,
   habits, planning, period desk) → 2. your first item → 3. a home-screen
   widget (the app) or installing the web app. Skippable; if the app closes
   midway it resumes at that step (this device). The full tutorials stay in
   Profile → Tutorials. Finishing or skipping counts as the general tour seen. */
const ONBOARD_KEY = 'toojibee-onboard-v1';
let onboard = null; // { step, picks: [] } while it's open

function onboardSaved(){ try{ return JSON.parse(localStorage.getItem(ONBOARD_KEY)) || null; }catch(e){ return null; } }
function onboardSave(){ try{ localStorage.setItem(ONBOARD_KEY, JSON.stringify(onboard)); }catch(e){} }

function onboardPickList(){
  const list = [['calendar', 'obCalendar'], ['habits', 'obHabits'], ['planning', 'obPlanning']];
  if(typeof periodEligible === 'function' ? periodEligible() : state.profile.gender === 'female') list.push(['period', 'obPeriod']);
  return list;
}

function startQuickStart(force){
  if(onboard) return;
  onboard = (!force && onboardSaved()) || { step: 1, picks: [] };
  renderQuickStart();
}

function endQuickStart(){
  onboard = null;
  try{ localStorage.removeItem(ONBOARD_KEY); }catch(e){}
  document.getElementById('onboard-root')?.remove();
  markTourSeen('general');
}

function onboardNext(){
  if(onboard.step === 1){
    // What was picked is switched on; the first pick's desk comes first.
    const p = onboard.picks;
    if(p.includes('calendar')) setPref('occasionsEnabled', true);
    if(p.includes('planning') || p.includes('habits')){ state.settings.planningEnabled = true; cloudSync(() => Cloud.saveSettings(state.settings)); }
    if(p.includes('period') && !state.period.enabled){ state.period.enabled = true; savePeriodSetup(); }
  }
  if(onboard.step >= 3){ endQuickStart(); render(); return; }
  onboard.step++;
  onboardSave();
  render();
  renderQuickStart();
}

function renderQuickStart(){
  if(!onboard) return;
  let root = document.getElementById('onboard-root');
  if(!root){
    root = document.createElement('div');
    root.id = 'onboard-root'; root.className = 'onboard-root';
    document.getElementById('device').appendChild(root);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-ob]'); if(!b) return;
      const a = b.dataset.ob;
      if(a === 'skip'){ endQuickStart(); return; }
      if(a === 'next'){ onboardNext(); return; }
      if(a === 'pick'){ const k = b.dataset.k, i = onboard.picks.indexOf(k); if(i >= 0) onboard.picks.splice(i, 1); else onboard.picks.push(k); onboardSave(); renderQuickStart(); return; }
      if(a === 'add'){ onboard.step = 3; onboardSave(); root.remove(); openPopup(b.dataset.k); return; } // back after saving (render → resume)
      if(a === 'install'){ promptInstall(); return; }
    });
  }
  const s = onboard.step, fa = lang() === 'fa';
  const body = s === 1
    ? `<div class="onboard-chips">${onboardPickList().map(([k, l]) => `<button type="button" class="tracker-chip ${onboard.picks.includes(k) ? 'active' : ''}" data-ob="pick" data-k="${k}" aria-pressed="${onboard.picks.includes(k)}">${t(l)}</button>`).join('')}</div>`
    : s === 2
    ? `<div class="onboard-chips">${['task', 'habit', 'event'].map(k => `<button type="button" class="tracker-chip" data-ob="add" data-k="${k}">${t('new' + k[0].toUpperCase() + k.slice(1))}</button>`).join('')}</div>`
    : `<p class="onboard-text">${t(androidApp ? 'obWidgetApp' : 'obWidgetWeb')}</p>${!androidApp && installReady() ? `<button type="button" class="btn btn-primary btn-small" data-ob="install">${t('pwaInstall')}</button>` : ''}`;
  root.innerHTML = `<div class="onboard-card" role="dialog" aria-modal="true" dir="${fa ? 'rtl' : 'ltr'}">
    <div class="onboard-steps">${[1, 2, 3].map(i => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</div>
    <h3>${t('obTitle' + s)}</h3><p class="onboard-text">${t('obSub' + s)}</p>
    ${body}
    <div class="onboard-actions">
      <button type="button" class="btn btn-outline btn-small" data-ob="skip">${t('tourSkip')}</button>
      <button type="button" class="btn btn-primary btn-small" data-ob="next">${t(s === 3 ? 'tourDone' : 'tourNext')}</button>
    </div></div>`;
}

/* After a form that step 2 opened is closed (render runs), the card comes back. */
function onboardResume(){
  if(!onboard && onboardSaved() && !tourSeen('general') && tourAllowed() && !state.popupOpen) startQuickStart();
  else if(onboard && !document.getElementById('onboard-root') && !state.popupOpen) renderQuickStart();
}

/* ============ INSTALL THE WEB APP (PWA) ============
   The browser's own "install" offer is kept for later and only offered
   once the person has made something (a task, habit or event), never in
   the Android app or when already installed; "not now" is remembered. */
let installEvent = null;
const INSTALL_KEY = 'toojibee-install-dismissed';
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });
window.addEventListener('appinstalled', () => { installEvent = null; });
function installReady(){ return !!installEvent && !androidApp; }
function promptInstall(){
  if(!installEvent) return;
  installEvent.prompt();
  installEvent.userChoice.finally(() => { installEvent = null; document.getElementById('install-bar')?.remove(); });
}
function maybeOfferInstall(){
  if(!installReady() || onboard || document.getElementById('install-bar')) return;
  if(!(state.tasks.length + state.habits.length + state.events.length)) return;
  try{ if(localStorage.getItem(INSTALL_KEY)) return; }catch(e){ return; }
  const bar = document.createElement('div');
  bar.id = 'install-bar'; bar.className = 'install-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>${t('pwaOffer')}</span><button type="button" class="btn btn-primary btn-small">${t('pwaInstall')}</button><button type="button" class="icon-btn-sm" aria-label="${t('closeBtn')}">${ICONS.close}</button>`;
  bar.querySelector('.btn').addEventListener('click', promptInstall);
  bar.querySelector('.icon-btn-sm').addEventListener('click', () => { try{ localStorage.setItem(INSTALL_KEY, '1'); }catch(e){} bar.remove(); });
  document.getElementById('device').appendChild(bar);
}
