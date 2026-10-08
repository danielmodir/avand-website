/* ============================================================================
   Avand demo — real backend wiring (Supabase: Postgres + Auth via plain REST,
   no SDK, no CDN — fits CLAUDE.md's "vanilla JS, no npm packages" rule).

   This is a conscious, deliberate exception to CLAUDE.md's "/demo/ makes no
   external requests" rule, made together with the person who owns this repo
   (see the project CLAUDE.md note next to the /demo/ bullet). Everything
   else in CLAUDE.md — scope, no-frameworks, no-CDN-for-fonts, etc. — still
   applies in full; this file only talks to the one backend the project
   itself provisioned (Supabase), over plain fetch(), with no other
   third-party script loaded.

   Covers auth, profile, settings, tasks, habits, events, and (2026-10-08)
   Connections — a real `connections` table + SECURITY DEFINER RPCs (no
   direct table writes from the client; see the migration in the Supabase
   project for the exact rules). Store/Period still stay demo-only fakes,
   same as the unused Express prototype in /backend/ was scoped.
   ========================================================================= */
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://wraoqkoaomvkndjeogdt.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_qQzANP_VygVz79prcBaYYw_joKNZH-v';
  var SESSION_KEY = 'avand_session';

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    // Fallback for older browsers without crypto.randomUUID.
    var bytes = new Uint8Array(16);
    (global.crypto || {}).getRandomValues ? global.crypto.getRandomValues(bytes) : bytes.forEach(function (_, i) { bytes[i] = Math.floor(Math.random() * 256); });
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function storeSession(authData) {
    var session = {
      access_token: authData.access_token,
      refresh_token: authData.refresh_token,
      user_id: authData.user && authData.user.id,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  var onSessionExpired = null; // app sets this to bounce back to the auth screen

  async function authFetch(path, opts) {
    opts = opts || {};
    var session = loadSession();
    var headers = Object.assign({
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    }, opts.headers || {});
    if (session) headers.Authorization = 'Bearer ' + session.access_token;

    var res = await fetch(SUPABASE_URL + path, Object.assign({}, opts, { headers: headers }));
    if (res.status === 401 && session && session.refresh_token && !opts._retried) {
      var refreshed = await tryRefresh(session.refresh_token);
      if (refreshed) return authFetch(path, Object.assign({}, opts, { _retried: true }));
      clearSession();
      if (onSessionExpired) onSessionExpired();
    }
    return res;
  }

  async function tryRefresh(refreshToken) {
    try {
      var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      var data = await res.json();
      storeSession(data);
      return true;
    } catch (e) { return false; }
  }

  async function authRequest(grantPath, body) {
    var res = await fetch(SUPABASE_URL + grantPath, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error_description || data.msg || data.error || data.message || 'Request failed');
    return data;
  }

  async function signUp(email, password, name) {
    var data = await authRequest('/auth/v1/signup', { email: email, password: password, data: { name: name || '' } });
    if (data.access_token) { storeSession(data); return data.user; }
    // Project trigger auto-confirms new users — if signup didn't hand back a
    // session anyway (e.g. confirmation still pending), logging straight in
    // covers it without making the person click an email link.
    return signIn(email, password);
  }

  async function signIn(email, password) {
    var data = await authRequest('/auth/v1/token?grant_type=password', { email: email, password: password });
    storeSession(data);
    return data.user;
  }

  async function signOut() {
    var session = loadSession();
    if (session) {
      try {
        await fetch(SUPABASE_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + session.access_token },
        });
      } catch (e) { /* best-effort; still clear local session below */ }
    }
    clearSession();
  }

  function hasSession() { return !!loadSession(); }

  // ---- generic REST helpers -------------------------------------------------
  async function restGet(table, query) {
    var res = await authFetch('/rest/v1/' + table + (query || ''));
    if (!res.ok) throw new Error('Failed to load ' + table);
    return res.json();
  }
  async function restUpsert(table, row) {
    var res = await authFetch('/rest/v1/' + table + '?on_conflict=id', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error('Failed to save ' + table);
    var rows = await res.json();
    return rows[0];
  }
  async function restDelete(table, id) {
    var res = await authFetch('/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete from ' + table);
  }
  async function restPatchSingle(table, filterCol, filterVal, patch) {
    var res = await authFetch('/rest/v1/' + table + '?' + filterCol + '=eq.' + encodeURIComponent(filterVal), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Failed to update ' + table);
    var rows = await res.json();
    return rows[0];
  }

  // ---- field mapping (camelCase client <-> snake_case columns) -------------
  function toRow(obj, map, extra) {
    var row = Object.assign({}, extra || {});
    Object.keys(map).forEach(function (clientKey) {
      if (Object.prototype.hasOwnProperty.call(obj, clientKey)) row[map[clientKey]] = obj[clientKey];
    });
    return row;
  }
  function fromRow(row, map) {
    var obj = { id: row.id };
    Object.keys(map).forEach(function (clientKey) { obj[clientKey] = row[map[clientKey]]; });
    return obj;
  }

  var TASK_MAP = { title: 'title', category: 'category', description: 'description', photos: 'photos', pinned: 'pinned', done: 'done', skipped: 'skipped', subtasks: 'subtasks', timeMode: 'time_mode', date: 'date', endDate: 'end_date', recurrence: 'recurrence', notification: 'notification' };
  var HABIT_MAP = { title: 'title', recurrence: 'recurrence', notification: 'notification', startDate: 'start_date', completedDates: 'completed_dates', skippedDates: 'skipped_dates' };
  var EVENT_MAP = { title: 'title', timeMode: 'time_mode', date: 'date', endDate: 'end_date', recurrence: 'recurrence', notification: 'notification' };
  var PROFILE_MAP = { firstName: 'first_name', lastName: 'last_name', username: 'username', email: 'email', phone: 'phone', gender: 'gender', dob: 'dob', photo: 'photo_url' };
  var SETTINGS_MAP = { notifications: 'notifications', weekStartDay: 'week_start_day', showAddMenuLabels: 'show_add_menu_labels', language: 'language', calendarSystem: 'calendar_system' };

  function nullIfEmpty(v) { return (v === '' || v === undefined) ? null : v; }

  async function loadAll() {
    var session = loadSession();
    var userId = session.user_id;
    var results = await Promise.all([
      restGet('profiles', '?id=eq.' + userId),
      restGet('user_settings', '?user_id=eq.' + userId),
      restGet('tasks', '?user_id=eq.' + userId + '&order=created_at.desc'),
      restGet('habits', '?user_id=eq.' + userId + '&order=created_at.asc'),
      restGet('events', '?user_id=eq.' + userId + '&order=date.asc'),
    ]);
    var profileRow = results[0][0] || {};
    var settingsRow = results[1][0] || {};
    return {
      profile: Object.assign(fromRow(profileRow, PROFILE_MAP), { userId: userId, photo: profileRow.photo_url || null, dob: profileRow.dob || '' }),
      settings: fromRow(settingsRow, SETTINGS_MAP),
      tasks: results[2].map(function (r) { return fromRow(r, TASK_MAP); }),
      habits: results[3].map(function (r) { return fromRow(r, HABIT_MAP); }),
      events: results[4].map(function (r) { return fromRow(r, EVENT_MAP); }),
    };
  }

  async function saveTask(task) {
    var session = loadSession();
    return restUpsert('tasks', toRow(task, TASK_MAP, { id: task.id, user_id: session.user_id, end_date: nullIfEmpty(task.endDate) }));
  }
  async function deleteTask(id) { return restDelete('tasks', id); }

  async function saveHabit(habit) {
    var session = loadSession();
    return restUpsert('habits', toRow(habit, HABIT_MAP, { id: habit.id, user_id: session.user_id }));
  }
  async function deleteHabit(id) { return restDelete('habits', id); }

  async function saveEvent(evt) {
    var session = loadSession();
    return restUpsert('events', toRow(evt, EVENT_MAP, { id: evt.id, user_id: session.user_id, end_date: nullIfEmpty(evt.endDate) }));
  }
  async function deleteEvent(id) { return restDelete('events', id); }

  async function saveProfile(profile) {
    var session = loadSession();
    var row = toRow(profile, PROFILE_MAP, {});
    row.dob = nullIfEmpty(profile.dob);
    row.photo_url = profile.photo || null;
    return restPatchSingle('profiles', 'id', session.user_id, row);
  }

  async function saveSettings(settings) {
    var session = loadSession();
    return restPatchSingle('user_settings', 'user_id', session.user_id, toRow(settings, SETTINGS_MAP, {}));
  }

  // ---- connections (real: server-side RPCs, not client-trusted writes) -----
  async function rpc(name, params) {
    var res = await authFetch('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(params || {}) });
    var text = await res.text();
    var body = text ? JSON.parse(text) : null; // void-returning functions (e.g. send_connection_request) come back 204/empty
    if (!res.ok) throw new Error((body && body.message) || 'Request failed');
    return body;
  }
  function searchUser(query) { return rpc('search_user', { q: query }); }
  function sendConnectionRequest(targetId) { return rpc('send_connection_request', { target: targetId }); }
  function respondConnectionRequest(targetId, accept) { return rpc('respond_connection_request', { target: targetId, do_accept: accept }); }
  function removeConnection(targetId) { return rpc('remove_connection', { target: targetId }); }
  function blockUser(targetId) { return rpc('block_user', { target: targetId }); }
  function unblockUser(targetId) { return rpc('unblock_user', { target: targetId }); }
  async function listConnections() {
    var session = loadSession();
    var rows = await rpc('list_connections', {});
    // Translate the server's (status, requested_by) pair into the app's
    // existing perspective-aware vocabulary (pending-outgoing vs
    // pending-incoming), so the UI code written for the old fake data
    // doesn't need to change its status model.
    return rows.map(function (r) {
      var status = r.status;
      if (status === 'pending') status = (r.requested_by === session.user_id) ? 'pending-outgoing' : 'pending-incoming';
      else if (status === 'blocked' && r.requested_by !== session.user_id) status = 'blocked-by-them';
      return { id: r.friend_id, name: r.display_name || r.username || r.phone || 'Avand user', phone: r.phone || '', status: status };
    });
  }

  global.Cloud = {
    uuid: uuid,
    hasSession: hasSession,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    loadAll: loadAll,
    saveTask: saveTask, deleteTask: deleteTask,
    saveHabit: saveHabit, deleteHabit: deleteHabit,
    saveEvent: saveEvent, deleteEvent: deleteEvent,
    saveProfile: saveProfile,
    saveSettings: saveSettings,
    searchUser: searchUser,
    sendConnectionRequest: sendConnectionRequest,
    respondConnectionRequest: respondConnectionRequest,
    removeConnection: removeConnection,
    blockUser: blockUser,
    unblockUser: unblockUser,
    listConnections: listConnections,
    set onSessionExpired(fn) { onSessionExpired = fn; },
  };
})(window);
