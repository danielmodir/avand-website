/* ============ REMINDERS — step 1: in the browser ============
   Every half minute (and whenever the app comes back to the front) this
   works out which reminders of today are due and shows them:
   - "at a time": once, at that time;
   - "every N hours": from the item's start time (else the reminder time),
     every N hours until the end of the day — only while it isn't done;
   - "N minutes before": before an event's start time;
   - overdue (Settings): once, when a task's time runs out un-ticked.
   A system notification (through sw.js) when the browser allows it, and
   an in-app toast while the app is on screen. Nothing leaves the device.
   Reminders that came due while the app was closed show up when it's
   next opened (within 12 hours, today only), grouped if there are many.
   Step 2 (Web Push, for a closed app) is at the end of this file. */
const NOTIFIED_KEY = 'toojibee-notified-v1';
const NOTIFY_CATCHUP_MS = 12 * 3600 * 1000;
let notifyReg = null, notifyTimer = null;

function notifySupported(){ return 'Notification' in window; }
function notifyAllowed(){ return notifySupported() && Notification.permission === 'granted'; }

async function registerReminderWorker(){
  if(notifyReg || !('serviceWorker' in navigator)) return notifyReg;
  try{ notifyReg = await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }); }
  catch(e){ notifyReg = null; } // e.g. not served over https: plain notifications then
  return notifyReg;
}

/* Asked once, from a tap (the browser requires that): turning reminders
   on in Settings, or confirming a reminder on an item. */
function askNotificationPermission(){
  if(!notifySupported() || Notification.permission !== 'default') return Promise.resolve(notifySupported() ? Notification.permission : 'unsupported');
  return Notification.requestPermission().then(p => {
    if(p === 'granted') registerReminderWorker().then(() => { if(state.settings.notifications) enablePush(); });
    return p;
  });
}

function loadNotified(){ try{ return JSON.parse(localStorage.getItem(NOTIFIED_KEY)) || {}; }catch(e){ return {}; } }
function saveNotified(map){
  const cut = Date.now() - 3 * 86400000;
  Object.keys(map).forEach(k => { if(map[k] < cut) delete map[k]; });
  try{ localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map)); }catch(e){ /* private mode: may repeat once */ }
}

function atTimeOn(day, hm){
  const [h, m] = String(hm || '').split(':').map(Number);
  if(isNaN(h)) return null;
  const d = new Date(day); d.setHours(h, m || 0, 0, 0);
  return d.getTime();
}

/* Every reminder slot of `day`: { slot, kind, id, title, body, at }. */
function reminderSlots(day){
  const key = dateKey(day);
  const out = [];
  const push = (kind, item, type, at, body) => { if(at != null) out.push({ slot: `${type}|${kind}|${item.id}|${key}|${at}`, kind, id: item.id, date: key, title: item.title, body, at, item }); };
  const forItem = (kind, item, done) => {
    const n = item.notification || {};
    if(!n.type || done) return;
    const text = n.text || '';
    if(n.type === 'time') push(kind, item, 'time', atTimeOn(day, n.time), text || dig(n.time));
    if(n.type === 'repeat'){
      const start = atTimeOn(day, item.startTime || n.time);
      const step = Math.max(1, Number(n.repeatHours) || 1) * 3600000;
      const end = new Date(day).setHours(24, 0, 0, 0);
      for(let at = start; at != null && at < end; at += step) push(kind, item, 'repeat', at, text || t('notifRepeatBody'));
    }
    if(n.type === 'before' && item.startTime){
      const at = atTimeOn(day, item.startTime) - Math.max(1, Number(n.minutesBefore) || 15) * 60000;
      push(kind, item, 'before', at, text || t('notifStartsAt').replace('{t}', dig(item.startTime)));
    }
  };
  state.tasks.filter(x => occursOnDate(x, day)).forEach(x => forItem('task', x, taskStatusOn(x, key) === 'done'));
  state.habits.filter(h => habitOccursOnDate(h, day)).forEach(h => forItem('habit', h, h.completedDates.includes(key)));
  state.events.filter(e => occursOnDate(e, day)).forEach(e => forItem('event', e, false));
  return out;
}

