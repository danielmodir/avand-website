let toastTimer = null;

/* Display switches behind each Management card's gear. Same keys and
   defaults as UserSettings.PREFERENCE_DEFAULTS on the server (camelCase
   here, snake_case there — api.js maps them). */
const DEFAULT_PREFS = {
  planningDaySummary: true, planningCalendarDots: true, planningShowEvents: true, planningShowHabits: true,
  occasionsEnabled: true, occasionsJalali: true, occasionsHijri: true, occasionsGregorian: true,
  occasionsHolidaysOnly: false, occasionsMarkHolidays: true, occasionsShowEvents: true,
  notifyOverdue: true, // one reminder when a task turns "not done" (js/core/notify.js)
};
function pref(key){
  const p = state.settings.prefs || {};
  return key in p ? !!p[key] : DEFAULT_PREFS[key];
}
function setPref(key, value){
  state.settings.prefs = Object.assign({}, state.settings.prefs, { [key]: value });
  // The offline demo (no backend) keeps them on this device; with an
  // account the server copy wins on the next load.
  try{ localStorage.setItem('toojibee-prefs', JSON.stringify(state.settings.prefs)); }catch(e){}
  cloudSync(() => Cloud.saveSettings(state.settings));
}
function loadLocalPrefs(){
  try{ Object.assign(state.settings.prefs, JSON.parse(localStorage.getItem('toojibee-prefs') || '{}')); }catch(e){}
}

/* Theme = palette (Toojibee olive/orange or Classic navy/orange) x mode
   (dark/light). The day/night button only flips the mode, inside the
   chosen palette. Both are cached locally so the first paint is right
   (index.html's inline script) and saved to the account when signed in. */
const THEME_COLOR = {
  toojibee: { dark:'#1A1708', light:'#F7F3DA' },
  classic:  { dark:'#000000', light:'#E5E5E5' },
};
function applyAppearance(){
  const root = document.documentElement;
  const palette = state.settings.palette === 'classic' ? 'classic' : 'toojibee';
  if(state.settings.theme === 'light' || state.settings.theme === 'dark') root.setAttribute('data-theme', state.settings.theme);
  root.setAttribute('data-palette', palette);
  const mode = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  try{ localStorage.setItem('toojibee-palette', palette); localStorage.setItem('toojibee-theme', mode); }catch(e){}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[palette][mode]);
}

/* Every background save/delete goes through here. With no real session
   (no-login demo mode) there's nothing to save to, so it doesn't call
   the backend at all — that was the 401 on each change. With a session,
   a failed save no longer fails silently: the user gets a toast. */
function cloudSync(call){
  // No backend: every change that would be synced is saved on this device.
  if(REAL_LOGIN_DISABLED){ scheduleLocalSave(); return; }
  if(!Cloud.hasSession()) return;
  call().catch(() => showToast(t('saveFailed')));
}

function showToast(msg){
  let el = document.getElementById('app-toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'app-toast';
    document.getElementById('device').appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* Language switch: a real loading state (dim overlay + spinner, ~1.1s)
   instead of an instant text swap, per spec — the user picks a
   language, sees loading, then the whole UI (labels, digits, calendar
   system default, hamburger/menu-panel side, everything) lands already
   switched, all at once, rather than visibly re-flowing piece by piece. */
/* writeText() returns a promise that rejects (not throws) when the page
   isn't focused or permission is denied — a plain try/catch left an
   "Uncaught (in promise)" error in the console. */
function copyText(text){
  try{ navigator.clipboard?.writeText(text)?.catch(() => {}); }catch(e){}
}

/* Short vibration when a press-and-hold fires (phones that support it;
   browsers ignore vibrate() before the first user gesture). */
function haptic(ms){
  try{ if(navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(ms || 12); }catch(e){}
}

function showLanguageLoading(newLang){
  let el = document.getElementById('lang-loading');
  if(!el){
    el = document.createElement('div');
    el.id = 'lang-loading';
    el.className = 'lang-loading';
    el.innerHTML = '<div class="brand-loader" aria-hidden="true"><svg viewBox="0 0 112 112"><circle class="track" cx="56" cy="56" r="50"/><circle class="arc" cx="56" cy="56" r="50"/></svg><img src="../assets/icons/logo.svg" alt=""></div>';
    document.getElementById('device').appendChild(el);
  }
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    state.settings.language = newLang;
    // Kept on the device too, for guests and the offline demo; with an
    // account the saved setting wins on the next load.
    try{ localStorage.setItem('toojibee-lang', newLang); }catch(e){}
    cloudSync(() => Cloud.saveSettings(state.settings));
    render();
    setTimeout(() => el.classList.remove('show'), 150);
  }, 1100);
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function escapeAttr(s){ return escapeHtml(s); }
