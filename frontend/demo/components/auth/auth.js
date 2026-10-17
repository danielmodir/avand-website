/* ============ AUTH POPUP ============
   Guests (API configured, not signed in) can browse the calendar and
   occasions freely; anything that needs an account opens this popup
   instead (see requireAccount / GUEST_ACTIONS in js/core/events.js).
   Views: login · signup · forgot (email a reset link) · reset (choose a
   new password, opened from that link). Everything talks to the real
   API through Cloud.*; nothing here is simulated. */
let authDraft = { name:'', email:'', password:'' };

let authErrors = { name:'', email:'', password:'', general:'' };

let authBusy = false;
let authNotice = '';            // green confirmation line (reset link sent, password changed…)
let authResetToken = null;      // set while the "choose a new password" view is open
let authProviders = null;       // { google: bool } from the server, fetched once

const MIN_PASSWORD = 8;         // same rule as the API's validators

function openAuth(tab, reason){
  state.authTab = tab || state.authTab || 'login';
  state.authOpen = true;
  state.authReason = reason || null;
  authErrors = { name:'', email:'', password:'', general:'' };
  authNotice = '';
  state.navExpanded = false;
  if(authProviders === null && Cloud.isConfigured()){
    Cloud.authProviders().then(p => { authProviders = p; renderAuth(); }).catch(() => { authProviders = { google:false }; });
  }
  render();
  setTimeout(() => document.getElementById(state.authTab === 'signup' ? 'auth-name' : 'auth-email')?.focus(), 80);
}

function closeAuth(){
  if(authBusy) return;
  state.authOpen = false;
  authResetToken = null;
  if(state.authTab === 'reset' || state.authTab === 'forgot') state.authTab = 'login';
  render();
}

function validateAuth(){
  const tab = state.authTab;
  const errs = { name:'', email:'', password:'', general:'' };
  if(tab === 'signup' && !authDraft.name.trim()) errs.name = t('nameRequired');
  if(tab !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authDraft.email.trim())) errs.email = t('emailInvalid');
  if(tab !== 'forgot' && authDraft.password.length < MIN_PASSWORD) errs.password = t('passwordTooShort');
  authErrors = errs;
  return !errs.name && !errs.email && !errs.password;
}

/* Server error codes (apps/common/exceptions.py) -> friendly text. */
function authErrorMessage(err){
  if(!err || err.status === undefined) return t('errNetwork');   // fetch failed: server unreachable
  const byCode = {
    invalid_credentials: 'errInvalidCredentials',
    email_taken: 'errEmailTaken',
    account_suspended: 'errSuspended',
    invalid_or_expired_token: 'errLinkExpired',
    throttled: 'errTooManyTries',
    google_sign_in_disabled: 'errGoogleDisabled',
    google_cancelled: 'errGoogleCancelled',
  };
  if(err.code === 'weak_password' && err.body?.reasons?.length) return err.body.reasons.join(' ');
  if(byCode[err.code]) return t(byCode[err.code]);
  return err.status >= 500 ? t('errServer') : (err.message || t('errServer'));
}

function renderAuthScreen(){
  const tab = state.authTab;
  const errClass = f => authErrors[f] ? 'field has-error' : 'field';
  const errMsg = f => authErrors[f] ? `<div class="auth-field-error">${authErrors[f]}</div>` : '';
  const input = (id, type, key, field, autocomplete) =>
    `<div class="${errClass(field)}"><input type="${type}" id="${id}" placeholder="${t(key)}" value="${escapeAttr(authDraft[field])}" autocomplete="${autocomplete}" ${type === 'email' ? 'dir="ltr"' : ''}>${errMsg(field)}</div>`;
  const general = authErrors.general ? `<div class="auth-alert error" role="alert">${escapeHtml(authErrors.general)}</div>` : '';
  const notice = authNotice ? `<div class="auth-alert ok" role="status">${escapeHtml(authNotice)}</div>` : '';
  const submit = (labelKey) => `<button class="btn btn-primary auth-submit" data-action="auth-submit" ${authBusy?'disabled':''}>${authBusy ? t('authSubmitting') : t(labelKey)}</button>`;

  let body;
  if(tab === 'forgot'){
    body = `
      <div class="auth-title">${t('forgotTitle')}</div>
      <div class="auth-sub">${t('forgotSub')}</div>
      ${general}${notice}
      <div class="auth-form">${input('auth-email', 'email', 'email', 'email', 'email')}${submit('sendResetLink')}</div>
      <button type="button" class="auth-link" data-action="auth-tab" data-val="login">${t('backToLogin')}</button>`;
  } else if(tab === 'reset'){
    body = `
      <div class="auth-title">${t('newPasswordTitle')}</div>
      <div class="auth-sub">${t('newPasswordSub')}</div>
      ${general}${notice}
      <div class="auth-form">${input('auth-password', 'password', 'newPassword', 'password', 'new-password')}${submit('setNewPassword')}</div>`;
  } else {
    const isLogin = tab === 'login';
    const google = authProviders?.google ? `
      <button type="button" class="auth-google" data-action="auth-google">${GOOGLE_G_ICON}${t('continueWithGoogle')}</button>
      <div class="auth-divider">${t('authOr')}</div>` : '';
    body = `
      <div class="auth-title">${t('welcomeTitle')}</div>
      <div class="auth-sub">${state.authReason ? t(state.authReason) : t('welcomeSub')}</div>
      <div class="auth-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${isLogin}" data-action="auth-tab" data-val="login" class="${isLogin?'active':''}">${t('logIn')}</button>
        <button type="button" role="tab" aria-selected="${!isLogin}" data-action="auth-tab" data-val="signup" class="${!isLogin?'active':''}">${t('signUp')}</button>
      </div>
      ${google}${general}${notice}
      <div class="auth-form">
        ${!isLogin ? input('auth-name', 'text', 'fullName', 'name', 'name') : ''}
        ${input('auth-email', 'email', 'email', 'email', 'email')}
        ${input('auth-password', 'password', 'password', 'password', isLogin ? 'current-password' : 'new-password')}
        ${!isLogin ? `<div class="auth-hint">${t('passwordHint')}</div>` : ''}
        ${submit(isLogin ? 'logInBtn' : 'createAccountBtn')}
      </div>
      ${isLogin ? `<button type="button" class="auth-link" data-action="auth-tab" data-val="forgot">${t('forgotPassword')}</button>` : ''}
      <div class="auth-footer">${t('authFooter')}</div>`;
  }
  return `
    <div class="auth-card" dir="${lang()==='fa'?'rtl':'ltr'}" role="dialog" aria-modal="true" aria-label="${t('loginSignup')}">
      <button type="button" class="auth-close" data-action="close-auth" aria-label="${t('closeBtn')}">${ICONS.close}</button>
      <div class="auth-logo"><img src="../assets/icons/logo.svg" alt=""></div>
      ${body}
    </div>`;
}

