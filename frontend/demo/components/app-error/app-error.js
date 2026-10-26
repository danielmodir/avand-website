/* ============ ERROR SCREENS + CONNECTION STRIP ============
   One illustrated screen per failure, all drawn from the same little
   calendar character in the current theme's colors (tokens only):
     offline — no internet when the app tried to load   (wifi badge)
     server  — the API answered with a 5xx / timed out  (sleepy calendar)
     crash   — an unexpected script error               (cracked page)
   offline/server are the boot screen's error state (renderBootError in
   components/auth/auth.js); crash is its own overlay (#app-crash) that
   doesn't go through render(), since render() may be what broke.
   The strip at the top appears whenever the connection drops while the
   app is open. */

function errorArt(kind){
  const base = `
    <ellipse class="ea-shadow" cx="100" cy="150" rx="58" ry="6"></ellipse>
    <g class="ea-body">
      <rect x="34" y="34" width="132" height="104" rx="20" class="ea-card"></rect>
      <path d="M34 54a20 20 0 0 1 20-20h92a20 20 0 0 1 20 20v8H34z" class="ea-head"></path>
      <rect x="64" y="22" width="9" height="24" rx="4.5" class="ea-ring"></rect>
      <rect x="127" y="22" width="9" height="24" rx="4.5" class="ea-ring"></rect>
      ${kind === 'server' ? `
        <path d="M70 92q8 6 16 0M114 92q8 6 16 0" class="ea-line"></path>
        <path d="M92 112q8 -5 16 0" class="ea-line"></path>
      ` : kind === 'crash' ? `
        <path d="M100 62l-9 16 13 9-11 14 9 10-6 27" class="ea-crack"></path>
        <circle cx="72" cy="86" r="4" class="ea-dot"></circle><circle cx="128" cy="86" r="4" class="ea-dot"></circle>
        <path d="M68 118q8 -6 16 0M116 118q8 -6 16 0" class="ea-line"></path>
      ` : `
        <circle cx="72" cy="88" r="4.5" class="ea-dot"></circle><circle cx="128" cy="88" r="4.5" class="ea-dot"></circle>
        <path d="M88 114q12 -8 24 0" class="ea-line"></path>
      `}
    </g>`;
  const badge = kind === 'server' ? `
      <g class="ea-zzz"><text x="150" y="40">z</text><text x="162" y="26">z</text><text x="172" y="14">z</text></g>`
    : kind === 'crash' ? `
      <g class="ea-badge"><circle cx="164" cy="40" r="20"></circle><path d="M164 30v12M164 49v1" class="ea-badge-mark"></path></g>`
    : `
      <g class="ea-badge"><circle cx="164" cy="40" r="20"></circle>
        <path d="M152 38a17 17 0 0 1 24 0M156.5 43a10.5 10.5 0 0 1 15 0" class="ea-badge-wave"></path>
        <circle cx="164" cy="48" r="2" class="ea-badge-fill"></circle>
        <path d="M151 29l26 22" class="ea-badge-slash"></path></g>`;
  return `<svg class="error-art error-art-${kind}" viewBox="0 0 200 160" aria-hidden="true">${base}${badge}</svg>`;
}

const ERROR_COPY = {
  offline: { title:'errOfflineTitle', desc:'errOfflineDesc' },
  server:  { title:'errServerTitle',  desc:'errServerDesc' },
  crash:   { title:'errCrashTitle',   desc:'errCrashDesc' },
};

function renderErrorScreen(kind, actionsHtml){
  const c = ERROR_COPY[kind] || ERROR_COPY.server;
  return `
    <div class="error-screen error-${kind}" role="alert">
      ${errorArt(kind)}
      <h2>${t(c.title)}</h2>
      <p>${t(c.desc)}</p>
      <div class="error-actions">${actionsHtml}</div>
    </div>`;
}

/* ---- crash overlay ---- */
let crashShown = false;

function showCrashScreen(){
  if(crashShown) return;
  crashShown = true;
  let el = document.getElementById('app-crash');
  if(!el){
    el = document.createElement('div');
    el.id = 'app-crash';
    el.className = 'app-crash';
    (document.getElementById('device') || document.body).appendChild(el);
  }
  let html;
  try{
    html = renderErrorScreen('crash', `
      <button type="button" class="btn btn-primary" id="crash-reload">${t('reloadBtn')}</button>
      <button type="button" class="btn btn-outline" id="crash-continue">${t('continueBtn')}</button>`);
  }catch(e){
    // i18n itself may be the broken part: a plain fallback.
    html = '<div class="error-screen"><h2>Something broke</h2><div class="error-actions"><button type="button" class="btn btn-primary" id="crash-reload">Reload</button></div></div>';
  }
  el.innerHTML = html;
  el.setAttribute('dir', (typeof lang === 'function' && lang() === 'fa') ? 'rtl' : 'ltr');
  requestAnimationFrame(() => el.classList.add('show'));
  el.querySelector('#crash-reload')?.addEventListener('click', () => location.reload());
  el.querySelector('#crash-continue')?.addEventListener('click', () => {
    el.classList.remove('show');
    crashShown = false;
  });
}

/* Only errors thrown by the app's own scripts count — a browser
   extension's or a cross-origin script's error is not ours to report. */
function initCrashScreen(){
  window.addEventListener('error', e => {
    if(!e.filename || e.filename.indexOf(location.origin) !== 0) return;
    showCrashScreen();
  });
}

/* ---- connection dot (offline / changes waiting to be sent) ---- */
function renderConnectionStrip(){
  const el = document.getElementById('connection-strip');
  if(!el) return;
  const offline = !navigator.onLine;
  const pending = !offline && typeof Cloud !== 'undefined' && Cloud.syncPending && Cloud.syncPending();
  const label = offline ? t('offlineStrip') : t('syncPending');
  el.textContent = '';
  el.classList.toggle('show', offline || !!pending);
  el.classList.toggle('pending', !!pending);
  el.setAttribute('aria-label', label);
  el.title = label;
}

function initConnectionWatch(){
  document.getElementById('connection-strip')?.addEventListener('click', e => showToast(e.currentTarget.getAttribute('aria-label')));
  // A save that's waiting goes out on its own (api-php.js); the dot follows.
  setInterval(renderConnectionStrip, 5000);
  window.addEventListener('offline', renderConnectionStrip);
  window.addEventListener('online', () => {
    renderConnectionStrip();
    showToast(t('backOnline'));
    // The boot screen was waiting on a connection: try again on its own.
    if(state.bootError === 'offline') boot();
  });
  renderConnectionStrip();
}
