/* ============ PERIOD TRACKING (Admin Panel, gender === 'female' only) ====
   All estimates, not medical advice: period days from the quiz answers,
   repeated every cycleLength; PMS = the 5 days before each predicted
   period; ovulation/fertile window = ~14 days before each predicted
   period (the luteal phase is the relatively constant part of a cycle). */
/* Cycle and period length as used everywhere: clamped to the setup's
   ranges, so data saved before those limits (a 3-day cycle, a 40-day
   period) can't break the ring, the calendar or the predictions. */
/* Every function below takes the cycle to work on (`pd`): the person's own
   state.period by default, or a friend's that was shared with them
   (state.sharedPeriods, see periodViews()). */
function periodCycleLen(pd = state.period){ return Math.min(45, Math.max(21, Number(pd.cycleLength) || 28)); }
function periodLen(pd = state.period){ return Math.min(10, Math.max(2, Number(pd.periodLength) || 5), periodCycleLen(pd) - 1); }

function computePeriodCycleStart(pd = state.period){
  const p = { lastStart: pd.lastStart, cycleLength: periodCycleLen(pd) };
  const lastStart = new Date(p.lastStart + 'T00:00:00');
  const daysSince = Math.round((today - lastStart) / 86400000);
  const cyclesPassed = Math.floor(daysSince / p.cycleLength);
  return addDays(lastStart, cyclesPassed * p.cycleLength);
}

function periodDayCategories(pd = state.period){
  const p = { cycleLength: periodCycleLen(pd), periodLength: periodLen(pd) };
  const currentCycleStart = computePeriodCycleStart(pd);
  const cats = new Array(30).fill('normal');
  const rank = { normal:0, fertile:1, pms:2, period:3 };
  for(let k=-1;k<=2;k++){
    const cycleStart = addDays(currentCycleStart, k*p.cycleLength);
    const periodEnd = addDays(cycleStart, p.periodLength-1);
    const pmsStart = addDays(cycleStart, -5);
    const pmsEnd = addDays(cycleStart, -1);
    const ovulation = addDays(cycleStart, -14);
    const fertileStart = addDays(ovulation, -4);
    const fertileEnd = addDays(ovulation, 1);
    for(let i=0;i<30;i++){
      const d = addDays(today, i);
      let cat = null;
      if(d >= cycleStart && d <= periodEnd) cat = 'period';
      else if(d >= pmsStart && d <= pmsEnd) cat = 'pms';
      else if(d >= fertileStart && d <= fertileEnd) cat = 'fertile';
      if(cat && rank[cat] > rank[cats[i]]) cats[i] = cat;
    }
  }
  return cats;
}

function periodSummaryText(cats, own = true, pd = state.period){
  const nextPeriodIdx = cats.indexOf('period');
  if(nextPeriodIdx === 0){
    // In it today: "starts today" only on its first day, else which day it is.
    const day = daysBetween(computePeriodCycleStart(pd), today) + 1;
    if(day <= 1) return t(own ? 'periodStartsToday' : 'periodStartsTodayOther');
    return lang() === 'fa' ? `روز ${dig(day)} عادت ماهانه` : `Period day ${day}`;
  }
  if(nextPeriodIdx > 0){
    if(lang() === 'fa') return `${dig(nextPeriodIdx)} روز تا عادت ماهانه‌ی بعدی${own ? 'ت' : 'ش'}`;
    return `${nextPeriodIdx} day${nextPeriodIdx===1?'':'s'} until ${own ? 'your' : 'their'} next period`;
  }
  return '';
}

/* ---- cycle ring ----
   One continuous ring = the current cycle, day 1 at the top, clockwise.
   Each phase is its own arc: period, the regular days, the fertile window
   and PMS. Hovering (or tapping) an arc lifts it and shows the phase's
   name, length and dates in the middle; a dot marks today. */
// Fills (arcs, legend dots) and text shades — period.css' .period-themed tokens.
const PERIOD_PHASE_COLOR = { period:'var(--period-flow)', pms:'var(--period-pms)', fertile:'var(--period-fertile)', normal:'var(--period-ring-rest)' };
const PERIOD_PHASE_INK = { period:'var(--period-flow-ink)', pms:'var(--period-pms-ink)', fertile:'var(--period-fertile-ink)', normal:'var(--text)' };
const PERIOD_PHASE_LABEL = { period:'legendPeriod', pms:'legendPms', fertile:'legendFertile', normal:'legendRegular' };

