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

window.addEventListener('resize', () => {
  clearTimeout(navResizeTimer);
  navResizeTimer = setTimeout(updateNav, 120);
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
      if(!sessionJustExpired) state.bootError = 'network';
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
  applyAppearance();
  await loadComponents();
  initFabAndMenuInteractions();
  initHomeScrollExpand();
  initCalendarWheelSwipe();
  attachItemSelection();
  attachDaySheetDrag();
  attachLogoutHold();
  attachAuthPopupDismiss();
  boot();
  loadOccasionsData();
}
start();
