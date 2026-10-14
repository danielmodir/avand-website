let toastTimer = null;

/* Every background save/delete goes through here. With no real session
   (no-login demo mode) there's nothing to save to, so it doesn't call
   the backend at all — that was the 401 on each change. With a session,
   a failed save no longer fails silently: the user gets a toast. */
function cloudSync(call){
  if(REAL_LOGIN_DISABLED || !Cloud.hasSession()) return;
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
function showLanguageLoading(newLang){
  let el = document.getElementById('lang-loading');
  if(!el){
    el = document.createElement('div');
    el.id = 'lang-loading';
    el.className = 'lang-loading';
    el.innerHTML = '<div class="lang-spinner"></div>';
    document.getElementById('device').appendChild(el);
  }
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    state.settings.language = newLang;
    cloudSync(() => Cloud.saveSettings(state.settings));
    render();
    setTimeout(() => el.classList.remove('show'), 150);
  }, 1100);
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function escapeAttr(s){ return escapeHtml(s); }