/* Called for every calendar cell (periodPhaseOn), so it's worked out once
   per cycle/period length and reused. */
let periodSegCache = { key: '', value: null };
function periodCycleSegments(pd = state.period){
  const len = periodCycleLen(pd), plen = periodLen(pd);
  const key = len + '|' + plen;
  if(periodSegCache.key === key) return periodSegCache.value;
  periodSegCache = { key, value: buildPeriodSegments(len, plen) };
  return periodSegCache.value;
}

function buildPeriodSegments(len, plen){
  const cats = new Array(len).fill('normal');
  const ovulation = len - 14;
  for(let d = ovulation - 4; d <= ovulation + 1; d++) if(d >= 0 && d < len) cats[d] = 'fertile';
  for(let d = len - 5; d < len; d++) if(d >= 0) cats[d] = 'pms';
  for(let d = 0; d < plen; d++) cats[d] = 'period';
  const segments = [];
  cats.forEach((cat, day) => {
    const last = segments[segments.length - 1];
    if(last && last.cat === cat) last.len++;
    else segments.push({ cat, start: day, len: 1 });
  });
  return { len, segments };
}

function shortDate(d){ return `${displayDayNum(d)} ${monthNameFor(primaryMonthOf(d) - 1)}`; }

function periodArcPath(cx, cy, r, a0, a1){
  const pt = a => [(cx + r * Math.cos(a)).toFixed(2), (cy + r * Math.sin(a)).toFixed(2)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

function periodWheelSvg(pd = state.period){
  const size = 240, c = size / 2, r = 94, gap = 0.035; // radians between arcs
  const { len, segments } = periodCycleSegments(pd);
  const angle = day => (day / len) * 2 * Math.PI - Math.PI / 2;
  const arcs = segments.map((s, i) => {
    const a0 = angle(s.start) + gap / 2, a1 = angle(s.start + s.len) - gap / 2;
    return `<path class="period-arc" data-seg="${i}" d="${periodArcPath(c, c, r, a0, a1)}" stroke="${PERIOD_PHASE_COLOR[s.cat]}" tabindex="0" role="button" aria-label="${escapeAttr(t(PERIOD_PHASE_LABEL[s.cat]))}"></path>`;
  }).join('');
  const todayIdx = Math.min(len - 1, Math.max(0, daysBetween(computePeriodCycleStart(pd), today)));
  const ta = angle(todayIdx + 0.5);
  const todayDot = `<circle class="period-today-dot" cx="${(c + r * Math.cos(ta)).toFixed(2)}" cy="${(c + r * Math.sin(ta)).toFixed(2)}" r="7"></circle>`;
  return `<svg viewBox="0 0 ${size} ${size}" class="period-wheel">${arcs}${todayDot}</svg>`;
}

function periodCenterDefault(cats, pd = state.period, own = true){
  const day = daysBetween(computePeriodCycleStart(pd), today) + 1;
  const sub = lang() === 'fa' ? `روز ${dig(day)} از ${dig(periodCycleLen(pd))}` : `Day ${day} of ${periodCycleLen(pd)}`;
  return `<span class="period-center-main">${periodSummaryText(cats, own, pd)}</span><span class="period-center-sub">${sub}</span>`;
}

/* The phase a cycle is in today: { seg, day } (day 1 = the phase's first). */
function periodPhaseToday(pd){
  const { len, segments } = periodCycleSegments(pd);
  const idx = Math.min(len - 1, Math.max(0, daysBetween(computePeriodCycleStart(pd), today)));
  const seg = segments.find(s => idx >= s.start && idx < s.start + s.len) || segments[0];
  return { seg, day: idx - seg.start + 1 };
}

function periodCenterForSegment(s, pd = state.period){
  const from = addDays(computePeriodCycleStart(pd), s.start), to = addDays(from, s.len - 1);
  const days = lang() === 'fa' ? `${dig(s.len)} روز` : `${s.len} day${s.len === 1 ? '' : 's'}`;
  const range = s.len === 1 ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
  const color = PERIOD_PHASE_INK[s.cat];
  return `<span class="period-center-main" style="color:${color}">${t(PERIOD_PHASE_LABEL[s.cat])}</span><span class="period-center-days">${days}</span><span class="period-center-sub">${range}</span>`;
}

/* The arc picked on the ring lights up the same days on the calendar:
   those cells get .ph-focus and their phase capsule turns a little
   stronger and brighter (calendar.css, short soft transition). Only the
   current cycle's dates — the ring shows the current cycle. */
function focusPhaseOnCalendar(seg){
  const from = seg && seg.cat !== 'normal' ? dateKey(addDays(computePeriodCycleStart(), seg.start)) : null;
  const to = from ? dateKey(addDays(computePeriodCycleStart(), seg.start + seg.len - 1)) : null;
  document.querySelectorAll('#home-cal-grid .day-cell, #cal-month-grid .day-cell').forEach(c => {
    c.classList.toggle('ph-focus', !!from && c.dataset.date >= from && c.dataset.date <= to);
  });
}

/* Wired after every render (render.js); in-place DOM changes only. */
function attachPeriodWheel(){
  const wrap = document.querySelector('.period-wheel-wrap');
  if(!wrap) return;
  const center = wrap.querySelector('.period-wheel-center');
  // The cycle drawn on screen: own, or a friend's (only her own is on the calendar).
  const view = periodViews()[periodViewIndex()] || { own: true, p: state.period };
  const { segments } = periodCycleSegments(view.p);
  const defaultHtml = center.innerHTML;
  let pinned = null; // tapped arc stays highlighted until tapped again
  const show = i => {
    wrap.querySelectorAll('.period-arc').forEach(a => a.classList.toggle('active', a.dataset.seg === String(i)));
    wrap.classList.toggle('has-active', i !== null);
    center.innerHTML = i === null ? defaultHtml : periodCenterForSegment(segments[i], view.p);
    if(view.own) focusPhaseOnCalendar(i === null ? null : segments[i]);
  };
  focusPhaseOnCalendar(null); // a fresh render starts with nothing focused
  wrap.querySelectorAll('.period-arc').forEach(arc => {
    const i = Number(arc.dataset.seg);
    arc.addEventListener('pointerenter', e => { if(e.pointerType === 'mouse') show(i); });
    arc.addEventListener('pointerleave', e => { if(e.pointerType === 'mouse') show(pinned); });
    arc.addEventListener('focus', () => show(i));
    arc.addEventListener('blur', () => show(pinned));
    arc.addEventListener('click', () => { pinned = pinned === i ? null : i; show(pinned); });
  });
}

/* Compact entry card shown in Management. Just the toggle, a settings
   gear (jumps straight into the quiz for editing), title/description,
   and an Open button into the full page below — the actual quiz, wheel,
   tips live in renderPeriodPage(), not here. */
/* Settings → Period: every actual *setting* (on/off, calendar reminder,
   re-answering the quiz) lives here now, not in the میزکار pane itself
   or in Management — renderPeriodPage() below is pure content/view. */
function renderPeriodSettings(){
  const p = state.period;
  return `
    ${subHeader(t('periodTracker'))}
    <div class="settings-row">
      <div><div class="lbl">${t('periodTracker')}</div><div class="sub">${t('periodTrackerDesc')}</div></div>
      <div class="switch ${p.enabled?'on':''}" data-action="toggle-period-enabled"><div class="knob"></div></div>
    </div>
    ${p.enabled ? `
      <div class="settings-row">
        <div><div class="lbl">${t('calendarReminderLabel')}</div><div class="sub">${t('calendarReminderSub')}</div></div>
        <div class="switch ${p.calendarReminder?'on':''}" data-action="toggle-calendar-reminder"><div class="knob"></div></div>
      </div>
      <div class="settings-row" data-action="period-settings" style="cursor:pointer;">
        <div class="lbl">${t('editAnswers')}</div>
        ${ICONS.chevronRightSmall}
      </div>
      ${Cloud.periodShares && Cloud.hasSession() ? periodShareRowHtml() : ''}
    ` : ''}
  `;
}

/* ---- sharing my cycle with friends (up to PERIOD_SHARE_MAX) ----
   They see the ring and where I am in it on their period desk; nothing
   else. Picked from my friends in a themed menu (js/core/dropdown.js). */
const PERIOD_SHARE_MAX = 3;
let periodSharesLoading = false;

function loadPeriodShares(){
  if(periodSharesLoading || !Cloud.periodShares) return;
  periodSharesLoading = true;
  Promise.all([Cloud.periodShares(), Cloud.listConnections()])
    .then(([shares, conns]) => { state.periodShares = shares; state.connections = conns; render(); if(periodDraft) renderPeriodQuiz(); })
    .catch(() => { state.periodShares = state.periodShares || []; })
    .finally(() => { periodSharesLoading = false; });
}

function periodShareLabel(){
  const list = state.periodShares || [];
  return list.length ? list.map(s => s.name).join(lang() === 'fa' ? '، ' : ', ') : t('periodShareNone');
}

function periodShareRowHtml(){
  if(state.periodShares === null) loadPeriodShares();
  const n = (state.periodShares || []).length;
  return `
    <div class="settings-row period-share-row">
      <div style="min-width:0;"><div class="lbl">${t('periodShareWith')}</div><div class="sub" id="period-share-sub">${t('periodShareSub')}</div></div>
      <button type="button" class="tj-select period-share-btn" id="period-share-btn" data-action="period-share-open" aria-haspopup="listbox" aria-expanded="false" ${state.periodShares === null ? 'disabled' : ''}>
        <span class="tj-select-label">${state.periodShares === null ? '…' : (n ? (lang() === 'fa' ? `${dig(n)} نفر` : `${n} ${n === 1 ? 'friend' : 'friends'}`) : t('periodShareNoneShort'))}</span>${TJ_CHEVRON}
      </button>
    </div>
    ${n ? `<div class="period-share-names" dir="ltr">${escapeHtml(periodShareLabel())}</div>` : ''}`;
}

function periodShareMenuHtml(){
  const friends = (state.connections || []).filter(c => c.status === 'accepted');
  if(!friends.length) return `<div class="tj-menu-empty">${t('periodShareNoFriends')}</div>
    <button type="button" class="tj-option" data-go="friends">${ICONS.linkIcon || ''}<span>${t('connections')}</span></button>`;
  const chosen = new Set((state.periodShares || []).map(s => s.id));
  const full = chosen.size >= PERIOD_SHARE_MAX;
  return `<div class="tj-menu-note">${t('periodShareMax')}</div>
    <div role="listbox" aria-multiselectable="true">${friends.map(f => {
      const on = chosen.has(f.id);
      return `<button type="button" class="tj-option tj-check ${on ? 'active' : ''}" role="option" aria-selected="${on}" data-id="${f.id}" ${!on && full ? 'disabled' : ''}>
        <span class="tj-checkbox">${on ? ICONS.check : ''}</span><span dir="ltr">${escapeHtml(f.name)}</span></button>`;
    }).join('')}</div>`;
}

function openPeriodShareMenu(btn){
  if(tjMenuOwner === btn){ closeTjMenu(); return; }
  const m = tjMenu(btn, periodShareMenuHtml(), 'period-share-menu');
  m.addEventListener('click', e => {
    if(e.target.closest('[data-go="friends"]')){ closeTjMenu(); state.menuSubView = 'friends'; render(); refreshConnections(); return; }
    const b = e.target.closest('.tj-option[data-id]');
    if(!b || b.disabled) return;
    const before = state.periodShares || [];
    const ids = before.map(s => s.id);
    const next = ids.includes(b.dataset.id) ? ids.filter(x => x !== b.dataset.id) : [...ids, b.dataset.id];
    if(next.length > PERIOD_SHARE_MAX){ showToast(t('periodShareMax')); return; }
    // Show it at once, then save; put it back if the save fails.
    const friend = state.connections.find(c => c.id === b.dataset.id);
    state.periodShares = next.map(id => before.find(s => s.id === id) || friend);
    m.innerHTML = periodShareMenuHtml();
    Cloud.savePeriodShares(next).then(list => { state.periodShares = list; })
      .catch(err => { state.periodShares = before; showToast(err && err.code === 'not_a_friend' ? t('errUserGone') : t('saveFailed')); })
      .finally(() => { if(tjMenuEl === m) m.innerHTML = periodShareMenuHtml(); refreshPeriodShareRow(); });
    refreshPeriodShareRow();
  });
}

/* The row's label and the names under it, in place (the menu stays open). */
function refreshPeriodShareRow(){
  const row = document.querySelector('.period-share-row');
  if(!row) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = periodShareRowHtml();
  const label = tmp.querySelector('.tj-select-label');
  if(label) row.querySelector('.tj-select-label').innerHTML = label.innerHTML;
  row.nextElementSibling?.classList.contains('period-share-names') && row.nextElementSibling.remove();
  const names = tmp.querySelector('.period-share-names');
  if(names) row.after(names);
}

/* میزکار pane content only (see renderDesktops) — no settings controls
   here at all (enable toggle, calendar reminder, edit-answers all moved
   to Settings → Period / renderPeriodSettings() above); this just shows
   the current status and tips. */
/* The cycles the period desk shows: her own (if she tracks one) and every
   friend's that was shared with this person (Settings → period →
   "Share with…" on the friend's side). A man sees the desk only when
   someone shared with him. */
/* Every change to her own period setup (on/off, the setup quiz, the
   calendar reminder) is saved right away. Before, it rode along only when
   something else happened to be saved, so the desk could vanish on the
   next load and come back later ("jumping"). */
function savePeriodSetup(){
  cloudSync(() => Cloud.savePeriod ? Cloud.savePeriod(state.period) : Promise.resolve());
}

function periodViews(){
  const views = [];
  if(state.profile.gender === 'female' && state.period.enabled) views.push({ own: true, p: state.period });
  (state.sharedPeriods || []).forEach(s => views.push({
    own: false, name: s.name, userId: s.userId,
    p: Object.assign({ enabled: true, step: 'done' }, s.period),
  }));
  return views;
}
function periodViewIndex(){
  const n = periodViews().length;
  return n ? Math.min(Math.max(0, state.periodViewIndex || 0), n - 1) : 0;
}

function renderPeriodPage(headerHtml){
  if(headerHtml === undefined) headerHtml = '';
  const views = periodViews();
  const view = views[periodViewIndex()];
  if(!view){
    return `
      <div class="period-themed">
      ${headerHtml}
      <div class="empty-hint">${t('periodOffHint')}</div>
      </div>
    `;
  }
  const p = view.p;
  const many = views.length > 1;
  // Left/right arrows beside the ring when there's more than one cycle.
  const arrows = many ? `
    <button type="button" class="period-view-arrow prev" data-action="period-view-step" data-dir="-1" aria-label="${t('prev')}">${lang()==='fa' ? ICONS.chevronRight : ICONS.chevronLeft}</button>
    <button type="button" class="period-view-arrow next" data-action="period-view-step" data-dir="1" aria-label="${t('next')}">${lang()==='fa' ? ICONS.chevronLeft : ICONS.chevronRight}</button>` : '';
  // Someone else's cycle: their username, a faint line, and where they are now.
  const owner = view.own ? '' : (() => {
    const { seg, day } = periodPhaseToday(p);
    const phase = lang() === 'fa' ? `الان: ${t(PERIOD_PHASE_LABEL[seg.cat])} · روز ${dig(day)} از ${dig(seg.len)}`
      : `Now: ${t(PERIOD_PHASE_LABEL[seg.cat])} · day ${day} of ${seg.len}`;
    return `<div class="period-owner">
      <div class="period-owner-name" dir="ltr">${escapeHtml(view.name || '')}</div>
      <div class="period-owner-now" style="color:${PERIOD_PHASE_INK[seg.cat]}">${phase}</div>
    </div>`;
  })();
  const dots = many ? `<div class="period-view-dots">${views.map((_, i) => `<span class="${i === periodViewIndex() ? 'active' : ''}"></span>`).join('')}</div>` : '';
  const trackerBody = p.step !== 'done' ? `
    <div class="store-card">
      <div class="empty-hint">${t('periodTrackerDesc')}</div>
      <button class="btn btn-primary" style="width:100%; margin-top:12px;" data-action="period-quiz-start">${ICONS.dropIcon} ${t('startBtn')}</button>
      ${many ? `<div class="period-view-switch">${arrows}</div>${dots}` : ''}
    </div>
  ` : (() => {
    const cats = periodDayCategories(p);
    return `
      <div class="store-card">
        ${owner}
        <div class="period-wheel-wrap">
          ${periodWheelSvg(p)}
          <div class="period-wheel-center" dir="${lang()==='fa'?'rtl':'ltr'}" aria-live="polite">${periodCenterDefault(cats, p, view.own)}</div>
          ${arrows}
        </div>
        ${dots}
        <div class="period-legend">
          <span class="period-legend-item"><span class="dot" style="background:var(--period-flow);"></span>${t('legendPeriod')}</span>
          <span class="period-legend-item"><span class="dot" style="background:var(--period-pms);"></span>${t('legendPms')}</span>
          <span class="period-legend-item"><span class="dot" style="background:var(--period-fertile);"></span>${t('legendFertile')}</span>
        </div>
        ${view.own && p.regular === 'no' ? `<div class="period-q-note">${t('periodIrregularNote')}</div>` : ''}
        ${view.own && p.pain === 'severe' ? `<div class="period-q-note">${t('periodPainSevereNote')}</div>` : ''}
        <div class="empty-hint" style="margin-top:12px;">${t('periodDisclaimer')}</div>
      </div>
    `;
  })();
  return `
    <div class="period-themed">
    ${headerHtml}
    ${trackerBody}
    ${state.profile.gender === 'female' ? `<div class="section-title">${t('tipsTitle')}</div>${periodTipsHtml()}` : ''}
    </div>
  `;
}

/* "Did you know?" carousel: whole tips slide in (no typing effect),
   advance on their own every few seconds, and can be swiped (no arrows or
   dots — removed at the repo owner's request). The current slide
   survives re-renders. */
const PERIOD_TIPS = ['tip1','tip2','tip3','tip4','tip5','tip6'];
const TIP_AUTO_MS = 7000;

let periodTipsTimer = null;
let periodTipIndex = 0;

function periodTipsHtml(){
  const fa = lang() === 'fa';
  return `
    <div class="tips-carousel ${fa ? 'is-rtl' : ''}" id="period-tips">
      <div class="tips-viewport">
        <div class="tips-track" id="period-tips-track">
          ${PERIOD_TIPS.map((k, i) => `<div class="tip-slide" aria-hidden="${i !== periodTipIndex}"><div class="tip-slide-icon">${ICONS.infoIcon}</div><p dir="${fa ? 'rtl' : 'ltr'}">${escapeHtml(t(k))}</p></div>`).join('')}
        </div>
      </div>
    </div>`;
}

function stopPeriodTipsRotator(){
  clearInterval(periodTipsTimer);
  periodTipsTimer = null;
}

function startPeriodTipsRotator(){
  stopPeriodTipsRotator();
  const root = document.getElementById('period-tips');
  const track = document.getElementById('period-tips-track');
  if(!root || !track) return;
  const sign = root.classList.contains('is-rtl') ? 1 : -1; // fa slides toward the right
  const go = (i, animate = true) => {
    periodTipIndex = (i + PERIOD_TIPS.length) % PERIOD_TIPS.length;
    track.style.transition = animate ? '' : 'none';
    track.style.transform = `translateX(${sign * periodTipIndex * 100}%)`;
    track.querySelectorAll('.tip-slide').forEach((s, j) => s.setAttribute('aria-hidden', j !== periodTipIndex));
  };
  const restart = () => { clearInterval(periodTipsTimer); periodTipsTimer = setInterval(() => go(periodTipIndex + 1), TIP_AUTO_MS); };
  go(periodTipIndex, false);
  restart();

  root.addEventListener('pointerenter', e => { if(e.pointerType === 'mouse') clearInterval(periodTipsTimer); });
  root.addEventListener('pointerleave', e => { if(e.pointerType === 'mouse') restart(); });

  // Swipe: follow the finger, then settle on the nearer slide.
  const viewport = root.querySelector('.tips-viewport');
  let startX = null, dx = 0;
  viewport.addEventListener('pointerdown', e => { startX = e.clientX; dx = 0; track.style.transition = 'none'; viewport.setPointerCapture(e.pointerId); e.stopPropagation(); });
  viewport.addEventListener('pointermove', e => {
    if(startX === null) return;
    dx = e.clientX - startX;
    track.style.transform = `translateX(calc(${sign * periodTipIndex * 100}% + ${dx}px))`;
  });
  const end = () => {
    if(startX === null) return;
    startX = null;
    const step = Math.abs(dx) > 40 ? (dx < 0 ? 1 : -1) * (sign === 1 ? -1 : 1) : 0;
    go(periodTipIndex + step);
    restart();
  };
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
}

/* Sensible ranges for the setup answers (it used to accept a 3-day cycle,
   a 40-day period or a start date a year ago). */
const PERIOD_LIMITS = { lastStartDays: 45, cycle: [21, 45], period: [2, 10] };

/* The setup popup: eight short questions, one per screen (the sheet slides
   up from the bottom). It works on a draft; the real setup only changes
   on "Finish", so closing it half way leaves an existing setup exactly as
   it was. Sharing (the last step) saves at once, like in Settings. */
let periodDraft = null;
const PERIOD_QUIZ_STEPS = 8;

function periodChoiceHtml(field, options){
  const d = periodDraft;
  return `<div class="period-choices" role="radiogroup">${options.map(([v, k]) =>
    `<button type="button" class="period-choice ${String(d[field]) === String(v) ? 'active' : ''}" role="radio" aria-checked="${String(d[field]) === String(v)}" data-period-pick="${field}" data-value="${v}">${t(k)}</button>`).join('')}</div>`;
}

function periodQuizStepHtml(){
  const d = periodDraft;
  const err = d.error ? `<div class="auth-field-error">${escapeHtml(d.error)}</div>` : '';
  const q = (label, body, hint) => `<div class="field"><label class="field-label">${t(label)}</label>${body}${hint ? `<div class="period-q-hint">${t(hint)}</div>` : ''}${err}</div>`;
  let html;
  if(d.step === 1){
    html = q('periodQ1', `<button type="button" class="date-field-btn" id="period-q1">${d.lastStart ? formatDateLabel(d.lastStart) : t('periodQ1')}${ICONS.calendarIcon}</button>`, 'periodQ1Hint');
  } else if(d.step === 2){
    html = q('periodQ2', `<input type="number" inputmode="numeric" id="period-q2" value="${d.cycleLength}" min="${PERIOD_LIMITS.cycle[0]}" max="${PERIOD_LIMITS.cycle[1]}">`, 'periodQ2Hint');
  } else if(d.step === 3){
    html = q('periodQ3', `<input type="number" inputmode="numeric" id="period-q3" value="${d.periodLength}" min="${PERIOD_LIMITS.period[0]}" max="${PERIOD_LIMITS.period[1]}">`, 'periodQ3Hint');
  } else if(d.step === 4){
    html = q('periodQ4', periodChoiceHtml('regular', [['yes', 'regYes'], ['no', 'regNo'], ['unsure', 'regUnsure']]), 'periodQ4Hint');
  } else if(d.step === 5){
    html = q('periodQ5', periodChoiceHtml('pain', [['none', 'painNone'], ['mild', 'painMild'], ['moderate', 'painModerate'], ['severe', 'painSevere']]))
      + (d.pain === 'severe' ? `<div class="period-q-note">${t('periodPainSevereNote')}</div>` : '');
  } else if(d.step === 6){
    html = q('periodQ6', periodChoiceHtml('remindDays', [[0, 'remindNone'], [1, 'remindDays1'], [2, 'remindDays2'], [3, 'remindDays3']]), 'periodQ6Hint');
  } else if(d.step === 7){
    html = q('periodQ7', periodChoiceHtml('calendarReminder', [[true, 'answerYes'], [false, 'answerNo']]));
  } else {
    const canShare = Cloud.periodShares && Cloud.hasSession();
    html = q('periodQ8', canShare ? periodShareRowHtml() : `<div class="period-q-note">${t('periodShareLater')}</div>`, canShare ? 'periodQ8Hint' : '');
  }
  const last = d.step === PERIOD_QUIZ_STEPS;
  return `
    <div class="period-quiz-step">
      ${html}
      <div class="period-quiz-nav">
        ${d.step > 1 ? `<button class="btn btn-outline" data-action="period-quiz-back">${t('quizBack')}</button>` : ''}
        <button class="btn btn-primary" data-action="${last ? 'period-quiz-finish' : 'period-quiz-next'}">${t(last ? 'finishBtn' : 'nextBtn')}</button>
      </div>
    </div>
  `;
}

function renderPeriodQuiz(){
  const d = periodDraft;
  if(!d) return;
  const dots = Array.from({ length: PERIOD_QUIZ_STEPS }, (_, i) => `<span class="${d.step === i + 1 ? 'active' : d.step > i + 1 ? 'done' : ''}"></span>`).join('');
  const body = document.getElementById('period-quiz-body');
  body.innerHTML = `<div class="period-quiz-dots">${dots}</div>${periodQuizStepHtml()}`;
  document.getElementById('period-q1')?.addEventListener('click', () => openDatePicker({
    title: t('periodQ1'), value: d.lastStart, max: dateKey(today), min: dateKey(addDays(today, -PERIOD_LIMITS.lastStartDays)),
    onPick: v => { d.lastStart = v; d.error = ''; renderPeriodQuiz(); },
  }));
  document.getElementById('period-q2')?.addEventListener('input', e => { d.cycleLength = e.target.value; });
  document.getElementById('period-q3')?.addEventListener('input', e => { d.periodLength = e.target.value; });
  body.querySelectorAll('[data-period-pick]').forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.periodPick, v = b.dataset.value;
    d[f] = f === 'remindDays' ? Number(v) : f === 'calendarReminder' ? v === 'true' : v;
    d.error = '';
    renderPeriodQuiz();
  }));
}

