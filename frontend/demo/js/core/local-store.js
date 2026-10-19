/* ============ ON-DEVICE SAVE (no backend) ============
   While js/config.js has no apiBase (the live site until the Django API
   is deployed), everything the person creates — tasks, habits, events,
   profile, settings, period setup — is kept in this browser's
   localStorage, so it survives reloads instead of vanishing. Nothing is
   sent anywhere. With a backend, the account's server copy is the only
   source and this module stays idle.
   render() (called after every change) schedules the save; it is
   debounced so a burst of edits writes once. */
const LOCAL_DATA_KEY = 'toojibee-local-data-v1';
let localSaveTimer = null;

function scheduleLocalSave(){
  if(!REAL_LOGIN_DISABLED) return;
  clearTimeout(localSaveTimer);
  localSaveTimer = setTimeout(saveLocalData, 400);
}

function saveLocalData(){
  try{
    const { tasks, habits, events, profile, settings, period } = state;
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify({ v:1, tasks, habits, events, profile, settings, period }));
  }catch(e){ /* storage full or blocked: keep working in memory */ }
}

function loadLocalData(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(LOCAL_DATA_KEY) || 'null'); }catch(e){}
  if(!saved || saved.v !== 1) return;
  if(Array.isArray(saved.tasks)) state.tasks = saved.tasks;
  if(Array.isArray(saved.habits)) state.habits = saved.habits;
  if(Array.isArray(saved.events)) state.events = saved.events;
  if(saved.profile){
    state.profile = Object.assign({}, state.profile, saved.profile);
    // Older saves had a name-based code (SARA1234): use a random one.
    if(!/^TJ-[0-9A-Z]{8}$/.test(state.profile.userId || '')) state.profile.userId = genUserId();
  }
  // Device-level choices (palette, language, prefs) were already restored
  // in start(); keep those, take the rest of the saved settings.
  if(saved.settings){
    const keep = { palette: state.settings.palette, language: state.settings.language, prefs: state.settings.prefs, theme: state.settings.theme };
    state.settings = Object.assign({}, state.settings, saved.settings, keep);
  }
  if(saved.period) state.period = Object.assign({}, state.period, saved.period);
}
