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

setInterval(() => { refreshTodayIfDayChanged(); refreshOverdueTasks(); }, 60000);

document.addEventListener('visibilitychange', () => { if(!document.hidden) refreshTodayIfDayChanged(); });

async function loadFromCloud(){
  const data = await Cloud.loadAll();
  state.profile = Object.assign({}, state.profile, data.profile);
  syncProfileName();
  state.settings = Object.assign({}, state.settings, data.settings);
  if(data.period) state.period = Object.assign({}, state.period, data.period); // PHP backend syncs it with the account
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
  state.inviteToken = null;
  state.mcpLink = null;
  state.sharedPeriods = []; state.periodShares = null; state.periodViewIndex = 0;
  clearGroupsState();
  tourAutoSession = null; // the next account decides its own (tour.js)
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

/* On entering the app, at most one thing on top of it, in this order: a
   birthday greeting, a message from the team, the gentle period question,
   the first-visit tour. */
function welcomeChain(){
  maybeShowBirthday();
  if(document.getElementById('bday-overlay')) return;
  setTimeout(() => {
    maybeShowNotice().catch(() => false).then(shown => {
      if(shown) return;
      maybeAskPeriod();
      if(!document.getElementById('period-ask-overlay')) maybeStartFirstTour();
    });
  }, 400);
}

async function boot(){
  if(REAL_LOGIN_DISABLED){
    // No backend (the live site today): this device's own saved data, no
    // sample person or sample tasks.
    state.authScreen = false;
    loadLocalData();
    // Local testing only (never the live site, which has a backend): cycles
    // "shared with me" from localStorage, to try the partner view offline.
    if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){
      try{ const f = JSON.parse(localStorage.getItem('toojibee-dev-shared-periods') || 'null'); if(Array.isArray(f)) state.sharedPeriods = f; }catch(e){}
    }
    render();
    startReminders(); takeReminderFromLink(); // js/core/notify.js
    welcomeChain();
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
      loadGroupsCache(); // this device's last copy of the groups, until loadGroups() answers
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
  if(!state.guest && !state.bootError){ acceptPendingInvite(); loadGroups().then(joinPendingGroup); loadSharedPeriods(); startReminders(); takeReminderFromLink(); refreshContactUnread(); welcomeChain(); takeItemFromLink(); }
  else if(state.guest && (pendingInvite() || pendingGroup()) && !state.authOpen) openAuth('signup', pendingInvite() ? 'inviteSignInFirst' : 'groupSignInFirst');
  trackReturn(); // opt-in anonymous "came back on day 1/7/30" (js/core/stats.js)
  // The installable web app's offline copy (sw.js); the Android app has its own files.
  if(!androidApp && location.protocol === 'https:') registerReminderWorker();
}

/* A friend's invite link (/demo/#invite=CODE): remembered until the person
   is signed in (it may take a sign-up first), then it makes them friends. */
const PENDING_INVITE_KEY = 'toojibee-pending-invite';
function pendingInvite(){ try{ return localStorage.getItem(PENDING_INVITE_KEY) || ''; }catch(e){ return ''; } }
(function takeInviteFromLink(){
  const m = /[#&]invite=([A-Za-z0-9]{6,32})/.exec(location.hash);
  if(!m) return;
  try{ localStorage.setItem(PENDING_INVITE_KEY, m[1]); }catch(e){ /* private mode: lost after sign-up */ }
  history.replaceState(null, '', location.pathname + location.search);
})();

/* Cycles friends share with me (period desk). Again whenever the app comes
   back to the foreground, so a new share or a stopped one shows up. */
async function loadSharedPeriods(){
  if(!Cloud.sharedPeriods || !Cloud.hasSession() || state.guest) return;
  try{
    const list = await Cloud.sharedPeriods();
    if(JSON.stringify(list) === JSON.stringify(state.sharedPeriods)) return;
    state.sharedPeriods = list;
    render();
  }catch(e){ /* offline: keep what we had */ }
}
document.addEventListener('visibilitychange', () => { if(!document.hidden) loadSharedPeriods(); });

async function acceptPendingInvite(){
  const code = pendingInvite();
  if(!code || !Cloud.acceptInvite || !Cloud.hasSession()) return;
  try{ localStorage.removeItem(PENDING_INVITE_KEY); }catch(e){ /* ignore */ }
  try{
    const r = await Cloud.acceptInvite(code);
    const name = r && r.friend && r.friend.name ? r.friend.name : '';
    // The inviter approves invite-link friends themself: a request went to them.
    showToast(t(r && r.status === 'pending' ? 'inviteRequested' : 'inviteAccepted').replace('{name}', name));
    trackEvent('invite_accepted'); // opt-in anonymous count (js/core/stats.js)
    if(state.menuSubView === 'friends') refreshConnections();
  }catch(err){
    showToast(t(err && err.code === 'own_invite' ? 'inviteOwn' : err && err.status === 404 ? 'inviteInvalid' : 'saveFailed'));
  }
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
/* The top banner's picture and title, as set in the admin panel (PHP
   backend: GET /content from our own API). Nothing set, or no backend:
   the banner keeps its plain look and the app name. */
/* Which header picture shows: the occasion banner while it lasts (its end
   time from the panel), else the main one; the night picture in dark mode,
   the day one in light (either stands in when the other isn't set). GIFs
   move. Re-run on theme change (applyAppearance) and when the occasion
   ends while the app is open. */
let bannerTimer = null;
function activeBanner(){
  const b = SITE_BANNER || {};
  const occ = b.occasion;
  if(occ && (occ.light || occ.dark) && (!occ.until || Date.parse(occ.until) > Date.now())) return { set: occ, occasion: true };
  return { set: b.main || { light: b.image || null, dark: null }, occasion: false };
}
function bannerTitleNow(){
  const a = activeBanner();
  return (a.occasion && a.set.title && a.set.title[lang()]) || (SITE_BANNER.title && SITE_BANNER.title[lang()]) || '';
}
function applyBanner(){
  const bg = document.getElementById('app-banner-bg'), banner = document.getElementById('app-banner');
  if(!bg || !banner) return;
  const { set } = activeBanner();
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const url = (dark ? set.dark || set.light : set.light || set.dark) || '';
  // Only our own uploads (/uploads/...), never an outside address.
  const ok = /^\/uploads\/[a-f0-9]{32}\.(webp|jpg|png|gif)$/.test(url);
  bg.style.backgroundImage = ok ? `url("${url}")` : '';
  bg.classList.toggle('has-image', ok);
  banner.classList.toggle('has-image', ok);
  applyLanguageDom();
  clearTimeout(bannerTimer);
  const until = SITE_BANNER.occasion && SITE_BANNER.occasion.until ? Date.parse(SITE_BANNER.occasion.until) - Date.now() : 0;
  if(until > 0 && until < 2147483000) bannerTimer = setTimeout(applyBanner, until + 1000);
}

function loadSiteContent(){
  if(!Cloud.siteContent) return;
  Cloud.siteContent().then(c => {
    SITE_BANNER = (c && c.banner) || {};
    applyBanner();
  }).catch(() => { /* offline: keep the plain banner */ });
  if(Cloud.featuredArticles){
    Cloud.featuredArticles().then(a => { SITE_ARTICLES = a || {}; render(); }).catch(() => {});
  }
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
  attachMenuSwipeClose();
  attachAuthPopupDismiss();
  initConnectionWatch();
  boot();
  loadSiteContent();
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