/* Tasks that ran out un-ticked: today's at the moment their time passed,
   yesterday's (a day-only deadline) at 9 in the morning. */
function overdueSlots(day){
  if(!pref('notifyOverdue')) return [];
  const out = [];
  const todayKey = dateKey(day), yesterday = addDays(day, -1), yKey = dateKey(yesterday);
  const explicit = (task, key) => isRecurringTask(task) ? task.statusByDate?.[key] : (task.done || task.skipped);
  const add = (task, key, at) => out.push({ slot: `overdue|task|${task.id}|${key}`, kind: 'task', id: task.id, date: key,
    title: t('notifOverdueTitle').replace('{title}', task.title), body: t('notifOverdueBody'), at, item: task });
  state.tasks.forEach(task => {
    if(occursOnDate(task, day) && !explicit(task, todayKey) && taskOverdue(task, todayKey)){
      const hm = task.endTime || task.startTime;
      if(hm) add(task, todayKey, atTimeOn(day, hm));
    }
    if(occursOnDate(task, yesterday) && !explicit(task, yKey) && taskOverdue(task, yKey) && !(task.endTime || task.startTime)){
      const deadline = isRecurringTask(task) ? yKey : (task.timeMode === 'range' && task.endDate ? task.endDate : task.date);
      if(deadline === yKey) add(task, yKey, atTimeOn(day, '09:00'));
    }
  });
  return out;
}

function reminderBody(r){
  if(!r.kind) return r.body;
  const kindLabel = t(r.kind === 'event' ? 'searchEvent' : r.kind === 'habit' ? 'habit' : 'task');
  return `${kindLabel} · ${r.body}`;
}

function showReminder(r, missed){
  const body = (missed ? t('notifMissedPrefix') + ' · ' : '') + reminderBody(r);
  const opts = { body, tag: r.slot, lang: lang(), dir: lang() === 'fa' ? 'rtl' : 'ltr', icon: '../assets/icons/icon-192.png?v=tj4',
    badge: '../assets/icons/favicon-48.png?v=tj4', data: { kind: r.kind, id: r.id, date: r.date } };
  if(notifyAllowed()){
    if(notifyReg) notifyReg.showNotification(r.title, opts).catch(() => {});
    else try{ const n = new Notification(r.title, opts); n.onclick = () => { window.focus(); openReminderTarget(opts.data); }; }catch(e){ /* phones need sw.js */ }
  }
  if(!document.hidden) showToast(`🔔 ${r.title}`);
}

async function reminderTick(){
  if(!state.settings.notifications || state.guest || state.booting) return;
  const now = Date.now();
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const fired = loadNotified();
  // Already shown by sw.js from a push while the app was closed.
  (await shownByWorker()).forEach(slot => { if(!fired[slot]) fired[slot] = now; });
  const due = reminderSlots(day).concat(overdueSlots(day))
    .filter(r => r.at <= now && now - r.at < NOTIFY_CATCHUP_MS && !fired[r.slot]);
  syncPushSchedule(false);
  if(!due.length){ saveNotified(fired); return; }
  due.forEach(r => { fired[r.slot] = now; });
  saveNotified(fired);
  // "Every N hours": a long absence shouldn't fire every missed hour — the latest only.
  const latest = new Map();
  due.forEach(r => { const k = r.slot.split('|').slice(0, 3).join('|'); if(!latest.has(k) || latest.get(k).at < r.at) latest.set(k, r); });
  const list = [...latest.values()].sort((a, b) => a.at - b.at);
  const fresh = list.filter(r => now - r.at < 120000), missed = list.filter(r => now - r.at >= 120000);
  fresh.forEach(r => showReminder(r, false));
  if(missed.length <= 2) missed.forEach(r => showReminder(r, true));
  else showReminder({ slot: 'missed|' + dateKey(day) + '|' + now, kind: '', id: '', date: dateKey(day),
    title: t('notifMissedTitle').replace('{n}', dig(missed.length)), body: missed.map(r => r.item.title).slice(0, 4).join('، ') }, false);
}

