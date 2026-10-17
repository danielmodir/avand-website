/* App entry point, loaded last. Every other script only declares
   functions/state; nothing touches the component DOM until start() has
   injected the HTML partials (see js/core/include.js). */
/* updateNav() measures real element positions (rail bottom edge, calendar
   box edges, etc.) and writes them as inline styles — nothing else
   re-runs that measurement when the viewport changes (resizing the
   window, or a late font swap reflowing layout after boot), so those
   positions go stale until the next click-driven render(). Debounced
   since resize fires continuously while dragging. */
let navResizeTimer = null;

/* Crossing the 960px phone/desktop breakpoint also changes the MARKUP,
   not just CSS (renderDesktops puts the calendar widget inside or above
   the workspace box, the day summary is desktop-only, the day sheet is
   desktop-only...), so a resize or rotation across it re-renders. */
let wasDesktopLayout = window.innerWidth >= 960;

window.addEventListener('resize', () => {
  clearTimeout(navResizeTimer);
  navResizeTimer = setTimeout(() => {
    const isDesktop = window.innerWidth >= 960;
    if(isDesktop !== wasDesktopLayout){
      wasDesktopLayout = isDesktop;
      state.daySheetOpen = false;
      render();
    }
    updateNav();
  }, 120);
});

/* `today` is computed once at load, so an app left open past midnight
   kept treating yesterday as today (today highlight, back-to-today,
   new items' default date). Roll it forward in place (it's a shared
   Date object, so every reference sees the change) when the day turns,
   carrying along a calendar that was still sitting on the old today. */
function refreshTodayIfDayChanged(){
  const now = new Date(); now.setHours(0,0,0,0);
  if(now.getTime() === today.getTime()) return;
  const oldKey = dateKey(today);
  today.setTime(now.getTime());
  if(dateKey(state.homeDate) === oldKey) state.homeDate = new Date(today);
  if(dateKey(state.calCursor) === oldKey) state.calCursor = new Date(today);
  render();
}

setInterval(refreshTodayIfDayChanged, 60000);

document.addEventListener('visibilitychange', () => { if(!document.hidden) refreshTodayIfDayChanged(); });

async function loadFromCloud(){
  const data = await Cloud.loadAll();
  state.profile = Object.assign({}, state.profile, data.profile);
  syncProfileName();
  state.settings = Object.assign({}, state.settings, data.settings);
  applyAppearance();
  state.tasks = data.tasks.map(t => ({ ...t, subtasks: (t.subtasks || []).map(s => normalizeSubtask(s, t)) }));
  state.habits = data.habits;
  state.events = data.events;
}

let sessionJustExpired = false; // set true for the duration of a boot() that onSessionExpired fired during

/* Signed out with a backend available: browse the calendar and the
   occasions; everything else asks for an account (GUEST_ACTIONS in
   js/core/events.js). No sample data, nothing personal on screen. */
function enterGuestMode(){
  state.guest = true;
  state.authScreen = false;
  state.tasks = []; state.habits = []; state.events = [];
  state.connections = [];
  state.profile = Object.assign({}, state.profile, { name:'', firstName:'', lastName:'', username:'', email:'', phone:'', gender:'', dob:'', photo:null });
  state.activeDesktopIndex = 0;
  state.selection = null;
}

Cloud.onSessionExpired = () => {
  sessionJustExpired = true;
  enterGuestMode();
  openAuth('login');
  showToast(t('sessionExpired'));
};

// Private photos arrive after loadAll(), once fetched with the user's token.
Cloud.onPhotoLoaded = (itemId, url) => {
  const { item } = findTaskOrSub(itemId);
  if(item){ item.photos = [...(item.photos || []), url]; render(); }
};
Cloud.onAvatarLoaded = url => { state.profile.photo = url; render(); };

/* No backend configured (js/config.js apiBase empty, as on GitHub Pages)
   = local demo: no sign-in at all, the placeholder profile and sample data
   in `state`; nothing is sent anywhere. With a backend: guest mode until
   the person signs in for real. */
const REAL_LOGIN_DISABLED = !Cloud.isConfigured();

