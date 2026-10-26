/* ============ INSIDE THE ANDROID APP ============
   The Android app (android/ in the repo) is this same web app in a
   WebView, with a small bridge, window.ToojibeeAndroid. Outside the app
   the bridge doesn't exist and nothing here does anything.
   The bridge gives what a WebView lacks and the app uses:
   - reminders as phone notifications, even with the app closed and
     offline (js/core/notify.js hands it the list of upcoming reminders);
   - navigator.share (the phone's share sheet) and copying to the
     clipboard;
   - the status/navigation bar colors, following the theme
     (applyAppearance in js/core/util.js). */
const androidApp = window.ToojibeeAndroid || null;

if(androidApp){
  if(!navigator.share){
    try{
      Object.defineProperty(navigator, 'share', { configurable: true, value: d => {
        d = d || {};
        androidApp.share(String(d.title || ''), [d.text, d.url].filter(Boolean).join('\n'));
        return Promise.resolve();
      } });
    }catch(e){ /* no share button then */ }
  }
  try{
    const clip = navigator.clipboard || {};
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: Object.assign(Object.create(clip), {
      writeText: text => { androidApp.copy(String(text)); return Promise.resolve(); },
    }) });
  }catch(e){ /* the WebView's own clipboard then */ }
}

/* Ticks made outside the app: «انجام شد» on a reminder's notification, or a
   tick on the planning widget. The phone keeps them in a queue
   (androidApp.takeActions) and hands them over here — to the open app, or
   to a hidden copy of the page it starts for a few seconds when the app is
   closed. Each one is applied the same way a tap on the checkbox applies
   it, saved, and sent to the server; without a connection it waits in the
   account's copy on the device (api-php.js) and goes up later.
   { kind: 'task'|'habit', id, date: 'YYYY-MM-DD', done: true|false }.
   Older APKs (1.0.0) don't have takeActions: nothing happens there. */
async function applyPhoneActions(){
  if(!androidApp || typeof androidApp.takeActions !== 'function') return;
  let list = [];
  try{ list = JSON.parse(androidApp.takeActions() || '[]'); }catch(e){ list = []; }
  let changed = false;
  list.forEach(a => {
    if(a.kind === 'task'){
      const task = state.tasks.find(x => x.id === a.id);
      if(!task) return;
      setTaskStatusOn(task, a.date, a.done ? 'done' : null);
      if(!isRecurringTask(task)) (task.subtasks || []).forEach(s => { s.done = !!a.done; s.skipped = false; });
      if(task.groupId) groupMarkTask(task, a.date); else cloudSync(() => Cloud.saveTask(task));
      changed = true;
    } else if(a.kind === 'habit'){
      const habit = state.habits.find(x => x.id === a.id);
      if(!habit) return;
      const i = habit.completedDates.indexOf(a.date);
      if(a.done && i < 0) habit.completedDates.push(a.date);
      else if(!a.done && i >= 0) habit.completedDates.splice(i, 1);
      habit.skippedDates = (habit.skippedDates || []).filter(d => d !== a.date);
      if(habit.groupId) groupMarkHabit(habit, a.date); else cloudSync(() => Cloud.saveHabit(habit));
      changed = true;
    }
  });
  if(changed){
    render();
    if(typeof saveLocalData === 'function' && REAL_LOGIN_DISABLED) saveLocalData();
    try{ if(Cloud.syncNow) await Cloud.syncNow(); }catch(e){ /* offline: kept on the device */ }
  }
  if(typeof androidApp.actionsApplied === 'function') androidApp.actionsApplied();
}

/* ============ HOME-SCREEN WIDGETS ============
   The phone draws the widgets itself (android/.../Widgets.kt); what they
   show is worked out here, by the app's own calendar, occasion, desk and
   period code, so a widget never disagrees with the app. Days ahead are
   included (dates for 60 days, months up to a year, the desk for a week,
   the period ring for 45 days), so the widgets stay right after midnight
   without the app being opened. Sent when it changes (after each render,
   at most every few seconds); APK 1.1+ (setWidgets).
   Colors are the app's theme colors, as #AARRGGBB. */