/* From a tapped notification (sw.js message, or #reminder= when the app
   had to be opened): that day, and the item's details. */
function openReminderTarget(d){
  if(!d) return;
  if(d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date)){
    const day = parseDateKey(d.date);
    state.homeDate = day; state.selectedDate = day; state.calCursor = new Date(day);
    state.menuPanelOpen = false; state.calFull = false;
    render();
  }
  if(d.kind && d.id && findItem(d.kind, d.id)) openItemDetails(d.kind, d.id, null);
}

function startReminders(){
  if(notifyAllowed()) registerReminderWorker().then(() => { if(state.settings.notifications) enablePush(); });
  clearInterval(notifyTimer);
  notifyTimer = setInterval(reminderTick, 30000);
  setTimeout(reminderTick, 1500); // right after opening: anything that came due meanwhile
}

if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', e => {
    if(!e.data) return;
    if(e.data.type === 'open-reminder') openReminderTarget(e.data);
    if(e.data.type === 'push-reminder') reminderTick(); // the app is on screen: it shows it itself
  });
}
document.addEventListener('visibilitychange', () => {
  if(!document.hidden) reminderTick();
  else syncPushSchedule(false); // leaving the app: the server gets the latest list
});

/* The app was opened from a notification while it was closed. */
function takeReminderFromLink(){
  const m = /[#&]reminder=([^&]+)/.exec(location.hash);
  if(!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const [kind, id, date] = decodeURIComponent(m[1]).split('|');
  setTimeout(() => openReminderTarget({ kind, id, date }), 300);
}

/* ============ REMINDERS — step 2: Web Push ============
   For a closed app. With an account, reminders on, and the browser's
   permission, this browser subscribes to push (its address goes to our
   server: POST /notifications/subscriptions) and the app sends the server
   its reminders for the next PUSH_DAYS days, worked out by the same code
   as above (PUT /notifications/schedule). The server's cron sends each one
   when it's due; sw.js shows it. The list is re-sent whenever it changes
   (checked with every tick and when the app is left), and at least every
   few hours so it keeps reaching ahead. Reminders sw.js already showed
   aren't shown again when the app opens (shownByWorker). */
const PUSH_KEY = 'toojibee-push-v1';
const PUSH_DAYS = 7;
const PUSH_REFRESH_MS = 6 * 3600 * 1000;
const SHOWN_CACHE = 'tj-shown-v1';
let pushBusy = false;

function pushPossible(){
  return typeof REAL_LOGIN_DISABLED !== 'undefined' && !REAL_LOGIN_DISABLED && Cloud.hasSession() && !!Cloud.pushKey
    && 'PushManager' in window && 'serviceWorker' in navigator && notifyAllowed();
}
function loadPush(){ try{ return JSON.parse(localStorage.getItem(PUSH_KEY)) || {}; }catch(e){ return {}; } }
function savePush(p){ try{ localStorage.setItem(PUSH_KEY, JSON.stringify(p)); }catch(e){} }

function b64uBytes(s){
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

/* Subscribe this browser (or re-send an existing subscription: its
   address can change, and the account on this device may be new). */
async function enablePush(){
  if(pushBusy || !pushPossible()) return false;
  pushBusy = true;
  try{
    const reg = await registerReminderWorker();
    if(!reg) return false;
    await navigator.serviceWorker.ready;
    const key = await Cloud.pushKey();
    let sub = await reg.pushManager.getSubscription();
    // Made with another server key (keys never change, but just in case): start over.
    const k = sub && sub.options && sub.options.applicationServerKey;
    if(sub && k && btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key){
      await sub.unsubscribe(); sub = null;
    }
    if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key) });
    const json = sub.toJSON();
    const p = loadPush();
    const owner = state.profile?.userId || '';
    if(p.endpoint !== json.endpoint || p.owner !== owner || !p.id){
      const id = await Cloud.pushSubscribe(json);
      savePush({ id, endpoint: json.endpoint, owner, sent: '' , sentAt: 0 });
    }
    pushBusy = false;
    await syncPushSchedule(true);
    return true;
  }catch(e){
    return false; // no push service reachable, blocked, … : step 1 still works while the app is open
  }finally{ pushBusy = false; }
}

