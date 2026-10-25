/* ============ HABIT COUNTER / TIMER ============
   A habit can count (free, or up to a target: "8 glasses of water") or
   time itself (a stopwatch, or a countdown from N minutes). Set in the
   habit form (popup.js); used from the habit's row (items.js).
     habit.tracker  = { kind:'counter', target:N|null }
                    | { kind:'timer', mode:'up'|'down', minutes:N|null }
     habit.progress = { 'YYYY-MM-DD': count, or seconds }
   The day is ticked by itself when it's reached: the target (a free
   counter: once), the countdown's end, or a minute on the stopwatch.
   A running timer belongs to this device (localStorage), so it survives a
   reload; the time it adds is saved when it stops. A group's habit keeps
   each person's own count on their device and shares only the tick. */
const TIMERS_KEY = 'toojibee-timers-v1';
const GROUP_PROGRESS_KEY = 'toojibee-group-progress-v1';
const COUNTER_MAX_TARGET = 999, TIMER_MAX_MINUTES = 600;

function habitTracker(h){
  const t = h && h.tracker;
  return t && (t.kind === 'counter' || (t.kind === 'timer' && (t.mode === 'up' || t.mode === 'down'))) ? t : null;
}

function readJson(key){ try{ return JSON.parse(localStorage.getItem(key) || '{}') || {}; }catch(e){ return {}; } }
function writeJson(key, v){ try{ localStorage.setItem(key, JSON.stringify(v)); }catch(e){ /* storage full or blocked */ } }

/* The day -> value map (a group's habit: this person's, on this device). */
function habitProgressMap(h){
  if(!h.groupId) return (h.progress = h.progress || {});
  const all = readJson(GROUP_PROGRESS_KEY), who = state.profile.userId || '';
  return ((all[who] = all[who] || {})[h.id] = all[who][h.id] || {});
}
function setHabitProgress(h, day, v){
  if(!h.groupId){ h.progress = Object.assign({}, h.progress, { [day]: v }); if(!v) delete h.progress[day]; return; }
  const all = readJson(GROUP_PROGRESS_KEY), who = state.profile.userId || '';
  all[who] = all[who] || {}; all[who][h.id] = Object.assign({}, all[who][h.id], { [day]: v });
  if(!v) delete all[who][h.id][day];
  writeJson(GROUP_PROGRESS_KEY, all);
}

function runningTimer(h){ const r = readJson(TIMERS_KEY)[h.id]; return r && r.since ? r : null; }
/* Counter: the count; timer: seconds so far (with the running part). */
function habitValue(h, day){
  let v = Number(habitProgressMap(h)[day]) || 0;
  const r = runningTimer(h);
  if(r && r.day === day) v += Math.max(0, (Date.now() - r.since) / 1000);
  return v;
}

function trackerReached(h, v){
  const t = habitTracker(h);
  if(!t) return false;
  if(t.kind === 'counter') return t.target ? v >= t.target : v >= 1;
  return t.mode === 'down' ? v >= (t.minutes || 1) * 60 : v >= 60;
}

