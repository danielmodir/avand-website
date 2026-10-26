/* ============ AUTH POPUP ============
   Guests (API configured, not signed in) can browse the calendar and
   occasions freely; anything that needs an account opens this popup
   instead (see requireAccount / GUEST_ACTIONS in js/core/events.js).
   Views: login · signup · forgot (email a one-time code) · forgot-code
   (type it) · reset (choose a new password) · verify-code (confirm the
   email). Codes are 6 digits, from support@toojibee.ir, valid 10 minutes.
   Sign-up, and signing in to an account whose email isn't confirmed yet,
   go to verify-code first: the code signs in (the owner's request,
   2026-10-25). Everything talks to the real API through Cloud.*; nothing
   here is simulated. */
/* Sign-up asks for a username (not a real name), email, password, gender
   and date of birth — all required. The API checks the same rules. */
const EMPTY_AUTH_DRAFT = { username:'', email:'', password:'', gender:'', dob:'' };
const EMPTY_AUTH_ERRORS = { username:'', email:'', password:'', gender:'', dob:'', code:'', general:'' };
let authDraft = { ...EMPTY_AUTH_DRAFT };

let authErrors = { ...EMPTY_AUTH_ERRORS };

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;   // same as the Django model / PHP API
const MIN_SIGNUP_AGE = 9;

let authBusy = false;
let authNotice = '';            // green confirmation line (reset link sent, password changed…)
let authResetToken = null;      // set while the "choose a new password" view is open
let authCode = '';              // what's typed in a code view
let authCodeEmail = '';         // where the code went (shown in the view)
let authResendAt = 0;           // "send again" waits until then (ms)
let authResendTimer = null;
const AUTH_RESEND_WAIT = 60000;
const CODE_TABS = ['forgot-code', 'verify-code'];
let authProviders = null;       // { google: bool } from the server, fetched once

const MIN_PASSWORD = 8;         // same rule as the API's validators

function openAuth(tab, reason){
  state.authTab = tab || state.authTab || 'login';
  state.authOpen = true;
  state.authReason = reason || null;
  authErrors = { ...EMPTY_AUTH_ERRORS };
  authNotice = '';
  state.navExpanded = false;
  if(authProviders === null && Cloud.isConfigured()){
    Cloud.authProviders().then(p => { authProviders = p; renderAuth(); }).catch(() => { authProviders = { google:false }; });
  }
  render();
  setTimeout(() => document.getElementById(state.authTab === 'signup' ? 'auth-username' : 'auth-email')?.focus(), 80);
}

function closeAuth(){
  if(authBusy) return;
  state.authOpen = false;
  authResetToken = null;
  if(['reset', 'forgot', 'forgot-code', 'verify-code'].includes(state.authTab)) state.authTab = 'login';
  render();
}

function startResendWait(){
  authResendAt = Date.now() + AUTH_RESEND_WAIT;
  clearInterval(authResendTimer);
  authResendTimer = setInterval(() => {
    if(Date.now() >= authResendAt) clearInterval(authResendTimer);
    if(state.authOpen && CODE_TABS.includes(state.authTab)) renderAuth();
  }, 1000);
}

/* Digits only, Persian digits allowed (۱۲۳ -> 123), at most 6. */
function cleanCode(s){
  return String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 6);
}

async function resendAuthCode(){
  if(authBusy || Date.now() < authResendAt) return;
  authErrors = { ...EMPTY_AUTH_ERRORS }; authNotice = '';
  try{
    if(state.authTab === 'verify-code') await Cloud.resendVerifyCode(authCodeEmail);
    else await Cloud.forgotPassword(authCodeEmail);
    authNotice = t('codeResent');
    startResendWait();
  }catch(err){ authErrors.general = authErrorMessage(err); }
  renderAuth();
}

/* 8+ characters with at least one letter and one digit or symbol. */
function passwordProblem(pw){
  if([...pw].length < MIN_PASSWORD) return t('passwordTooShort');
  if(!/\p{L}/u.test(pw) || !/[^\p{L}]/u.test(pw)) return t('passwordNeedsMix');
  return '';
}

