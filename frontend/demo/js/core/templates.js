/* ============ STUDENT STARTER PACK (Profile → Ready-made plans) ============
   Templates added in one tap as ordinary habits and events (so every one is
   editable or deletable afterwards), and a focus timer (25 minutes of work,
   5 of rest, one round after another). The exam countdown is the event
   form's "Countdown" kind with its Konkur/Exam presets (popup.js). */

const WEEK_STUDY = [6, 0, 1, 2, 3]; // Saturday to Wednesday

/* Each template: what it adds, worked out on the day it's added. */
const TEMPLATES = {
  study: () => ({
    habits: [
      { title: t('tplStudyMorning'), recurrence: { mode: 'weekdays', interval: 1, weekdays: WEEK_STUDY }, tracker: { kind: 'timer', mode: 'down', minutes: 50 }, time: '08:00' },
      { title: t('tplStudyReview'), recurrence: { mode: 'interval', interval: 1, weekdays: [] }, time: '20:00' },
      { title: t('tplStudyTest'), recurrence: { mode: 'weekdays', interval: 1, weekdays: [4] }, time: '10:00' },
    ],
    events: [{ title: t('tplStudyPlanWeek'), recurrence: { mode: 'weekdays', interval: 1, weekdays: [5] }, startTime: '18:00' }],
  }),
  ramadan: () => {
    // The coming (or current) Ramadan from the official Hijri table.
    const h = toHijri(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const year = h.hm > 9 ? h.hy + 1 : h.hy;
    const first = convertDate('hijri', year, 9, 1) || today, last = convertDate('hijri', year, 10, 1);
    const start = dateKey(first < today ? today : first), end = dateKey(last ? addDays(last, -1) : addDays(first, 29));
    const daily = { mode: 'interval', interval: 1, weekdays: [] };
    return {
      habits: [
        { title: t('tplRamadanSuhoor'), recurrence: daily, start, end },
        { title: t('tplRamadanQuran'), recurrence: daily, start, end, tracker: { kind: 'counter', target: 1 } },
        { title: t('tplRamadanIftar'), recurrence: daily, start, end },
      ],
    };
  },
  challenge30: () => ({
    habits: [{ title: t('tpl30Title'), recurrence: { mode: 'interval', interval: 1, weekdays: [] }, end: dateKey(addDays(today, 29)), time: '19:00' }],
  }),
};
const TEMPLATE_LIST = [['study', 'tplStudy', 'tplStudySub'], ['ramadan', 'tplRamadan', 'tplRamadanSub'], ['challenge30', 'tpl30', 'tpl30Sub']];

function applyTemplate(key){
  const make = TEMPLATES[key]; if(!make) return;
  const tpl = make(), start = dateKey(today);
  (tpl.habits || []).forEach(x => {
    const h = { id: uid(), title: x.title, recurrence: Object.assign({ anchor: null, cal: null }, x.recurrence),
      notification: x.time ? { type: 'time', time: x.time } : { type: null },
      startDate: x.start || start, endDate: x.end || null, completedDates: [], skippedDates: [], tracker: x.tracker || null, progress: {} };
    state.habits.push(h); cloudSync(() => Cloud.saveHabit(h));
  });
  (tpl.events || []).forEach(x => {
    const e = { id: uid(), title: x.title, description: '', kind: '', timeMode: 'single', date: start, endDate: null,
      startTime: x.startTime || null, endTime: null, recurrence: Object.assign({ anchor: null, cal: null }, x.recurrence), notification: { type: null } };
    state.events.push(e); cloudSync(() => Cloud.saveEvent(e));
  });
  trackEvent('first_habit', true);
  render();
  showToast(t('tplAdded'));
}

/* ---- focus timer ---- */
const FOCUS = { work: 25, rest: 5 };
let focus = { mode: 'work', endsAt: 0, left: FOCUS.work * 60000, rounds: 0 }, focusTimer = null;

function focusTick(){
  if(!focus.endsAt) return;
  focus.left = Math.max(0, focus.endsAt - Date.now());
  if(focus.left === 0){
    const done = focus.mode === 'work';
    if(done) focus.rounds++;
    focus.mode = done ? 'rest' : 'work';
    focus.left = FOCUS[focus.mode] * 60000;
    focus.endsAt = Date.now() + focus.left; // the next part starts by itself
    haptic(200);
    showReminder({ slot: 'focus|' + Date.now(), kind: '', id: '', date: dateKey(today), title: t(done ? 'focusRestNow' : 'focusWorkNow'), body: t('appName'), item: { title: '' } }, false);
  }
  const el = document.getElementById('focus-clock');
  if(el) el.textContent = focusClock(); else if(!state.menuPanelOpen) return;
}
function focusClock(){ const s = Math.ceil(focus.left / 1000); return dig(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')); }
function focusToggle(){
  if(focus.endsAt){ focus.left = Math.max(0, focus.endsAt - Date.now()); focus.endsAt = 0; clearInterval(focusTimer); }
  else { focus.endsAt = Date.now() + focus.left; clearInterval(focusTimer); focusTimer = setInterval(focusTick, 500); }
  render();
}
function focusReset(){ clearInterval(focusTimer); focus = { mode: 'work', endsAt: 0, left: FOCUS.work * 60000, rounds: 0 }; render(); }

function renderTemplatesPage(){
  return `
    ${subHeader(t('tplTitle'))}
    <div class="section-title">${t('focusTitle')}</div>
    <div class="dt-result focus-box">
      <div class="sub">${t(focus.mode === 'work' ? 'focusWork' : 'focusRest')} · ${t('focusRounds').replace('{n}', dig(focus.rounds))}</div>
      <div class="focus-clock" id="focus-clock" dir="ltr">${focusClock()}</div>
      <div class="dt-row" style="justify-content:center;margin:0;">
        <button type="button" class="btn btn-primary btn-small" data-action="focus-toggle">${t(focus.endsAt ? 'focusPause' : 'focusStart')}</button>
        <button type="button" class="btn btn-outline btn-small" data-action="focus-reset">${t('focusReset')}</button>
      </div>
      <div class="sub">${t('focusHint')}</div>
    </div>
    <div class="section-title">${t('tplReady')}</div>
    ${TEMPLATE_LIST.map(([key, title, sub]) => `<div class="settings-row"><div><div class="lbl">${t(title)}</div><div class="sub">${t(sub)}</div></div>
      <button type="button" class="btn btn-outline btn-small" data-action="apply-template" data-key="${key}">${t('tplAdd')}</button></div>`).join('')}
    <div class="sub" style="margin:8px 2px;">${t('tplExamHint')}</div>`;
}