/* "3/8", "3", "12:05" (stopwatch) or "07:55" left (countdown). */
function trackerLabel(h, day){
  const t = habitTracker(h), v = habitValue(h, day);
  if(!t) return '';
  if(t.kind === 'counter') return t.target ? `${dig(v)}/${dig(t.target)}` : dig(v);
  const s = t.mode === 'down' ? Math.max(0, (t.minutes || 1) * 60 - v) : v;
  return dig(clockText(Math.floor(s)));
}
function clockText(s){
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/* The tick follows the value: reached = done that day, else not. */
function syncTrackerTick(h, day){
  const done = trackerReached(h, habitValue(h, day));
  const has = h.completedDates.includes(day);
  if(done && !has){ h.completedDates.push(day); h.skippedDates = (h.skippedDates || []).filter(d => d !== day); }
  else if(!done && has) h.completedDates = h.completedDates.filter(d => d !== day);
  return done && !has; // just reached
}

function saveTrackedHabit(h, day){
  if(h.groupId) groupMarkHabit(h, day); else cloudSync(() => Cloud.saveHabit(h));
}

function trackerDayOk(day){
  if(day > dateKey(today)){ showToast(t('futureNotYet')); haptic(20); return false; }
  return true;
}

/* + / − on a counter. */
function habitCount(id, day, delta){
  const h = state.habits.find(x => x.id === id), tr = habitTracker(h);
  if(!tr || tr.kind !== 'counter' || !trackerDayOk(day)) return;
  const cur = habitValue(h, day);
  const next = Math.max(0, Math.min(tr.target || 99999, cur + delta));
  if(next === cur){ haptic(10); return; }
  setHabitProgress(h, day, next);
  if(syncTrackerTick(h, day)){ haptic(30); showToast(t('trackerReached')); } else haptic(8);
  saveTrackedHabit(h, day);
  paintTracker(h, day);
}

/* ▶ / ❚❚ on a timer. Starting on another day stops the old run first. */
function habitTimerToggle(id, day){
  const h = state.habits.find(x => x.id === id), tr = habitTracker(h);
  if(!tr || tr.kind !== 'timer' || !trackerDayOk(day)) return;
  const all = readJson(TIMERS_KEY), r = all[id];
  if(r){
    const v = habitValue(h, r.day);
    delete all[id]; writeJson(TIMERS_KEY, all);
    setHabitProgress(h, r.day, Math.round(v));
    const reached = syncTrackerTick(h, r.day);
    saveTrackedHabit(h, r.day);
    if(reached) showToast(t('trackerReached'));
    if(r.day === day){ paintTracker(h, day); return; }
  }
  if(tr.mode === 'down' && habitValue(h, day) >= (tr.minutes || 1) * 60) setHabitProgress(h, day, 0); // a finished countdown starts over
  all[id] = { day, since: Date.now() };
  writeJson(TIMERS_KEY, all);
  haptic(12);
  paintTracker(h, day);
  ensureTimerTicker();
}

/* Reset the day's count / time (the row's long-press menu). */
function habitTrackerReset(id, day){
  const h = state.habits.find(x => x.id === id);
  if(!habitTracker(h)) return;
  const all = readJson(TIMERS_KEY); if(all[id] && all[id].day === day){ delete all[id]; writeJson(TIMERS_KEY, all); }
  setHabitProgress(h, day, 0);
  syncTrackerTick(h, day);
  saveTrackedHabit(h, day);
  paintTracker(h, day);
}

function trackerHtml(h, day){
  const tr = habitTracker(h);
  if(!tr) return '';
  const id = escapeAttr(h.id);
  if(tr.kind === 'counter') return `<div class="habit-tracker" data-hid="${id}" data-day="${day}">
      <button type="button" class="ht-btn" data-action="habit-dec" data-id="${id}" data-date="${day}" aria-label="−">−</button>
      <span class="ht-value">${trackerLabel(h, day)}</span>
      <button type="button" class="ht-btn" data-action="habit-inc" data-id="${id}" data-date="${day}" aria-label="+">+</button>
    </div>`;
  const run = runningTimer(h);
  const on = !!run && run.day === day;
  return `<div class="habit-tracker ${on ? 'running' : ''}" data-hid="${id}" data-day="${day}">
      <span class="ht-value" dir="ltr">${trackerLabel(h, day)}</span>
      <button type="button" class="ht-btn ht-play" data-action="habit-timer" data-id="${id}" data-date="${day}" aria-label="${t(on ? 'trackerPause' : 'trackerStart')}">${on ? TRACKER_PAUSE : TRACKER_PLAY}</button>
    </div>`;
}
const TRACKER_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const TRACKER_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';

/* In place, no full render: the value, the play button and the tick. */
function paintTracker(h, day){
  document.querySelectorAll(`.habit-tracker[data-hid="${CSS.escape(h.id)}"][data-day="${day}"]`).forEach(el => {
    const fresh = document.createElement('div');
    fresh.innerHTML = trackerHtml(h, day);
    el.replaceWith(fresh.firstElementChild);
  });
  document.querySelectorAll(`.checkbox[data-action="toggle-habit"][data-id="${CSS.escape(h.id)}"][data-date="${day}"]`).forEach(cb => {
    const done = h.completedDates.includes(day), skipped = !done && (h.skippedDates || []).includes(day);
    paintCheckbox(cb, done, skipped);
  });
  updateDayStatsInPlace();
}

/* Once a second while a timer runs: its clock, and a countdown's end. */
let timerTicker = null;
function ensureTimerTicker(){
  if(timerTicker) return;
  timerTicker = setInterval(() => {
    const all = readJson(TIMERS_KEY), ids = Object.keys(all);
    if(!ids.length){ clearInterval(timerTicker); timerTicker = null; return; }
    ids.forEach(id => {
      const h = state.habits.find(x => x.id === id), r = all[id];
      if(!h || !habitTracker(h)) return; // not loaded (yet), or another account's
      const tr = habitTracker(h);
      if(tr.mode === 'down' && habitValue(h, r.day) >= (tr.minutes || 1) * 60){
        habitTimerToggle(id, r.day); // stops it, saves, ticks the day
        haptic(60);
        try{ if('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(h.title, { body: t('trackerDone') }); }catch(e){ /* no notifications here */ }
        return;
      }
      document.querySelectorAll(`.habit-tracker[data-hid="${CSS.escape(id)}"][data-day="${r.day}"] .ht-value`).forEach(v => { v.textContent = trackerLabel(h, r.day); });
    });
  }, 1000);
}

ensureTimerTicker(); // a timer left running before a reload keeps going

/* "8 times a day" / "Countdown, 20 minutes" for the habit's details. */
function trackerSummary(h){
  const tr = habitTracker(h);
  if(!tr) return '';
  if(tr.kind === 'counter') return tr.target ? t('trackerCounterTarget').replace('{n}', dig(tr.target)) : t('trackerCounterFree');
  return tr.mode === 'down' ? t('trackerCountdownN').replace('{n}', dig(tr.minutes || 1)) : t('trackerStopwatch');
}