function validateAuth(){
  const tab = state.authTab;
  const errs = { ...EMPTY_AUTH_ERRORS };
  const d = authDraft;
  if(CODE_TABS.includes(tab)){
    if(cleanCode(authCode).length !== 6) errs.code = t('codeInvalid');
    authErrors = errs;
    return !errs.code;
  }
  if(tab === 'signup'){
    if(!USERNAME_RE.test(d.username.trim().toLowerCase())) errs.username = t('usernameInvalid');
    if(!d.gender) errs.gender = t('genderRequired');
    if(!d.dob) errs.dob = t('dobRequired');
    else if(d.dob > dateYearsAgo(MIN_SIGNUP_AGE)) errs.dob = t('dobTooYoung');
  }
  if(tab !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) errs.email = t('emailInvalid');
  if(tab === 'login'){ if(d.password.length < MIN_PASSWORD) errs.password = t('passwordTooShort'); }
  else if(tab !== 'forgot') errs.password = passwordProblem(d.password);
  authErrors = errs;
  return !Object.values(errs).some(Boolean);
}

/* Server error codes (apps/common/exceptions.py) -> friendly text. */
function authErrorMessage(err){
  if(!err || err.status === undefined) return t('errNetwork');   // fetch failed: server unreachable
  const byCode = {
    invalid_credentials: 'errInvalidCredentials',
    email_taken: 'errEmailTaken',
    username_taken: 'errUsernameTaken',
    account_suspended: 'errSuspended',
    invalid_or_expired_token: 'errCodeExpired',
    invalid_code: 'errInvalidCode',
    code_expired: 'errCodeExpired',
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
    `<div class="${errClass(field)}"><input type="${type}" id="${id}" placeholder="${t(key)}" value="${escapeAttr(authDraft[field])}" autocomplete="${autocomplete}" ${type === 'email' || field === 'username' ? 'dir="ltr" autocapitalize="off" spellcheck="false"' : ''}>${errMsg(field)}</div>`;
  const general = authErrors.general ? `<div class="auth-alert error" role="alert">${escapeHtml(authErrors.general)}</div>` : '';
  const notice = authNotice ? `<div class="auth-alert ok" role="status">${escapeHtml(authNotice)}</div>` : '';
  const submit = (labelKey) => `<button class="btn btn-primary auth-submit" data-action="auth-submit" ${authBusy?'disabled':''}>${authBusy ? t('authSubmitting') : t(labelKey)}</button>`;

  let body;
  if(CODE_TABS.includes(tab)){
    const wait = Math.max(0, Math.ceil((authResendAt - Date.now()) / 1000));
    const resend = wait > 0
      ? `<div class="auth-resend-wait">${t('resendIn').replace('{s}', dig(wait))}</div>`
      : `<button type="button" class="auth-link" data-action="auth-resend">${t('resendCode')}</button>`;
    body = `
      <div class="auth-icon-badge" aria-hidden="true">${ICONS.mail || '✉'}</div>
      <div class="auth-title">${t(tab === 'verify-code' ? 'verifyEmailTitle' : 'codeTitle')}</div>
      <div class="auth-sub">${escapeHtml(t('codeSub')).replace('{email}', `<b dir="ltr">${escapeHtml(authCodeEmail)}</b>`)}</div>
      ${general}${notice}
      <div class="auth-spam-note" role="note">${t('checkSpamLong')}</div>
      <div class="auth-form">
        <div class="${errClass('code')}">
          <input type="text" id="auth-code" class="auth-code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr"
            placeholder="${t('codePlaceholder')}" value="${escapeAttr(authCode)}" aria-label="${t('codePlaceholder')}">${errMsg('code')}
        </div>
        ${submit('confirmCodeBtn')}
      </div>
      ${resend}
      <button type="button" class="auth-link" data-action="auth-tab" data-val="login">${t('backToLogin')}</button>`;
  } else if(tab === 'forgot'){
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
        ${!isLogin ? input('auth-username', 'text', 'username', 'username', 'username') : ''}
        ${input('auth-email', 'email', 'email', 'email', 'email')}
        ${input('auth-password', 'password', 'password', 'password', isLogin ? 'current-password' : 'new-password')}
        ${!isLogin ? `
          <div class="${errClass('gender')}">
            <div class="auth-choice" role="radiogroup" aria-label="${t('gender')}">
              ${['female','male'].map(g => `<button type="button" role="radio" aria-checked="${authDraft.gender===g}" class="${authDraft.gender===g?'active':''}" data-gender="${g}">${t(g)}</button>`).join('')}
            </div>${errMsg('gender')}
          </div>
          <div class="${errClass('dob')}">
            <button type="button" class="date-field-btn ${authDraft.dob?'':'empty'}" id="auth-dob">${authDraft.dob ? formatDateLabel(authDraft.dob) : t('dateOfBirth')}${ICONS.calendarIcon}</button>${errMsg('dob')}
          </div>` : ''}
        ${submit(isLogin ? 'logInBtn' : 'createAccountBtn')}
      </div>
      ${isLogin ? `<button type="button" class="auth-link" data-action="auth-tab" data-val="forgot">${t('forgotPassword')}</button>` : ''}
      <div class="auth-footer">${t('authFooter')}</div>`;
  }
  return `
    <div class="auth-card" dir="${lang()==='fa'?'rtl':'ltr'}" role="dialog" aria-modal="true" aria-label="${t('loginSignup')}">
      <button type="button" class="auth-close" data-action="close-auth" aria-label="${t('closeBtn')}">${ICONS.close}</button>
      <div class="auth-logo"><img src="../assets/icons/logo.svg?v=tj5" alt=""></div>
      ${body}
    </div>`;
}

/* The password field: a show/hide button inside it, and on sign-up / a new
   password the three rules (passwordProblem) ticked off while typing,
   instead of only failing after "Create account". Added to the field once
   it's on the page (renderAuth keeps the same field while the HTML stays). */
function enhancePasswordField(){
  const inp = document.getElementById('auth-password');
  if(!inp || inp.dataset.enhanced) return;
  inp.dataset.enhanced = '1';
  const field = inp.closest('.field');
  field.classList.add('pw-field');
  const eye = document.createElement('button');
  eye.type = 'button';
  eye.className = 'pw-eye';
  const paintEye = () => {
    const shown = inp.type === 'text';
    eye.innerHTML = shown ? ICONS.eyeOff : ICONS.eye;
    eye.setAttribute('aria-label', t(shown ? 'hidePassword' : 'showPassword'));
    eye.setAttribute('aria-pressed', String(shown));
  };
  paintEye();
  eye.addEventListener('click', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; paintEye(); inp.focus(); });
  inp.after(eye);
  if(state.authTab !== 'signup' && state.authTab !== 'reset') return;
  const rules = document.createElement('ul');
  rules.className = 'pw-rules';
  rules.setAttribute('aria-live', 'polite');
  const RULES = [
    ['pwRuleLength', pw => [...pw].length >= MIN_PASSWORD],
    ['pwRuleLetter', pw => /\p{L}/u.test(pw)],
    ['pwRuleOther', pw => /[^\p{L}]/u.test(pw)],
  ];
  const paint = () => {
    rules.innerHTML = RULES.map(([k, ok]) => `<li class="${ok(inp.value) ? 'ok' : ''}">${ok(inp.value) ? '✓' : '○'} ${t(k)}</li>`).join('');
  };
  paint();
  inp.addEventListener('input', paint);
  field.after(rules);
}

function wireAuthInteractivity(){
  const bind = (id, field) => document.getElementById(id)?.addEventListener('input', e => { authDraft[field] = e.target.value; });
  bind('auth-username', 'username'); bind('auth-email', 'email'); bind('auth-password', 'password');
  enhancePasswordField();
  const code = document.getElementById('auth-code');
  code?.addEventListener('input', () => {
    const clean = cleanCode(code.value);
    if(code.value !== clean) code.value = clean;
    authCode = clean;
    // All six typed (or pasted): confirm without another tap.
    if(clean.length === 6 && !authBusy) submitAuth();
  });
  document.querySelectorAll('#auth-screen [data-gender]').forEach(b => b.addEventListener('click', () => {
    authDraft.gender = b.dataset.gender; authErrors.gender = ''; renderAuth();
  }));
  document.getElementById('auth-dob')?.addEventListener('click', () => openDatePicker({
    title: t('dateOfBirth'), value: authDraft.dob, max: dateYearsAgo(MIN_SIGNUP_AGE), min: dateYearsAgo(110),
    onPick: v => { authDraft.dob = v; authErrors.dob = ''; renderAuth(); },
  }));
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
  const email = authDraft.email.trim(), password = authDraft.password;
  authBusy = true;
  renderAuth();
  try{
    if(tab === 'forgot'){
      await Cloud.forgotPassword(email);
      authCodeEmail = email; authCode = '';
      state.authTab = 'forgot-code';
      authNotice = t('resetLinkSent');
      startResendWait();
    } else if(tab === 'forgot-code'){
      authResetToken = await Cloud.checkResetCode(authCodeEmail, cleanCode(authCode));
      authCode = ''; authDraft.password = '';
      state.authTab = 'reset';
    } else if(tab === 'verify-code'){
      await Cloud.verifyEmailCode(authCodeEmail, cleanCode(authCode));
      authCode = '';
      await enterSignedIn();
    } else if(tab === 'reset'){
      await Cloud.resetPassword(authResetToken, password);
      authResetToken = null;
      state.authTab = 'login';
      authDraft.password = '';
      authNotice = t('passwordChanged');
    } else {
      if(tab === 'login'){
        try{ await Cloud.signIn(email, password); }
        catch(err){
          // Email not confirmed yet: the server just sent a code.
          if(err && err.code === 'email_not_verified'){ goVerifyCode(err.body?.email || email); return; }
          throw err;
        }
        await enterSignedIn();
      } else {
        const r = await Cloud.signUp({ email, password, username: authDraft.username.trim().toLowerCase(), gender: authDraft.gender, dob: authDraft.dob });
        if(r && r.verify_required){ goVerifyCode(r.email || email); return; }
        await enterSignedIn();
      }
    }
  }catch(err){
    // Field rules the server rejected (PHP: fields, Django: detail).
    const fields = err && (err.body?.fields || err.body?.detail);
    const fieldMsg = { username:'usernameInvalid', gender:'genderRequired', birth_date:'dobTooYoung' };
    const hits = fields && typeof fields === 'object' ? Object.keys(fieldMsg).filter(k => fields[k]) : [];
    if(hits.length && err.code !== 'weak_password') hits.forEach(k => { authErrors[k === 'birth_date' ? 'dob' : k] = t(fieldMsg[k]); });
    else authErrors.general = authErrorMessage(err);
  }finally{
    authBusy = false;
    render();
  }
}

/* The code to confirm `email` is on its way: ask for it. */
function goVerifyCode(email){
  authCodeEmail = email; authCode = '';
  authDraft.password = '';
  state.authTab = 'verify-code';
  authNotice = t('verifyCodeSent');
  startResendWait();
  setTimeout(() => document.getElementById('auth-code')?.focus(), 80);
}

/* After any successful sign-in: load the account and leave guest mode. */
async function enterSignedIn(){
  await loadFromCloud();
  state.guest = false;
  state.authOpen = false;
  state.authScreen = false;
  authDraft = { ...EMPTY_AUTH_DRAFT };
  authErrors = { ...EMPTY_AUTH_ERRORS };
  render();
  acceptPendingInvite(); // opened a friend's invite link before signing in (app.js)
  loadGroups().then(joinPendingGroup); // ... or a group's link (js/core/groups.js)
  loadSharedPeriods();
  startReminders();
  refreshContactUnread();
  welcomeChain(); // app.js
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