/* "Next" / "Finish": check this step's answer, stay on it with a message
   if it's out of range. The choice questions can be skipped. */
function periodQuizNext(){
  const d = periodDraft;
  const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;
  if(d.step === 1){
    const oldest = dateKey(addDays(today, -PERIOD_LIMITS.lastStartDays));
    if(!d.lastStart || d.lastStart > dateKey(today) || d.lastStart < oldest){ d.error = t('periodQ1Hint'); renderPeriodQuiz(); return; }
  } else if(d.step === 2){
    const v = Number(d.cycleLength);
    if(!inRange(v, PERIOD_LIMITS.cycle)){ d.error = t('periodCycleInvalid'); renderPeriodQuiz(); return; }
    d.cycleLength = v;
  } else if(d.step === 3){
    const v = Number(d.periodLength);
    if(!inRange(v, PERIOD_LIMITS.period) || v >= d.cycleLength){ d.error = t('periodLengthInvalid'); renderPeriodQuiz(); return; }
    d.periodLength = v;
  } else if(d.step === PERIOD_QUIZ_STEPS){
    Object.assign(state.period, { lastStart: d.lastStart, cycleLength: d.cycleLength, periodLength: d.periodLength,
      regular: d.regular, pain: d.pain, remindDays: d.remindDays, calendarReminder: d.calendarReminder, step: 'done', enabled: true });
    savePeriodSetup();
    periodDraft = null;
    closePeriodQuiz();
    render();
    return;
  }
  d.step++;
  d.error = '';
  renderPeriodQuiz();
}