let widgetSent = '', widgetTimer = null;
function scheduleWidgetData(){
  if(!androidApp || typeof androidApp.setWidgets !== 'function' || state.booting) return;
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => {
    const send = () => {
      let json = '';
      try{ json = JSON.stringify(widgetData()); }catch(e){ return; }
      if(json === widgetSent) return;
      widgetSent = json;
      try{ androidApp.setWidgets(json); }catch(e){ widgetSent = ''; }
    };
    // When the phone has a moment, not in the middle of a tap or a scroll.
    if(window.requestIdleCallback) requestIdleCallback(send, { timeout: 4000 }); else send();
  }, 1500);
}

/* The calendar parts (dates and months) only change at midnight or with a
   setting, so they're worked out once per such change. */
let widgetCalCache = { sig: '', days: null, months: null };

function cssColorHex(value){
  const probe = document.createElement('i');
  probe.style.color = value;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0];
  probe.remove();
  const [r, g, b] = m.map(Number), a = m.length > 3 ? Number(m[3]) : 1;
  const h = n => Math.round(n).toString(16).padStart(2, '0');
  return '#' + h(a * 255) + h(r) + h(g) + h(b);
}

function widgetData(){
  const fa = lang() === 'fa';
  const color = name => cssColorHex(`var(${name})`);
  const keyOf = d => dateKey(d);
  const data = {
    v: 1, lang: lang(), built: keyOf(today), weeks: null,
    colors: {
      bg: color('--bg'), card: color('--card'), text: color('--text'), muted: color('--text-muted'),
      primary: color('--primary'), onPrimary: color('--on-primary'), border: color('--border'),
      holiday: cssColorHex('var(--holiday, var(--danger))'),
    },
    labels: { today: t('today'), planning: t('planning'), tasks: t('tasks'), habits: t('habits'), events: t('events'),
      nothing: t('nothingPlanned'), period: state.period && state.period.discreet ? t('discreetCycle') : t('periodDesktop'), calendar: t('calendar') },
    days: {}, months: [], desk: {}, plan: {}, period: null,
    ongoing: { on: pref('ongoingNotification') && !state.guest, days: {} },
  };
  const occ = d => (typeof occasionsForDate === 'function' ? occasionsForDate(d) : []) || [];
  const prayOn = featureOn('prayer') && pref('prayerShow');
  const s = state.settings;
  const sig = [keyOf(today), lang(), s.calendarSystem, s.weekStartDay, JSON.stringify(s.calendarEnabled), occ(today).length, occ(addDays(today, 1)).length,
    OCCASIONS_DATA || OCCASIONS_BY_DATE ? 1 : 0, prayOn ? prayerCityId() : ''].join('|'); // occasions.js: loaded or not yet
  if(widgetCalCache.sig === sig){
    data.days = widgetCalCache.days; data.months = widgetCalCache.months; data.weeks = widgetCalCache.weeks;
  } else {
  // Today's date widget: every calendar's date, and the day's occasions.
  for(let i = -1; i <= 60; i++){
    const d = addDays(today, i);
    const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
    const j = toJalali(y, m, dd), h = toHijri(y, m, dd);
    const lines = {
      jalali: `${toSysDigits(j.jd, 'jalali')} ${jalaliMonthName(j.jm - 1)} ${toSysDigits(j.jy, 'jalali')}`,
      gregorian: `${toSysDigits(dd, 'gregorian')} ${monthName(m - 1)} ${toSysDigits(y, 'gregorian')}`,
      hijri: `${toSysDigits(h.hd, 'hijri')} ${hijriMonthName(h.hm - 1)} ${toSysDigits(h.hy, 'hijri')}`,
    };
    data.days[keyOf(d)] = {
      // The other enabled calendars' dates (the main one is big above them).
      other: ['jalali', 'gregorian', 'hijri'].filter(sys => sys !== primarySystem() && s.calendarEnabled?.[sys] !== false).map(sys => lines[sys]).join('  ·  '),
      wd: weekdayFull(d.getDay()),
      big: displayDayNum(d),
      month: displayMonthYear(d).monthLabel + ' ' + displayMonthYear(d).yearLabel,
      occ: occ(d).map(o => o.event_name).filter(Boolean).slice(0, 3),
      holiday: isHolidayOn(d),
      // Dawn, noon and maghrib adhan for the chosen city (APK 1.4+ shows it).
      pray: prayOn ? (() => { const p = prayerTimesFor(d, prayerCityId()); return [['fajr', 'prFajr'], ['dhuhr', 'prDhuhr'], ['maghrib', 'prMaghrib']].map(([k, l]) => t(l) + ' ' + dig(p[k].hm)).join('  ·  '); })() : '',
    };
  }
  // The month calendar: the app's primary calendar, its week start, its
  // holidays; the other enabled calendars' numbers small under each day.
  const weekdays = weekdayOrder().map(i => weekdayShort(i));
  let cursor = stepMonth(stepMonth(today, -1), -1);
  for(let k = 0; k < 15; k++){
    const first = setMonthOf(cursor, primaryMonthOf(cursor) - 1);
    const gridStart = startOfWeek(first);
    const cells = [];
    for(let i = 0; i < 42; i++){
      const d = addDays(gridStart, i);
      const sub = dayCellDateHtml(d).match(/day-cell-sub">([^<]*)</);
      cells.push([keyOf(d), displayDayNum(d), sub ? sub[1] : '', (cellInCurrentMonth(d, first) ? 1 : 0) | (isHolidayOn(d) ? 2 : 0)]);
    }
    // Drop a last week that's all next month (5-week months).
    if(cells.slice(35).every(c => !(c[3] & 1))) cells.length = 35;
    const my = displayMonthYear(first);
    data.months.push({ title: `${my.monthLabel} ${my.yearLabel}`, first: keyOf(first), weekdays, cells });
    cursor = stepMonth(first, 1);
  }
  // APK 1.2+: the calendar widget made small shows 1, 2 or 4 weeks from
  // this one; weeks from 8 back to 20 ahead, `now` = this week's index.
  // Each week's title is its middle day's month.
  const thisWeek = startOfWeek(today), weekList = [];
  for(let w = -8; w <= 20; w++){
    const start = addDays(thisWeek, w * 7), cells = [];
    for(let i = 0; i < 7; i++){
      const d = addDays(start, i);
      const sub = dayCellDateHtml(d).match(/day-cell-sub">([^<]*)</);
      cells.push([keyOf(d), displayDayNum(d), sub ? sub[1] : '', 1 | (isHolidayOn(d) ? 2 : 0)]);
    }
    const my = displayMonthYear(addDays(start, 3));
    weekList.push({ title: `${my.monthLabel} ${my.yearLabel}`, first: keyOf(start), cells });
  }
  data.weeks = { now: 8, weekdays, list: weekList };
  widgetCalCache = { sig, days: data.days, months: data.months, weeks: data.weeks };
  }
  // The planning desk: a week of days, each with its tasks, habits, events.
  for(let i = 0; i < 7; i++){
    const d = addDays(today, i), key = keyOf(d);
    const items = [];
    state.tasks.filter(x => occursOnDate(x, d)).forEach(x => items.push({ kind: 'task', id: x.id, title: x.title, time: x.startTime || '', color: cssColorHex(x.color || itemColor('task') || 'var(--primary)'), done: taskStatusOn(x, key) === 'done' }));
    // tick: false — a counting/timed habit ticks itself (trackers.js): no checkbox on the widget.
    state.habits.filter(x => habitOccursOnDate(x, d)).forEach(x => items.push({ kind: 'habit', id: x.id, title: x.title, time: x.startTime || '', color: cssColorHex(x.color || itemColor('habit')), done: x.completedDates.includes(key), tick: !habitTracker(x) }));
    state.events.filter(x => occursOnDate(x, d)).forEach(x => items.push({ kind: 'event', id: x.id, title: x.title, time: x.startTime || '', color: cssColorHex(x.color || itemColor('event')), done: false }));
    items.sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1);
    data.desk[key] = items.slice(0, 12); // APK 1.1.0's desk widget
    // APK 1.2+: the desk as the app shows it (items.js renderItemSections):
    // events, then tasks (pinned first, done last), then habits, with each
    // row's state ('done' / 'not_done' / '') and its time label.
    const tasks = state.tasks.filter(x => occursOnDate(x, d));
    const habits = state.habits.filter(x => habitOccursOnDate(x, d));
    const events = state.events.filter(x => occursOnDate(x, d));
    const isDone = x => taskStatusOn(x, key) === 'done';
    data.plan[key] = {
      events: sortEvents(events).map(x => ({ id: x.id, title: x.title, time: x.startTime ? itemTimeLabel(x) : (eventTime(x) ? dig(eventTime(x)) : '') })),
      tasks: [...tasks].sort((a, b) => (b.pinned - a.pinned) || (isDone(a) - isDone(b))).map(x => ({ id: x.id, title: x.title, time: itemTimeLabel(x),
        state: taskStatusOn(x, key) || '', pinned: !!x.pinned })),
      habits: habits.map(x => ({ id: x.id, title: x.title,
        state: x.completedDates.includes(key) ? 'done' : (x.skippedDates || []).includes(key) ? 'not_done' : '', tick: !habitTracker(x) })),
    };
    // The always-there notification: the day's date and what's left.
    const left = { t: tasks.filter(x => !taskStatusOn(x, key)).length, h: habits.filter(x => !x.completedDates.includes(key) && !(x.skippedDates || []).includes(key)).length,
      e: events.filter(x => i > 0 || !x.startTime || atTimeOn(d, x.startTime) > Date.now()).length };
    data.ongoing.days[key] = left.t + left.h + left.e
      ? t('ongoingLeft').replace('{t}', dig(left.t)).replace('{h}', dig(left.h)).replace('{e}', dig(left.e))
      : t('ongoingAllDone');
  }
  data.labels.pinned = t('pinBtn');
  // Each kind's color (Settings → Planning), for the desk widget's ticks.
  data.itemColors = { task: cssColorHex(itemColor('task') || 'var(--primary)'), habit: cssColorHex(itemColor('habit')), event: cssColorHex(itemColor('event')) };
  // Only offered when the account has the period desk (Widgets.kt hides it otherwise).
  data.periodDesk = !state.guest && deskKeys().includes('periodDesktop');
  // The period ring (her own cycle), worked out for each of the next days
  // by the desk's own code (it reads `today`, set for each day in turn).
  const pd = state.period;
  if(pd && pd.enabled && pd.step === 'done' && pd.lastStart && state.profile.gender === 'female' && !periodAbnormal(pd)){
    const real = today.getTime();
    const { len, segments } = periodCycleSegments(pd);
    const arcs = segments.map(s => ({ start: s.start, len: s.len, color: cssColorHex(PERIOD_PHASE_COLOR[s.cat]), label: t(PERIOD_PHASE_LABEL[s.cat]) }));
    const days = {};
    try{
      for(let i = 0; i < 45; i++){
        today.setTime(addDays(new Date(real), i).getTime());
        const idx = Math.min(len - 1, Math.max(0, daysBetween(computePeriodCycleStart(pd), today)));
        const tmp = document.createElement('div');
        tmp.innerHTML = periodCenterDefault(periodDayCategories(pd), pd, true);
        // Discreet mode: the widget shows only "day 12 of 28", nothing about the period.
        days[keyOf(today)] = pd.discreet
          ? { idx, main: t('discreetDay').replace('{n}', dig(idx + 1)).replace('{len}', dig(len)), sub: '' }
          : { idx, main: tmp.querySelector('.period-center-main')?.textContent || '', sub: tmp.querySelector('.period-center-sub')?.textContent || '' };
      }
    } finally { today.setTime(real); }
    data.period = { len, arcs, days, title: pd.discreet ? t('discreetCycle') : t('periodDesktop') };
  }
  return data;
}