/* #verify-email=… / #reset-password=… links from our emails. */
async function handleEmailLink(){
  const link = Cloud.takeEmailLink();
  if(!link) return;
  if(link.kind === 'reset-password'){
    authResetToken = link.token;
    openAuth('reset');
    return;
  }
  try{ await Cloud.verifyEmail(link.token); showToast(t('emailVerified')); }
  catch(err){ showToast(authErrorMessage(err)); }
}

async function boot(){
  if(REAL_LOGIN_DISABLED){
    state.authScreen = false;
    if(!state.tasks.length) state.tasks.push(sampleSubtaskTask());
    render();
    return;
  }
  try{ await Cloud.consumeOAuthRedirect(); }  // back from Google: #login_code -> tokens
  catch(err){ enterGuestMode(); openAuth('login'); authErrors.general = authErrorMessage(err); }
  state.booting = Cloud.hasSession();
  state.bootError = null;
  sessionJustExpired = false;
  if(!Cloud.hasSession()) enterGuestMode();
  render(); // skeleton while a saved session is checked, else guest mode
  if(Cloud.hasSession()){
    try{
      await loadFromCloud();
      state.guest = false;
      state.authScreen = false;
    }catch(err){
      /* A 401 with a failed refresh already switched to guest mode and
         opened sign-in (Cloud.onSessionExpired). Anything else — offline,
         timeout, a 5xx — isn't a real "you're signed out": show a retry
         screen and keep the saved session. */
      // No connection at all -> "you're offline"; online but our server
      // didn't answer (down, timeout, 5xx) -> "problem on our side".
      if(!sessionJustExpired) state.bootError = navigator.onLine ? 'server' : 'offline';
    }
    state.booting = false;
    render();
  }
  handleEmailLink();
  openAuthFromLink();
}

/* The landing page's "Log in" button links to /demo/#login (#signup also
   works): open the popup once, then drop the hash so a reload doesn't. */
function openAuthFromLink(){
  const tab = { '#login':'login', '#signup':'signup' }[location.hash];
  if(!tab) return;
  history.replaceState(null, '', location.pathname + location.search);
  if(state.guest) openAuth(tab);
}

function attachAuthPopupDismiss(){
  const overlay = document.getElementById('auth-screen');
  // A click on the dimmed backdrop (not inside the card) closes it.
  overlay.addEventListener('click', e => { if(e.target === overlay) closeAuth(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && state.authOpen) closeAuth(); });
}
async function start(){
  // Last palette/mode used on this device, until the account's settings load.
  state.settings.palette = document.documentElement.getAttribute('data-palette') === 'classic' ? 'classic' : 'toojibee';
  loadLocalPrefs();
  try{ const l = localStorage.getItem('toojibee-lang'); if(l === 'fa' || l === 'en') state.settings.language = l; }catch(e){}
  applyAppearance();
  initCrashScreen();
  try{
    await loadComponents();
  }catch(err){
    // The app's own files didn't arrive (offline on first visit, or the
    // host is down): show the matching error screen on the splash.
    showSplashError(navigator.onLine ? 'server' : 'offline');
    return;
  }
  initFabAndMenuInteractions();
  initHomeScrollExpand();
  initCalendarWheelSwipe();
  attachItemSelection();
  attachDaySheetDrag();
  attachLogoutHold();
  attachAuthPopupDismiss();
  initConnectionWatch();
  boot();
  loadOccasionsData();
  hideSplash();
}

/* The inline splash in index.html (styled there, before any CSS). */
const SPLASH_MIN_MS = 450; // long enough to read as a deliberate intro, not a flicker
const splashShownAt = performance.now();

function hideSplash(){
  const el = document.getElementById('app-splash');
  if(!el) return;
  const wait = Math.max(0, SPLASH_MIN_MS - (performance.now() - splashShownAt));
  setTimeout(() => {
    el.classList.add('done');
    setTimeout(() => el.remove(), 450);
  }, wait);
}

function showSplashError(kind){
  const el = document.getElementById('app-splash');
  if(!el) return;
  el.setAttribute('dir', lang() === 'fa' ? 'rtl' : 'ltr');
  el.innerHTML = renderErrorScreen(kind, `<button type="button" class="btn btn-primary" onclick="location.reload()">${t('reloadBtn')}</button>`);
  el.removeAttribute('role');
}

start();
