/* ============================================================================
   Toojibee API client (Django backend, backend/README.md). Plain fetch, no
   SDK, no CDN. Exposes the same `Cloud` interface the app has always used,
   so nothing outside this file knows which backend it talks to.

   It also translates between the shapes the app keeps in memory and the
   API's tables:
     task.subtasks[]            <-> child tasks (parent_id)
     task.done / skipped        <-> a task_occurrence on the task's date
     task.statusByDate          <-> one task_occurrence per day (repeating)
     habit.completed/skippedDates <-> habit_logs
     task.category (a name)     <-> categories (created on first use)
     photos (data: URLs)        <-> uploaded files + attachments

   Writes to the same item are queued so they reach the server in order.
   Every write sends the `version` it last saw; if another device changed
   the item meanwhile (409), this device's edit is re-applied on top
   (last write wins per item) instead of being lost silently.

   Only talks to the project's own API (CLAUDE.md /demo/ exception).
   ========================================================================= */
(function (global) {
  'use strict';

  var CONFIG = global.TOOJIBEE_CONFIG || {};
  var BASE = (CONFIG.apiBase || '').replace(/\/$/, '');
  var SESSION_KEY = 'toojibee_session';

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    var b = new Uint8Array(16);
    global.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ── session ───────────────────────────────────────────────────────────
  function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
  function storeSession(t) {
    var s = { access_token: t.access_token, refresh_token: t.refresh_token, user_id: t.user_id };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
    return s;
  }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
  function hasSession() { return !!(BASE && loadSession()); }
  function isConfigured() { return !!BASE; }

  /* Hooks the app sets: onSessionExpired(), and onPhotoLoaded(itemId, url)
     / onAvatarLoaded(url) once a private photo has been fetched. */
  var api = { onSessionExpired: null, onPhotoLoaded: null, onAvatarLoaded: null };
  var refreshing = null;

  function deviceMeta() {
    return { platform: 'web', device_name: (navigator.userAgentData && navigator.userAgentData.platform) || 'Browser' };
  }

  function ApiError(status, body) {
    var err = new Error((body && (body.detail && typeof body.detail === 'string' ? body.detail : body.error)) || 'Request failed');
    err.status = status; err.code = body && body.error; err.body = body;
    return err;
  }

  async function refresh() {
    // One refresh at a time: parallel 401s all wait for the same rotation,
    // otherwise the second would present an already-rotated token and the
    // server would (correctly) sign the user out everywhere.
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
    var payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    var res = await fetch(BASE + path, { method: method, headers: headers, body: payload });
    if (res.status === 401 && opts.auth !== false && !opts.retried && s) {
      if (await refresh()) return request(method, path, body, Object.assign({}, opts, { retried: true }));
      clearSession();
      if (api.onSessionExpired) api.onSessionExpired();
    }
    if (opts.raw) return res;
    var text = await res.text();
    var data = text ? JSON.parse(text) : null;
    if (!res.ok) throw ApiError(res.status, data);
    return data;
  }

  // ── auth ──────────────────────────────────────────────────────────────
  // f: { email, password, username, gender, dob } — all required (auth.js).
  async function signUp(f) {
    var tokens = await request('POST', '/auth/register', Object.assign({
      email: f.email, password: f.password, username: f.username, gender: f.gender, birth_date: f.dob,
    }, deviceMeta()), { auth: false });
    storeSession(tokens);
  }

  async function signIn(email, password) {
    storeSession(await request('POST', '/auth/login', Object.assign({ email: email, password: password }, deviceMeta()), { auth: false }));
  }

  function signInWithGoogle() {
    var back = global.location.origin + global.location.pathname;
    global.location.href = BASE + '/auth/google/start?next=' + encodeURIComponent(back);
  }

  /* After the Google redirect the URL carries #login_code=… (one-time,
     60 s); exchange it for tokens and strip it from the address bar. */
  async function consumeOAuthRedirect() {
    var m = /[#&]login_code=([^&]+)/.exec(global.location.hash);
    var err = /[#&]login_error=([^&]+)/.exec(global.location.hash);
    if (!m && !err) return false;
    history.replaceState(null, '', global.location.pathname + global.location.search);
    if (!m) { var e = new Error('google_failed'); e.code = err ? decodeURIComponent(err[1]) : 'google_failed'; throw e; }
    storeSession(await request('POST', '/auth/google/exchange', { code: decodeURIComponent(m[1]) }, { auth: false }));
    return true;
  }

  function authProviders() { return request('GET', '/auth/providers', undefined, { auth: false }); }
  function forgotPassword(email) { return request('POST', '/auth/password/forgot', { email: email }, { auth: false }); }
  function resetPassword(token, password) { return request('POST', '/auth/password/reset', { token: token, password: password }, { auth: false }); }
  function verifyEmail(token) { return request('POST', '/auth/email/verify', { token: token }, { auth: false }); }

  /* Links from emails land on the app as #verify-email=… or
     #reset-password=…; returns { kind, token } and clears the hash. */
  function takeEmailLink() {
    var m = /[#&](verify-email|reset-password)=([^&]+)/.exec(global.location.hash);
    if (!m) return null;
    history.replaceState(null, '', global.location.pathname + global.location.search);
    return { kind: m[1], token: decodeURIComponent(m[2]) };
  }

  async function signOut() {
    if (hasSession()) { try { await request('POST', '/auth/logout'); } catch (e) { /* best effort */ } }
    clearSession();
    resetCaches();
  }

  // ── caches of what the server last confirmed ─────────────────────────
  var versions = {};       // "<kind>:<id>" -> version
  var statuses = {};       // "<taskId>|<date>" or "habit:<id>|<date>" -> server status
  var children = {};       // parent task id -> [subtask ids] on the server
  var attachments = {};    // task id -> { file_id: true }
  var photoFiles = {};     // object URL / data URL -> file id
  var categories = {};     // name -> category id
  var meVersions = { profile: 0, settings: 0 };
  var avatarFileId = null;
  var queues = {};

  function resetCaches() {
    versions = {}; statuses = {}; children = {}; attachments = {}; photoFiles = {}; categories = {};
    meVersions = { profile: 0, settings: 0 }; avatarFileId = null; queues = {};
  }

  function enqueue(key, job) {
    var prev = queues[key] || Promise.resolve();
    var next = prev.catch(function () {}).then(job);
    queues[key] = next;
    return next;
  }

  /* PUT with optimistic locking; on 409 re-apply this edit on the newer row. */
  async function putVersioned(kind, id, body) {
    var key = kind + ':' + id;
    var send = function (v) { return request('PUT', '/planning/' + kind + '/' + id, Object.assign({}, body, v ? { version: v } : {})); };
    var row;
    try {
      row = await send(versions[key]);
    } catch (e) {
      if (e.status !== 409 || !e.body || !e.body.current) throw e;
      row = await send(e.body.current.version);
    }
    versions[key] = row.version;
    return row;
  }

  // ── shape conversion ─────────────────────────────────────────────────
  var NOTIF_TO_API = { time: 'at_time', repeat: 'repeating' };
  var NOTIF_FROM_API = { at_time: 'time', repeating: 'repeat' };
  var STATUS_TO_API = { done: 'done', not_done: 'not_done' };

  function weekdaysToMask(days) { return (days || []).reduce(function (m, d) { return m | (1 << d); }, 0); }
  function maskToWeekdays(mask) { var out = []; for (var d = 0; d < 7; d++) if (mask & (1 << d)) out.push(d); return out; }

  function recurrenceToApi(rec, allowNone) {
    var mode = rec && rec.mode;
    if (!mode) return allowNone ? { rec_mode: 'none', rec_interval: 1, rec_weekdays: 0 } : { rec_mode: 'interval', rec_interval: 1, rec_weekdays: 0 };
    return { rec_mode: mode, rec_interval: Math.max(1, Number(rec.interval) || 1), rec_weekdays: weekdaysToMask(rec.weekdays) };
  }
  function recurrenceFromApi(row) {
    return { mode: row.rec_mode === 'none' ? null : row.rec_mode, interval: row.rec_interval, weekdays: maskToWeekdays(row.rec_weekdays) };
  }
  function reminderToApi(n) {
    var type = NOTIF_TO_API[n && n.type] || 'none';
    return {
      reminder_type: type,
      reminder_time: type === 'none' ? null : (n.time || '09:00'),
      reminder_every_hours: type === 'repeating' ? Math.min(24, Math.max(1, Number(n.repeatHours) || 1)) : null,
      reminder_text: (n && n.text) || '',
    };
  }
  function reminderFromApi(row) {
    return {
      type: NOTIF_FROM_API[row.reminder_type] || null,
      time: row.reminder_time ? row.reminder_time.slice(0, 5) : '09:00',
      repeatHours: row.reminder_every_hours || 1,
      text: row.reminder_text || '',
    };
  }
  function datesToApi(item) {
    var range = item.timeMode === 'range' && item.endDate && item.endDate > item.date;
    return { start_date: item.date, end_date: range ? item.endDate : null };
  }

  // ── loading ──────────────────────────────────────────────────────────
  async function loadAll() {
    resetCaches();
    var me = await request('GET', '/me');
    var sync = await request('GET', '/planning/sync');
    meVersions = { profile: me.profile.version, settings: me.settings.version };
    avatarFileId = me.profile.avatar_file_id;

    var catNames = {};
    sync.categories.forEach(function (c) { categories[c.name] = c.id; catNames[c.id] = c.name; versions['categories:' + c.id] = c.version; });

    var occ = {};
    sync.task_occurrences.forEach(function (o) {
      if (o.status === 'pending') return;
      (occ[o.task_id] = occ[o.task_id] || {})[o.occurrence_date] = o.status;
      statuses[o.task_id + '|' + o.occurrence_date] = o.status;
    });
    var photosByTask = {};
    sync.task_attachments.forEach(function (a) {
      if (a.deleted_at) return;
      (photosByTask[a.task_id] = photosByTask[a.task_id] || []).push(a.file_id);
      (attachments[a.task_id] = attachments[a.task_id] || {})[a.file_id] = true;
    });

    function oneOffState(row) {
      var st = (occ[row.id] || {})[row.start_date];
      return { done: st === 'done', skipped: st === 'not_done' };
    }

    var byParent = {};
    sync.tasks.forEach(function (row) {
      versions['tasks:' + row.id] = row.version;
      if (row.parent_id) (byParent[row.parent_id] = byParent[row.parent_id] || []).push(row);
    });

    var tasks = sync.tasks.filter(function (r) { return !r.parent_id; }).map(function (row) {
      var recurrence = recurrenceFromApi(row);
      var subs = (byParent[row.id] || []).sort(function (a, b) { return a.sort_order - b.sort_order; });
      children[row.id] = subs.map(function (s) { return s.id; });
      return Object.assign({
        id: row.id, title: row.title, category: catNames[row.category_id] || '', description: row.description || '',
        photos: [], photoFileIds: photosByTask[row.id] || [], pinned: row.pinned,
        timeMode: row.end_date ? 'range' : 'single', date: row.start_date, endDate: row.end_date,
        recurrence: recurrence, notification: reminderFromApi(row),
        statusByDate: recurrence.mode ? Object.assign({}, occ[row.id] || {}) : {},
        subtasks: subs.map(function (s) {
          return Object.assign({
            id: s.id, title: s.title, text: s.title, description: s.description || '',
            photos: [], photoFileIds: photosByTask[s.id] || [],
            timeMode: s.end_date ? 'range' : 'single', date: s.start_date, endDate: s.end_date,
            notification: reminderFromApi(s),
          }, oneOffState(s));
        }),
      }, recurrence.mode ? { done: false, skipped: false } : oneOffState(row));
    });

    var logs = {};
    sync.habit_logs.forEach(function (l) {
      statuses['habit:' + l.habit_id + '|' + l.log_date] = l.status;
      if (l.status !== 'pending') (logs[l.habit_id] = logs[l.habit_id] || []).push(l);
    });
    var habits = sync.habits.map(function (row) {
      versions['habits:' + row.id] = row.version;
      var own = logs[row.id] || [];
      return {
        id: row.id, title: row.title, startDate: row.start_date,
        recurrence: recurrenceFromApi(row), notification: reminderFromApi(row),
        completedDates: own.filter(function (l) { return l.status === 'done'; }).map(function (l) { return l.log_date; }),
        skippedDates: own.filter(function (l) { return l.status === 'skipped'; }).map(function (l) { return l.log_date; }),
      };
    });

    var events = sync.events.map(function (row) {
      versions['events:' + row.id] = row.version;
      return {
        id: row.id, title: row.title, timeMode: row.end_date ? 'range' : 'single', date: row.start_date, endDate: row.end_date,
        recurrence: recurrenceFromApi(row), notification: reminderFromApi(row),
      };
    });

    var p = me.profile, st = me.settings;
    var enabled = st.calendars_enabled || [];
    var planning = (me.modules || []).filter(function (m) { return m.key === 'planning'; })[0];
    loadPhotosInBackground(tasks);
    return {
      profile: {
        firstName: p.first_name, lastName: p.last_name, username: p.username || '', email: p.email,
        phone: p.phone || '', gender: p.gender || '', dob: p.birth_date || '', photo: null, userId: 'TJ-' + p.public_id,
        name: (p.first_name + ' ' + p.last_name).trim(),
      },
      settings: {
        notifications: st.notifications_enabled, weekStartDay: st.week_start, showAddMenuLabels: st.show_add_menu_labels,
        language: st.language, calendarSystem: st.calendar_primary,
        calendarEnabled: { gregorian: enabled.indexOf('gregorian') >= 0, jalali: enabled.indexOf('jalali') >= 0, hijri: enabled.indexOf('hijri') >= 0 },
        planningEnabled: planning ? planning.enabled : true,
        theme: st.theme, palette: st.palette || 'toojibee',
        prefs: prefsFromApi(st.preferences || {}),
      },
      tasks: tasks, habits: habits, events: events,
    };
  }

  /* Files are private (served only with the owner's token), so they are
     fetched as blobs and shown through object URLs. */
  async function fileUrl(fileId) {
    var res = await request('GET', '/files/' + fileId, undefined, { raw: true });
    if (!res.ok) return null;
    var url = URL.createObjectURL(await res.blob());
    photoFiles[url] = fileId;
    return url;
  }
  function loadPhotosInBackground(tasks) {
    var all = [];
    tasks.forEach(function (t) { all.push(t); (t.subtasks || []).forEach(function (s) { all.push(s); }); });
    all.forEach(function (item) {
      (item.photoFileIds || []).forEach(function (fileId) {
        fileUrl(fileId).then(function (url) {
          if (url && api.onPhotoLoaded) api.onPhotoLoaded(item.id, url);
        });
      });
    });
    if (avatarFileId) fileUrl(avatarFileId).then(function (url) {
      if (url && api.onAvatarLoaded) api.onAvatarLoaded(url);
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(','), mime = /data:([^;]+)/.exec(parts[0])[1], bin = atob(parts[1]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function uploadPhoto(photo, module) {
    if (photoFiles[photo]) return photoFiles[photo];
    var form = new FormData();
    form.append('file', dataUrlToBlob(photo), 'photo');
    form.append('module', module);
    var res = await request('POST', '/files', form);
    photoFiles[photo] = res.id;
    return res.id;
  }

  // ── saving ───────────────────────────────────────────────────────────
  async function ensureCategory(name) {
    name = (name || '').trim();
    if (!name) return null;
    if (!categories[name]) {
      var id = uuid();
      var row = await putVersioned('categories', id, { name: name });
      categories[name] = row.id;
    }
    return categories[name];
  }

  async function syncStatus(taskId, date, status) {
    var key = taskId + '|' + date;
    var want = STATUS_TO_API[status] || 'pending';
    if ((statuses[key] || 'pending') === want) return;
    await request('PUT', '/planning/tasks/' + taskId + '/occurrences/' + date, { status: want });
    statuses[key] = want;
  }

  async function syncPhotos(taskId, photos) {
    var wanted = {};
    for (var i = 0; i < (photos || []).length; i++) wanted[await uploadPhoto(photos[i], 'planning')] = true;
    var current = attachments[taskId] || {};
    for (var fileId in wanted) {
      if (!current[fileId]) await request('PUT', '/planning/tasks/' + taskId + '/attachments/' + fileId);
    }
    for (var old in current) {
      if (!wanted[old]) await request('DELETE', '/planning/tasks/' + taskId + '/attachments/' + old);
    }
    attachments[taskId] = wanted;
  }

  function saveTask(task) {
    return enqueue('task:' + task.id, async function () {
      var categoryId = await ensureCategory(task.category);
      await putVersioned('tasks', task.id, Object.assign({
        parent_id: null, category_id: categoryId, title: task.title, description: task.description || '',
        pinned: !!task.pinned,
      }, datesToApi(task), recurrenceToApi(task.recurrence, true), reminderToApi(task.notification)));

      if (task.recurrence && task.recurrence.mode) {
        var byDate = task.statusByDate || {};
        var known = {};
        Object.keys(statuses).forEach(function (k) { if (k.indexOf(task.id + '|') === 0) known[k.split('|')[1]] = true; });
        Object.keys(byDate).forEach(function (d) { known[d] = true; });
        for (var d in known) await syncStatus(task.id, d, byDate[d]);
      } else {
        await syncStatus(task.id, task.date, task.done ? 'done' : task.skipped ? 'not_done' : null);
      }
      await syncPhotos(task.id, task.photos);

      var subs = task.subtasks || [];
      for (var i = 0; i < subs.length; i++) {
        var s = subs[i];
        var title = s.title || s.text || '';
        await putVersioned('tasks', s.id, Object.assign({
          parent_id: task.id, title: title, description: s.description || '', sort_order: i,
        }, datesToApi({ timeMode: s.timeMode, date: s.date || task.date, endDate: s.endDate }), { rec_mode: 'none' }, reminderToApi(s.notification)));
        await syncStatus(s.id, s.date || task.date, s.done ? 'done' : s.skipped ? 'not_done' : null);
        await syncPhotos(s.id, s.photos);
      }
      var keep = subs.map(function (s) { return s.id; });
      var gone = (children[task.id] || []).filter(function (id) { return keep.indexOf(id) < 0; });
      for (var j = 0; j < gone.length; j++) await request('DELETE', '/planning/tasks/' + gone[j]).catch(function () {});
      children[task.id] = keep;
    });
  }

  function deleteTask(id) {
    return enqueue('task:' + id, function () { return request('DELETE', '/planning/tasks/' + id); });
  }

  function saveHabit(habit) {
    return enqueue('habit:' + habit.id, async function () {
      await putVersioned('habits', habit.id, Object.assign({ title: habit.title, start_date: habit.startDate },
        recurrenceToApi(habit.recurrence, false), reminderToApi(habit.notification)));
      var want = {};
      (habit.completedDates || []).forEach(function (d) { want[d] = 'done'; });
      (habit.skippedDates || []).forEach(function (d) { want[d] = 'skipped'; });
      var prefix = 'habit:' + habit.id + '|';
      var dates = {};
      Object.keys(statuses).forEach(function (k) { if (k.indexOf(prefix) === 0) dates[k.slice(prefix.length)] = true; });
      Object.keys(want).forEach(function (d) { dates[d] = true; });
      for (var d in dates) {
        var status = want[d] || 'pending';
        if ((statuses[prefix + d] || 'pending') === status) continue;
        await request('PUT', '/planning/habits/' + habit.id + '/logs/' + d, { status: status });
        statuses[prefix + d] = status;
      }
    });
  }

  function deleteHabit(id) {
    return enqueue('habit:' + id, function () { return request('DELETE', '/planning/habits/' + id); });
  }

  function saveEvent(evt) {
    return enqueue('event:' + evt.id, function () {
      return putVersioned('events', evt.id, Object.assign({ title: evt.title, all_day: true },
        datesToApi(evt), recurrenceToApi(evt.recurrence, true), reminderToApi(evt.notification)));
    });
  }

  function deleteEvent(id) {
    return enqueue('event:' + id, function () { return request('DELETE', '/planning/events/' + id); });
  }

  function saveProfile(profile) {
    return enqueue('profile', async function () {
      var body = {
        first_name: profile.firstName || '', last_name: profile.lastName || '', username: profile.username || null,
        phone: profile.phone || null, gender: profile.gender || null, birth_date: profile.dob || null,
      };
      var send = function (v) { return request('PATCH', '/me/profile', Object.assign({ version: v }, body)); };
      var row;
      try { row = await send(meVersions.profile); }
      catch (e) { if (e.status !== 409) throw e; row = await send(e.body.current.version); }
      meVersions.profile = row.version;

      if (profile.photo && !photoFiles[profile.photo] && profile.photo.indexOf('data:') === 0) {
        var form = new FormData();
        form.append('file', dataUrlToBlob(profile.photo), 'avatar');
        var res = await request('POST', '/me/avatar', form);
        avatarFileId = res.avatar_file_id;
        photoFiles[profile.photo] = avatarFileId;
      } else if (!profile.photo && avatarFileId) {
        await request('DELETE', '/me/avatar');
        avatarFileId = null;
      }
    });
  }

  /* settings.preferences (snake_case, backend) <-> state.settings.prefs
     (camelCase): planning_day_summary <-> planningDaySummary. */
  function prefsFromApi(p) {
    var out = {};
    Object.keys(p).forEach(function (k) { out[k.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); })] = p[k]; });
    return out;
  }
  function prefsToApi(p) {
    var out = {};
    Object.keys(p).forEach(function (k) { out[k.replace(/[A-Z]/g, function (c) { return '_' + c.toLowerCase(); })] = !!p[k]; });
    return out;
  }

  function saveSettings(s) {
    return enqueue('settings', async function () {
      var cal = s.calendarEnabled || {};
      var enabled = ['jalali', 'gregorian', 'hijri'].filter(function (k) { return cal[k] !== false; });
      if (enabled.indexOf(s.calendarSystem) < 0) enabled.push(s.calendarSystem);
      var body = {
        language: s.language, calendar_primary: s.calendarSystem, calendars_enabled: enabled,
        week_start: s.weekStartDay, notifications_enabled: !!s.notifications, show_add_menu_labels: !!s.showAddMenuLabels,
        palette: s.palette || 'toojibee', preferences: prefsToApi(s.prefs || {}),
      };
      if (s.theme === 'light' || s.theme === 'dark') body.theme = s.theme;
      var send = function (v) { return request('PATCH', '/me/settings', Object.assign({ version: v }, body)); };
      var row;
      try { row = await send(meVersions.settings); }
      catch (e) { if (e.status !== 409) throw e; row = await send(e.body.current.version); }
      meVersions.settings = row.version;
      if (typeof s.planningEnabled === 'boolean') await request('PATCH', '/me/modules/planning', { enabled: s.planningEnabled });
    });
  }

  // ── connections ──────────────────────────────────────────────────────
  function searchUser(q) {
    return request('GET', '/social/search?q=' + encodeURIComponent(q)).then(function (rows) {
      return rows.map(function (r) { return { id: r.id, name: r.name, username: r.username, userId: 'TJ-' + r.public_id }; });
    });
  }
  function sendConnectionRequest(id) { return request('POST', '/social/connections/' + id + '/request'); }
  function respondConnectionRequest(id, accept) { return request('POST', '/social/connections/' + id + '/respond', { accept: !!accept }); }
  function removeConnection(id) { return request('DELETE', '/social/connections/' + id); }
  function blockUser(id) { return request('PUT', '/social/blocks/' + id); }
  function unblockUser(id) { return request('DELETE', '/social/blocks/' + id); }
  function listConnections() {
    return request('GET', '/social/connections').then(function (rows) {
      return rows.map(function (r) { return { id: r.id, name: r.name, phone: '', status: r.status }; });
    });
  }

  // ── public calendar data ─────────────────────────────────────────────
  function calendarYear(jalaliYear) { return request('GET', '/calendar/occasions?year=' + jalaliYear, undefined, { auth: false }); }

  Object.assign(api, {
    uuid: uuid, isConfigured: isConfigured, hasSession: hasSession,
    signUp: signUp, signIn: signIn, signInWithGoogle: signInWithGoogle, consumeOAuthRedirect: consumeOAuthRedirect, signOut: signOut,
    authProviders: authProviders, forgotPassword: forgotPassword, resetPassword: resetPassword, verifyEmail: verifyEmail, takeEmailLink: takeEmailLink,
    loadAll: loadAll,
    saveTask: saveTask, deleteTask: deleteTask, saveHabit: saveHabit, deleteHabit: deleteHabit,
    saveEvent: saveEvent, deleteEvent: deleteEvent, saveProfile: saveProfile, saveSettings: saveSettings,
    searchUser: searchUser, sendConnectionRequest: sendConnectionRequest, respondConnectionRequest: respondConnectionRequest,
    removeConnection: removeConnection, blockUser: blockUser, unblockUser: unblockUser, listConnections: listConnections,
    calendarYear: calendarYear,
  });
  global.Cloud = api;
})(window);
