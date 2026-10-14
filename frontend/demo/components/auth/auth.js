let authDraft = { name:'', email:'', password:'' };

let authErrors = { name:'', email:'', password:'', general:'' };

let authBusy = false;

function validateAuth(){
  const isLogin = state.authTab === 'login';
  const errs = { name:'', email:'', password:'', general:'' };
  if(!isLogin && !authDraft.name.trim()) errs.name = t('nameRequired');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authDraft.email.trim())) errs.email = t('emailInvalid');
  if(authDraft.password.length < 6) errs.password = t('passwordTooShort');
  authErrors = errs;
  return !errs.name && !errs.email && !errs.password;
}

function renderAuthScreen(){
  const isLogin = state.authTab === 'login';
  const errClass = f => authErrors[f] ? 'field has-error' : 'field';
  const errMsg = f => authErrors[f] ? `<div class="auth-field-error">${authErrors[f]}</div>` : '';
  return `
    <div class="auth-logo">آ</div>
    <div class="auth-title">${t('welcomeTitle')}</div>
    <div class="auth-sub">${t('welcomeSub')}</div>
    <div class="auth-tabs">
      <button type="button" data-action="auth-tab" data-val="login" class="${isLogin?'active':''}">${t('logIn')}</button>
      <button type="button" data-action="auth-tab" data-val="signup" class="${!isLogin?'active':''}">${t('signUp')}</button>
    </div>
    <button type="button" class="auth-google" data-action="auth-google">${GOOGLE_G_ICON}${t('continueWithGoogle')}</button>
    <div class="auth-divider">${t('authOr')}</div>
    ${authErrors.general ? `<div class="auth-field-error" style="text-align:center;margin-bottom:10px;">${escapeHtml(authErrors.general)}</div>` : ''}
    <div class="auth-form">
      ${!isLogin ? `<div class="${errClass('name')}"><input type="text" id="auth-name" placeholder="${t('fullName')}" value="${escapeAttr(authDraft.name)}">${errMsg('name')}</div>` : ''}
      <div class="${errClass('email')}"><input type="email" id="auth-email" placeholder="${t('email')}" value="${escapeAttr(authDraft.email)}">${errMsg('email')}</div>
      <div class="${errClass('password')}"><input type="password" id="auth-password" placeholder="${t('password')}" value="${escapeAttr(authDraft.password)}">${errMsg('password')}</div>
      <button class="btn btn-primary auth-submit" data-action="auth-submit" ${authBusy?'disabled':''}>${authBusy?t('authSubmitting'):(isLogin?t('logInBtn'):t('createAccountBtn'))}</button>
    </div>
    <div class="auth-footer">${t('authFooter')}</div>
  `;
}

function wireAuthInteractivity(){
  document.getElementById('auth-name')?.addEventListener('input', e => { authDraft.name = e.target.value; });
  document.getElementById('auth-email')?.addEventListener('input', e => { authDraft.email = e.target.value; });
  document.getElementById('auth-password')?.addEventListener('input', e => { authDraft.password = e.target.value; });
}

function renderAuth(){
  const el = document.getElementById('auth-screen');
  el.innerHTML = renderAuthScreen();
  /* authScreen defaults to true before boot() has had a chance to confirm
     anything, so without the extra checks here the login form would sit
     on top of (it has the higher z-index) the boot skeleton/retry screen
     for the whole time boot() is still working. */
  el.classList.toggle('hidden', !state.authScreen || state.booting || !!state.bootError);
  wireAuthInteractivity();
}

/* Shown while boot() is checking a saved session against the backend
   (skeleton) or when that check failed for a reason other than the
   session actually being invalid (error + retry) — see boot(). Without
   this, a returning signed-in user briefly saw the login screen flash
   before their real data arrived. */
function renderBootSkeleton(){
  const dayCells = Array.from({length:7}, () => `<div class="skel-block" style="aspect-ratio:1;"></div>`).join('');
  const rows = Array.from({length:4}, () => `<div class="skel-block" style="height:52px; border-radius:16px; margin-bottom:8px;"></div>`).join('');
  return `
    <div class="skel-block" style="height:20px; width:120px; border-radius:8px; margin-bottom:14px;"></div>
    <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin-bottom:16px;">${dayCells}</div>
    <div class="skel-block" style="height:74px; border-radius:18px; margin-bottom:18px;"></div>
    ${rows}
  `;
}

function renderBootError(){
  return `
    <div class="boot-error">
      ${ICONS.wifiOff}
      <h2>${t('couldntConnect')}</h2>
      <p>${t('couldntConnectDesc')}</p>
      <button type="button" class="btn btn-primary" data-action="retry-boot">${t('retryBtn')}</button>
    </div>
  `;
}

function renderBootScreen(){
  const el = document.getElementById('boot-screen');
  if(!el) return;
  el.innerHTML = state.bootError ? renderBootError() : renderBootSkeleton();
  el.classList.toggle('hidden', !(state.booting || state.bootError));
}
