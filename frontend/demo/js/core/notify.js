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
   Step 2 (Web Push from the server, for a closed app) comes later. */
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
  return Notification.requestPermission().then(p => { if(p === 'granted') registerReminderWorker(); return p; });
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

function showReminder(r, missed){
  const kindLabel = t(r.kind === 'event' ? 'searchEvent' : r.kind === 'habit' ? 'habit' : 'task');
  const body = (missed ? t('notifMissedPrefix') + ' · ' : '') + `${kindLabel} · ${r.body}`;
  const opts = { body, tag: r.slot, lang: lang(), dir: lang() === 'fa' ? 'rtl' : 'ltr', icon: '../assets/icons/icon-192.png',
    badge: '../assets/icons/favicon-48.png', data: { kind: r.kind, id: r.id, date: r.date } };
  if(notifyAllowed()){
    if(notifyReg) notifyReg.showNotification(r.title, opts).catch(() => {});
    else try{ const n = new Notification(r.title, opts); n.onclick = () => { window.focus(); openReminderTarget(opts.data); }; }catch(e){ /* phones need sw.js */ }
  }
  if(!document.hidden) showToast(`🔔 ${r.title}`);
}

function reminderTick(){
  if(!state.settings.notifications || state.guest || state.booting) return;
  const now = Date.now();
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const fired = loadNotified();
  const due = reminderSlots(day).concat(overdueSlots(day))
    .filter(r => r.at <= now && now - r.at < NOTIFY_CATCHUP_MS && !fired[r.slot]);
  if(!due.length) return;
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
  if(notifyAllowed()) registerReminderWorker();
  clearInterval(notifyTimer);
  notifyTimer = setInterval(reminderTick, 30000);
  setTimeout(reminderTick, 1500); // right after opening: anything that came due meanwhile
}

if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', e => { if(e.data && e.data.type === 'open-reminder') openReminderTarget(e.data); });
}
document.addEventListener('visibilitychange', () => { if(!document.hidden) reminderTick(); });

/* The app was opened from a notification while it was closed. */
function takeReminderFromLink(){
  const m = /[#&]reminder=([^&]+)/.exec(location.hash);
  if(!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const [kind, id, date] = decodeURIComponent(m[1]).split('|');
  setTimeout(() => openReminderTarget({ kind, id, date }), 300);
}