function wireAuthInteractivity(){
  const bind = (id, field) => document.getElementById(id)?.addEventListener('input', e => { authDraft[field] = e.target.value; });
  bind('auth-name', 'name'); bind('auth-email', 'email'); bind('auth-password', 'password');
  document.querySelectorAll('#auth-screen input').forEach(inp => inp.addEventListener('keydown', e => {
    if(e.key === 'Enter') document.querySelector('#auth-screen [data-action="auth-submit"]')?.click();
  }));
}

function renderAuth(){
  const el = document.getElementById('auth-screen');
  // Re-rendering the form while someone types would steal their focus
  // and caret; only rebuild when something visible changed.
  const html = state.authOpen ? renderAuthScreen() : '';
  if(el.dataset.html !== html){
    const focused = document.activeElement?.id;
    el.innerHTML = html;
    el.dataset.html = html;
    wireAuthInteractivity();
    if(focused) document.getElementById(focused)?.focus();
  }
  el.classList.toggle('hidden', !state.authOpen || state.booting || !!state.bootError);
}

async function submitAuth(){
  if(authBusy) return;
  authErrors.general = '';
  authNotice = '';
  if(!validateAuth()){ renderAuth(); return; }
  const tab = state.authTab;
  const email = authDraft.email.trim(), password = authDraft.password, name = authDraft.name.trim();
  authBusy = true;
  renderAuth();
  try{
    if(tab === 'forgot'){
      await Cloud.forgotPassword(email);
      authNotice = t('resetLinkSent');
    } else if(tab === 'reset'){
      await Cloud.resetPassword(authResetToken, password);
      authResetToken = null;
      state.authTab = 'login';
      authDraft.password = '';
      authNotice = t('passwordChanged');
    } else {
      if(tab === 'login') await Cloud.signIn(email, password);
      else await Cloud.signUp(email, password, name);
      await enterSignedIn();
      if(tab === 'signup') showToast(t('checkEmailToVerify'));
    }
  }catch(err){
    authErrors.general = authErrorMessage(err);
  }finally{
    authBusy = false;
    render();
  }
}

/* After any successful sign-in: load the account and leave guest mode. */
async function enterSignedIn(){
  await loadFromCloud();
  state.guest = false;
  state.authOpen = false;
  state.authScreen = false;
  authDraft = { name:'', email:'', password:'' };
  authErrors = { name:'', email:'', password:'', general:'' };
  render();
}

/* Shown while boot() is checking a saved session against the backend
   (skeleton) or when that check failed for a reason other than the
   session actually being invalid (error + retry) — see boot(). */
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

/* state.bootError: 'offline' (no connection) or 'server' (5xx/timeout).
   Illustrated screens live in components/app-error. */
function renderBootError(){
  return renderErrorScreen(state.bootError === 'offline' ? 'offline' : 'server',
    `<button type="button" class="btn btn-primary" data-action="retry-boot">${t('retryBtn')}</button>`);
}

function renderBootScreen(){
  const el = document.getElementById('boot-screen');
  if(!el) return;
  el.innerHTML = state.bootError ? renderBootError() : renderBootSkeleton();
  el.classList.toggle('hidden', !(state.booting || state.bootError));
}
