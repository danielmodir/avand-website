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
  state.tasks = data.tasks;
  state.habits = data.habits;
  state.events = data.events;
}

let sessionJustExpired = false; // set true for the duration of a boot() that onSessionExpired fired during

Cloud.onSessionExpired = () => {
  sessionJustExpired = true;
  state.authScreen = true;
  state.authTab = 'login';
  state.tasks = []; state.habits = []; state.events = [];
  render();
  showToast(t('sessionExpired'));
};

/* Temporarily disabled at the repo owner's request (2026-10-09) so the
   desktop-rail/profile rework can be checked without a real account —
   flip back to false to restore real Supabase login. Skips straight past
   the auth screen into the local placeholder profile/data already in
   `state` above; no cloud calls happen while this is true. */
const REAL_LOGIN_DISABLED = true;

async function boot(){
  if(REAL_LOGIN_DISABLED){
    state.authScreen = false;
    if(!state.tasks.length) state.tasks.push(sampleSubtaskTask());
    render();
    return;
  }
  Cloud.consumeOAuthRedirect();
  state.booting = Cloud.hasSession();
  state.bootError = null;
  sessionJustExpired = false;
  render(); // skeleton while a saved session is checked, else the normal auth screen
  if(Cloud.hasSession()){
    try{
      await loadFromCloud();
      state.authScreen = false;
    }catch(err){
      /* A 401 with a failed refresh already pointed authScreen at the
         login form itself (see Cloud.onSessionExpired above). Anything
         else here — offline, timeout, a 5xx — isn't a real "you're
         logged out", so don't force the login screen over it; show a
         retry screen and leave the saved session alone instead. authScreen
         defaults to true on a cold load, so it can't tell these apart by
         itself — sessionJustExpired is the real signal. */
      if(!sessionJustExpired) state.bootError = 'network';
    }
    state.booting = false;
    render();
  }
}

async function start(){
  await loadComponents();
  initFabAndMenuInteractions();
  initHomeScrollExpand();
  initCalendarWheelSwipe();
  attachCheckboxLongPress();
  attachDesktopContextMenu();
  attachDaySheetDrag();
  attachLogoutHold();
  boot();
  loadOccasionsData();
}
start();
