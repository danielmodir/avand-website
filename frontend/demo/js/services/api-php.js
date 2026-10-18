/* ============================================================================
   Toojibee API client for the PHP backend (backend-php/, the live host).
   Loaded right after api.js; when js/config.js says backend: 'php' it
   replaces window.Cloud with the same interface, so nothing else in the
   app knows which backend it talks to.

   Auth endpoints are the same as the Django API's. Data is different and
   simpler: the account holds ONE document — tasks, habits, events,
   profile, settings, period — read once at sign-in (GET /sync) and
   written back, debounced, after changes (PUT /sync with the version it
   started from). If another device saved in between (409), the newer
   server version number is taken and this device's copy written on top
   (last write wins), same rule as the Django client per item.

   Not available on this backend (yet): friends/connections, Google
   sign-in, server-side occasions (the app falls back to its static
   dataset). Only talks to the project's own API (CLAUDE.md exception).
   ========================================================================= */
(function (global) {
  'use strict';

  var CONFIG = global.TOOJIBEE_CONFIG || {};
  if (CONFIG.backend !== 'php' || !CONFIG.apiBase) return;

  var BASE = CONFIG.apiBase.replace(/\/$/, '');
  var SESSION_KEY = 'toojibee_session';
  var LOCAL_DATA_KEY = 'toojibee-local-data-v1'; // js/core/local-store.js
  var base = global.Cloud; // the Django client: reuse uuid(), takeEmailLink()

  function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
  function storeSession(t) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token, user_id: t.user_id })); } catch (e) { /* private mode */ }
  }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
  function hasSession() { return !!loadSession(); }

  var api = {
    onSessionExpired: null, onPhotoLoaded: null, onAvatarLoaded: null,
    supportsSocial: false, supportsCalendar: false,
  };

  function ApiError(status, body) {
    var err = new Error((body && body.error) || 'Request failed');
    err.status = status; err.code = body && body.error; err.body = body;
    return err;
  }

  var refreshing = null;
  function refresh() {
    if (!refreshing) {
      refreshing = (async function () {
        var s = loadSession();
        if (!s || !s.refresh_token) return false;
        var res = await fetch(BASE + '/auth/refresh', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: s.refresh_token }),
        }).catch(function () { return null; });
        if (!res || !res.ok) return false;
        storeSession(await res.json());
        return true;
      })().finally(function () { setTimeout(function () { refreshing = null; }, 0); });
    }
    return refreshing;
  }

  async function request(method, path, body, opts) {
    opts = opts || {};
    var headers = {};
    var s = loadSession();
    if (s && opts.auth !== false) headers.Authorization = 'Bearer ' + s.access_token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var res = await fetch(BASE + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 401 && opts.auth !== false && !opts.retried && s) {
      if (await refresh()) return request(method, path, body, Object.assign({}, opts, { retried: true }));
      clearSession();
      if (api.onSessionExpired) api.onSessionExpired();
    }
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { error: 'server_error' }; }
    if (!res.ok) throw ApiError(res.status, data);
    return data;
  }

  // ── auth ──────────────────────────────────────────────────────────────
  async function signUp(email, password, name) {
    var parts = (name || '').trim().split(/\s+/);
    storeSession(await request('POST', '/auth/register', { email: email, password: password, first_name: parts.shift() || '', last_name: parts.join(' ') }, { auth: false }));
  }
  async function signIn(email, password) {
    storeSession(await request('POST', '/auth/login', { email: email, password: password }, { auth: false }));
  }
  async function signOut() {
    clearTimeout(pushTimer);
    if (hasSession()) { try { await flush(); await request('POST', '/auth/logout'); } catch (e) { /* best effort */ } }
    clearSession();
    version = 0; loaded = false;
  }

  // ── the account's document ───────────────────────────────────────────
  var version = 0, loaded = false, pushTimer = null, pushing = null, dirty = false;

  function readLocalDeviceData() {
    try { var d = JSON.parse(localStorage.getItem(LOCAL_DATA_KEY) || 'null'); return d && d.v === 1 ? d : null; } catch (e) { return null; }
  }
  function isEmpty(data) {
    return !data || (!(data.tasks || []).length && !(data.habits || []).length && !(data.events || []).length);
  }

  async function loadAll() {
    var me = await request('GET', '/me');
    var doc = await request('GET', '/sync');
    version = doc.version || 0;
    var data = doc.data || {};
    // First sign-in on a device that was used without an account: what
    // the person made here becomes their account's starting data.
    var local = readLocalDeviceData();
    var adopt = isEmpty(data) && local && !isEmpty(local);
    if (adopt) data = { profile: local.profile, settings: local.settings, tasks: local.tasks, habits: local.habits, events: local.events, period: local.period };
    var profile = Object.assign({}, data.profile || {}, {
      email: me.email,
      firstName: (data.profile && data.profile.firstName) || me.first_name || '',
      lastName: (data.profile && data.profile.lastName) || me.last_name || '',
      userId: (data.profile && data.profile.userId) || ('TJ' + String(me.id).padStart(4, '0')),
    });
    profile.name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    loaded = true;
    if (adopt) { dirty = true; schedulePush(); }
    return { profile: profile, settings: data.settings || {}, tasks: data.tasks || [], habits: data.habits || [], events: data.events || [], period: data.period || null };
  }

  function snapshot() {
    // `state` is the app's top-level const (js/core/state.js).
    /* global state */
    return { profile: state.profile, settings: state.settings, tasks: state.tasks, habits: state.habits, events: state.events, period: state.period };
  }

  function schedulePush() {
    if (!loaded || !hasSession()) return;
    dirty = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { flush().catch(onSaveError); }, 800);
  }

  async function flush() {
    if (pushing) { await pushing.catch(function () {}); }
    if (!dirty || !loaded || !hasSession()) return;
    dirty = false;
    pushing = (async function () {
      var body = { version: version, data: snapshot() };
      try {
        version = (await request('PUT', '/sync', body)).version;
      } catch (err) {
        if (err.status !== 409) { dirty = true; throw err; }
        version = err.body.current.version;          // another device saved first
        version = (await request('PUT', '/sync', { version: version, data: snapshot() })).version;
      }
    })();
    try { await pushing; } finally { pushing = null; }
  }

  function onSaveError(err) {
    if (global.showToast && global.t) global.showToast(global.t('saveFailed'));
    if (global.console) console.warn('[sync]', err && err.message);
  }

  // Everything the app saves goes through one debounced document write.
  function queued() { schedulePush(); return Promise.resolve(); }

  // Save before the tab goes away (closing, switching apps on a phone).
  global.addEventListener('pagehide', function () { if (dirty) flush().catch(function () {}); });
  global.document.addEventListener('visibilitychange', function () { if (document.hidden && dirty) flush().catch(function () {}); });

  function unsupported() { var e = new Error('not_available'); e.status = 501; e.code = 'not_available'; return Promise.reject(e); }

  Object.assign(api, {
    uuid: base.uuid, isConfigured: function () { return true; }, hasSession: hasSession,
    signUp: signUp, signIn: signIn, signOut: signOut,
    signInWithGoogle: function () { /* not on this backend */ },
    consumeOAuthRedirect: function () { return Promise.resolve(false); },
    authProviders: function () { return Promise.resolve({ password: true, google: false }); },
    forgotPassword: function (email) { return request('POST', '/auth/password/forgot', { email: email }, { auth: false }); },
    resetPassword: function (token, password) { return request('POST', '/auth/password/reset', { token: token, password: password }, { auth: false }); },
    verifyEmail: function (token) { return request('POST', '/auth/email/verify', { token: token }, { auth: false }); },
    takeEmailLink: base.takeEmailLink,
    loadAll: loadAll,
    onStateChanged: schedulePush,
    saveTask: queued, deleteTask: queued, saveHabit: queued, deleteHabit: queued,
    saveEvent: queued, deleteEvent: queued, saveProfile: queued, saveSettings: queued,
    searchUser: function () { return Promise.resolve([]); },
    listConnections: function () { return Promise.resolve([]); },
    sendConnectionRequest: unsupported, respondConnectionRequest: unsupported,
    removeConnection: unsupported, blockUser: unsupported, unblockUser: unsupported,
    calendarYear: unsupported,
  });
  global.Cloud = api;
})(window);
