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

   Not available on this backend (yet): Google sign-in, server-side
   occasions (the app falls back to its static
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
    supportsSocial: true, supportsCalendar: false,
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
  // f: { email, password, username, gender, dob } — all required (auth.js).
  async function signUp(f) {
    storeSession(await request('POST', '/auth/register', { email: f.email, password: f.password, username: f.username, gender: f.gender, birth_date: f.dob }, { auth: false }));
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
    // Username, gender and birth date live on the account itself (the
    // server checks them); the synced document's copy never overrides them.
    server = { username: me.username || '', gender: me.gender || '', dob: me.birth_date || '' };
    var profile = Object.assign({}, data.profile || {}, server, {
      email: me.email,
      firstName: (data.profile && data.profile.firstName) || me.first_name || '',
      lastName: (data.profile && data.profile.lastName) || me.last_name || '',
      // Always the server's random code (an older copy in the synced
      // document could still hold the old sequential TJ0012-style id).
      userId: 'TJ-' + me.display_id,
    });
    profile.name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    loaded = true;
    startHeartbeat();
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
        // Another device saved first: keep what it added (tasks, habits,
        // events this device doesn't have and didn't delete), then write.
        var current = err.body.current;
        if (mergeFromServer(current.data || {}) && global.render) global.render();
        version = current.version;
        version = (await request('PUT', '/sync', { version: version, data: snapshot() })).version;
      }
    })();
    try { await pushing; } finally { pushing = null; }
  }

  function mergeFromServer(data) {
    var added = false;
    ['tasks', 'habits', 'events'].forEach(function (k) {
      var mine = {};
      (state[k] || []).forEach(function (x) { mine[x.id] = true; });
      (data[k] || []).forEach(function (x) {
        if (x && x.id && !mine[x.id] && !deleted[x.id]) { state[k].push(x); added = true; }
      });
    });
    return added;
  }

  function onSaveError(err) {
    if (global.showToast && global.t) global.showToast(global.t('saveFailed'));
    if (global.console) console.warn('[sync]', err && err.message);
  }

  // Everything the app saves goes through one debounced document write.
  function queued() { schedulePush(); return Promise.resolve(); }

  /* The account's own fields as the server last confirmed them. */
  var server = { username: '', gender: '', dob: '' };

  /* Profile: the document as usual, plus the account fields that changed
   * (username; gender/birth date only fill an empty value, the server
   * refuses anything else). Rejects with the server's error, e.g.
   * username_taken, so the screen can put the old value back. */
  function saveProfile(p) {
    schedulePush();
    var body = {};
    if ((p.username || '') !== server.username) body.username = p.username || '';
    if (p.gender && !server.gender) body.gender = p.gender;
    if (p.dob && !server.dob) body.birth_date = p.dob;
    if (!Object.keys(body).length || !hasSession()) return Promise.resolve();
    return request('PATCH', '/me', body).then(function (me) {
      server = { username: me.username || '', gender: me.gender || '', dob: me.birth_date || '' };
    });
  }

  // Deletions this session, so a merge after a 409 doesn't bring them back.
  var deleted = {};
  function queuedDelete(id) { if (id) deleted[id] = true; return queued(); }

  // Presence for the admin panel's "online now" and time-in-app: a tiny
  // ping to our own API once a minute, only while the app is visible and
  // signed in. Nothing about what the person does is sent.
  var heartbeatTimer = null;
  function heartbeat() {
    if (!hasSession() || document.hidden) return;
    request('POST', '/me/heartbeat').catch(function () { /* offline: try next minute */ });
  }
  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeat();
    heartbeatTimer = setInterval(heartbeat, 60000);
  }
  global.document.addEventListener('visibilitychange', function () { if (!document.hidden && heartbeatTimer) heartbeat(); });

  // Save before the tab goes away (closing, switching apps on a phone).
  global.addEventListener('pagehide', function () { if (dirty) flush().catch(function () {}); });
  global.document.addEventListener('visibilitychange', function () { if (document.hidden && dirty) flush().catch(function () {}); });

  function socialRows(rows) {
    return (rows || []).map(function (r) {
      return { id: r.id, name: r.name, username: r.username || '', userId: 'TJ-' + r.public_id, phone: '', status: r.status || 'none' };
    });
  }

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
    // Banner picture/title from the admin panel (public, no sign-in).
    siteContent: function () { return request('GET', '/content', undefined, { auth: false }); },
    // Articles the admin panel placed on the app's desks (public).
    // Official Hijri month starts (public; edited in the admin panel).
    hijriMonths: function () { return request('GET', '/calendar/hijri-months', undefined, { auth: false }); },
    featuredArticles: function () { return request('GET', '/articles/featured', undefined, { auth: false }); },
    loadAll: loadAll,
    onStateChanged: schedulePush,
    saveTask: queued, deleteTask: queuedDelete, saveHabit: queued, deleteHabit: queuedDelete,
    saveEvent: queued, deleteEvent: queuedDelete, saveProfile: saveProfile, saveSettings: queued,
    usernameAvailable: function (name) { return request('GET', '/me/profile/username-available?username=' + encodeURIComponent(name)).then(function (r) { return !!r.available; }); },
    changePassword: function (current, next) { return request('POST', '/me/password', { current_password: current, new_password: next }); },
    deleteAccount: function (password) {
      return request('POST', '/me/delete', { password: password }).then(function () { clearTimeout(pushTimer); dirty = false; clearSession(); version = 0; loaded = false; });
    },
    // Friends (backend-php/lib/social.php); people are addressed by their
    // public id, and shown by @username and TJ- code only.
    searchUser: function (q) { return request('GET', '/social/search?q=' + encodeURIComponent(q)).then(socialRows); },
    listConnections: function () { return request('GET', '/social/connections').then(socialRows); },
    sendConnectionRequest: function (id) { return request('POST', '/social/connections/' + id + '/request'); },
    respondConnectionRequest: function (id, accept) { return request('POST', '/social/connections/' + id + '/respond', { accept: !!accept }); },
    removeConnection: function (id) { return request('DELETE', '/social/connections/' + id); },
    blockUser: function (id) { return request('PUT', '/social/blocks/' + id); },
    unblockUser: function (id) { return request('DELETE', '/social/blocks/' + id); },
    // Personal invite link: whoever opens it becomes a friend.
    inviteToken: function () { return request('GET', '/social/invite').then(function (r) { return r.token; }); },
    resetInviteToken: function () { return request('POST', '/social/invite/reset').then(function (r) { return r.token; }); },
    acceptInvite: function (token) { return request('POST', '/social/invite/accept', { token: token }); },
    // Period sharing: the friends I show my cycle to (max 3), and the
    // cycles friends show me.
    periodShares: function () { return request('GET', '/period/shares').then(socialRows); },
    savePeriodShares: function (ids) { return request('PUT', '/period/shares', { viewers: ids }).then(socialRows); },
    sharedPeriods: function () {
      return request('GET', '/period/shared-with-me').then(function (rows) {
        return (rows || []).map(function (r) { return { id: r.id, name: r.name, userId: 'TJ-' + r.public_id, period: r.period }; });
      });
    },
    // Web Push (backend-php/lib/push.php): this browser's push address,
    // and the reminders the server sends while the app is closed.
    pushKey: function () { return request('GET', '/notifications/push-key', undefined, { auth: false }).then(function (r) { return r.public_key; }); },
    pushSubscribe: pushSubscribe,
    pushUnsubscribe: function (id) { return request('DELETE', '/notifications/subscriptions/' + id); },
    pushSchedule: function (items) { return request('PUT', '/notifications/schedule', { items: items }); },
    calendarYear: unsupported,
  });
  function pushSubscribe(sub) {
    return request('POST', '/notifications/subscriptions', {
      platform: 'web', provider: 'webpush', token: sub.endpoint,
      web_p256dh: sub.keys && sub.keys.p256dh, web_auth: sub.keys && sub.keys.auth,
    }).then(function (r) { return r.id; });
  }
  global.Cloud = api;
})(window);