/* Reminders off, or signing out: nothing more reaches this browser. The
   server is told first (the request leaves before the session is gone). */
function disablePush(){
  const p = loadPush();
  savePush({});
  try{
    if(p.id && Cloud.pushUnsubscribe) Cloud.pushUnsubscribe(p.id).catch(() => {});
    if(Cloud.pushSchedule && Cloud.hasSession()) Cloud.pushSchedule([]).catch(() => {});
  }catch(e){}
  if(notifyReg) notifyReg.pushManager.getSubscription().then(s => s && s.unsubscribe()).catch(() => {});
}

/* What would be overdue on `day` (ahead of time: taskOverdue() only knows
   the past). Same slots as overdueSlots(), so either side shows it once. */
function overdueAheadSlots(day){
  if(!pref('notifyOverdue')) return [];
  const key = dateKey(day), out = [];
  const explicit = task => isRecurringTask(task) ? task.statusByDate?.[key] : (task.done || task.skipped);
  state.tasks.forEach(task => {
    if(!occursOnDate(task, day) || explicit(task)) return;
    const deadline = isRecurringTask(task) ? key : (task.timeMode === 'range' && task.endDate ? task.endDate : task.date);
    if(deadline !== key) return;
    const hm = task.endTime || task.startTime;
    const at = hm ? atTimeOn(day, hm) : atTimeOn(addDays(day, 1), '09:00');
    out.push({ slot: `overdue|task|${task.id}|${key}`, kind: 'task', id: task.id, date: key,
      title: t('notifOverdueTitle').replace('{title}', task.title), body: t('notifOverdueBody'), at });
  });
  return out;
}

function pushScheduleItems(){
  const now = Date.now();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const items = [];
  for(let i = -1; i < PUSH_DAYS; i++){ // -1: yesterday's day-only deadlines come due this morning
    const day = addDays(today, i);
    const list = (i < 0 ? [] : reminderSlots(day)).concat(overdueAheadSlots(day));
    list.forEach(r => { if(r.at > now - 60000) items.push({ slot: r.slot, at: r.at, title: r.title, body: reminderBody(r), kind: r.kind, id: r.id, date: r.date }); });
  }
  return items.sort((a, b) => a.at - b.at).slice(0, 400);
}

/* Send the list when it changed, or when the last one is getting old. */
async function syncPushSchedule(force){
  if(!state.settings.notifications || state.guest || state.booting || !pushPossible()) return;
  const p = loadPush();
  if(!p.id) return;
  const items = pushScheduleItems();
  const sig = JSON.stringify(items.map(i => [i.slot, i.title, i.body]));
  if(!force && sig === p.sent && Date.now() - (p.sentAt || 0) < PUSH_REFRESH_MS) return;
  try{
    await Cloud.pushSchedule(items);
    savePush(Object.assign(loadPush(), { sent: sig, sentAt: Date.now() }));
  }catch(e){ /* offline: next tick tries again */ }
}

/* Slots sw.js showed from a push (kept in Cache Storage, which both sides
   can read); entries older than three days are dropped here. */
async function shownByWorker(){
  if(!('caches' in window)) return [];
  try{
    const cache = await caches.open(SHOWN_CACHE);
    const out = [];
    for(const req of await cache.keys()){
      const res = await cache.match(req);
      const at = Number(res ? await res.text() : 0);
      if(Date.now() - at > 3 * 86400000){ cache.delete(req); continue; }
      out.push(decodeURIComponent(new URL(req.url).pathname.split('/').pop()));
    }
    return out;
  }catch(e){ return []; }
}