function periodQuizBack(){
  const d = periodDraft;
  if(!d || d.step <= 1) return;
  d.step--; d.error = '';
  renderPeriodQuiz();
}
function openPeriodQuiz(){
  const p = state.period;
  const oldest = dateKey(addDays(today, -PERIOD_LIMITS.lastStartDays));
  // Start from the current setup; a start date that's too old becomes the
  // latest predicted start (still inside the window), else today.
  let last = p.lastStart;
  if(p.step === 'done' && last && last < oldest){ const c = dateKey(computePeriodCycleStart()); last = c >= oldest ? c : null; }
  if(!last || last < oldest || last > dateKey(today)) last = null;
  periodDraft = { step: 1, lastStart: last, cycleLength: p.cycleLength || 28, periodLength: p.periodLength || 5, error: '',
    regular: p.regular || '', pain: p.pain || '', remindDays: Number(p.remindDays) || 0, calendarReminder: !!p.calendarReminder };
  document.getElementById('period-quiz-overlay').classList.add('show');
  document.getElementById('period-quiz-sheet').classList.add('show');
  renderPeriodQuiz();
}

function closePeriodQuiz(){
  periodDraft = null; // cancelled: the existing setup is untouched
  document.getElementById('period-quiz-overlay').classList.remove('show');
  document.getElementById('period-quiz-sheet').classList.remove('show');
}
