/* ============ PERIOD TRACKING (Admin Panel, gender === 'female' only) ====
   All estimates, not medical advice: period days from the quiz answers,
   repeated every cycleLength; PMS = the 5 days before each predicted
   period; ovulation/fertile window = ~14 days before each predicted
   period (the luteal phase is the relatively constant part of a cycle). */
/* Cycle and period length as used everywhere: clamped to the setup's
   ranges, so data saved before those limits (a 3-day cycle, a 40-day
   period) can't break the ring, the calendar or the predictions. */
function periodCycleLen(){ return Math.min(45, Math.max(21, Number(state.period.cycleLength) || 28)); }
function periodLen(){ return Math.min(10, Math.max(2, Number(state.period.periodLength) || 5), periodCycleLen() - 1); }

function computePeriodCycleStart(){
  const p = { lastStart: state.period.lastStart, cycleLength: periodCycleLen() };
  const lastStart = new Date(p.lastStart + 'T00:00:00');
  const daysSince = Math.round((today - lastStart) / 86400000);
  const cyclesPassed = Math.floor(daysSince / p.cycleLength);
  return addDays(lastStart, cyclesPassed * p.cycleLength);
}

function periodDayCategories(){
  const p = { cycleLength: periodCycleLen(), periodLength: periodLen() };
  const currentCycleStart = computePeriodCycleStart();
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

function periodSummaryText(cats){
  const nextPeriodIdx = cats.indexOf('period');
  if(nextPeriodIdx === 0) return t('periodStartsToday');
  if(nextPeriodIdx > 0){
    return lang()==='fa' ? `${dig(nextPeriodIdx)} روز تا پریود بعدیت` : `${nextPeriodIdx} day${nextPeriodIdx===1?'':'s'} until your next period`;
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
function periodCycleSegments(){
  const len = periodCycleLen();
  const key = len + '|' + periodLen();
  if(periodSegCache.key === key) return periodSegCache.value;
  periodSegCache = { key, value: buildPeriodSegments(len) };
  return periodSegCache.value;
}

function buildPeriodSegments(len){
  const cats = new Array(len).fill('normal');
  const ovulation = len - 14;
  for(let d = ovulation - 4; d <= ovulation + 1; d++) if(d >= 0 && d < len) cats[d] = 'fertile';
  for(let d = len - 5; d < len; d++) if(d >= 0) cats[d] = 'pms';
  for(let d = 0; d < periodLen(); d++) cats[d] = 'period';
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

function periodWheelSvg(){
  const size = 240, c = size / 2, r = 94, gap = 0.035; // radians between arcs
  const { len, segments } = periodCycleSegments();
  const angle = day => (day / len) * 2 * Math.PI - Math.PI / 2;
  const arcs = segments.map((s, i) => {
    const a0 = angle(s.start) + gap / 2, a1 = angle(s.start + s.len) - gap / 2;
    return `<path class="period-arc" data-seg="${i}" d="${periodArcPath(c, c, r, a0, a1)}" stroke="${PERIOD_PHASE_COLOR[s.cat]}" tabindex="0" role="button" aria-label="${escapeAttr(t(PERIOD_PHASE_LABEL[s.cat]))}"></path>`;
  }).join('');
  const todayIdx = Math.min(len - 1, Math.max(0, daysBetween(computePeriodCycleStart(), today)));
  const ta = angle(todayIdx + 0.5);
  const todayDot = `<circle class="period-today-dot" cx="${(c + r * Math.cos(ta)).toFixed(2)}" cy="${(c + r * Math.sin(ta)).toFixed(2)}" r="7"></circle>`;
  return `<svg viewBox="0 0 ${size} ${size}" class="period-wheel">${arcs}${todayDot}</svg>`;
}

function periodCenterDefault(cats){
  const p = state.period;
  const day = daysBetween(computePeriodCycleStart(), today) + 1;
  const sub = lang() === 'fa' ? `روز ${dig(day)} از ${dig(periodCycleLen())}` : `Day ${day} of ${periodCycleLen()}`;
  return `<span class="period-center-main">${periodSummaryText(cats)}</span><span class="period-center-sub">${sub}</span>`;
}

function periodCenterForSegment(s){
  const from = addDays(computePeriodCycleStart(), s.start), to = addDays(from, s.len - 1);
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
  const { segments } = periodCycleSegments();
  const defaultHtml = center.innerHTML;
  let pinned = null; // tapped arc stays highlighted until tapped again
  const show = i => {
    wrap.querySelectorAll('.period-arc').forEach(a => a.classList.toggle('active', a.dataset.seg === String(i)));
    wrap.classList.toggle('has-active', i !== null);
    center.innerHTML = i === null ? defaultHtml : periodCenterForSegment(segments[i]);
    focusPhaseOnCalendar(i === null ? null : segments[i]);
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
    ` : ''}
  `;
}

/* میزکار pane content only (see renderDesktops) — no settings controls
   here at all (enable toggle, calendar reminder, edit-answers all moved
   to Settings → Period / renderPeriodSettings() above); this just shows
   the current status and tips. */
function renderPeriodPage(headerHtml){
  if(headerHtml === undefined) headerHtml = '';
  const p = state.period;
  if(!p.enabled){
    return `
      <div class="period-themed">
      ${headerHtml}
      <div class="empty-hint">${t('periodOffHint')}</div>
      </div>
    `;
  }
  const trackerBody = p.step !== 'done' ? `
    <div class="store-card">
      <div class="empty-hint">${t('periodTrackerDesc')}</div>
      <button class="btn btn-primary" style="width:100%; margin-top:12px;" data-action="period-quiz-start">${ICONS.dropIcon} ${t('startBtn')}</button>
    </div>
  ` : (() => {
    const cats = periodDayCategories();
    return `
      <div class="store-card">
        <div class="period-wheel-wrap">
          ${periodWheelSvg()}
          <div class="period-wheel-center" dir="${lang()==='fa'?'rtl':'ltr'}" aria-live="polite">${periodCenterDefault(cats)}</div>
        </div>
        <div class="period-legend">
          <span class="period-legend-item"><span class="dot" style="background:var(--period-flow);"></span>${t('legendPeriod')}</span>
          <span class="period-legend-item"><span class="dot" style="background:var(--period-pms);"></span>${t('legendPms')}</span>
          <span class="period-legend-item"><span class="dot" style="background:var(--period-fertile);"></span>${t('legendFertile')}</span>
        </div>
        <div class="empty-hint" style="margin-top:12px;">${t('periodDisclaimer')}</div>
      </div>
    `;
  })();
  return `
    <div class="period-themed">
    ${headerHtml}
    ${trackerBody}
    <div class="section-title">${t('tipsTitle')}</div>
    ${periodTipsHtml()}
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

/* The quiz works on a draft; the real setup only changes on "Finish", so
   closing it half way leaves an existing setup exactly as it was. */
let periodDraft = null;

function periodQuizStepHtml(){
  const d = periodDraft;
  const err = d.error ? `<div class="auth-field-error">${escapeHtml(d.error)}</div>` : '';
  if(d.step === 1){
    return `
      <div class="period-quiz-step">
        <div class="field">
          <label class="field-label">${t('periodQ1')}</label>
          <button type="button" class="date-field-btn" id="period-q1">${d.lastStart ? formatDateLabel(d.lastStart) : t('periodQ1')}${ICONS.calendarIcon}</button>
          <div class="period-q-hint">${t('periodQ1Hint')}</div>${err}
        </div>
        <button class="btn btn-primary" style="width:100%;" data-action="period-quiz-next">${t('nextBtn')}</button>
      </div>
    `;
  }
  if(d.step === 2){
    return `
      <div class="period-quiz-step">
        <div class="field">
          <label class="field-label">${t('periodQ2')}</label>
          <input type="number" inputmode="numeric" id="period-q2" value="${d.cycleLength}" min="${PERIOD_LIMITS.cycle[0]}" max="${PERIOD_LIMITS.cycle[1]}">
          <div class="period-q-hint">${t('periodQ2Hint')}</div>${err}
        </div>
        <button class="btn btn-primary" style="width:100%;" data-action="period-quiz-next">${t('nextBtn')}</button>
      </div>
    `;
  }
  return `
    <div class="period-quiz-step">
      <div class="field">
        <label class="field-label">${t('periodQ3')}</label>
        <input type="number" inputmode="numeric" id="period-q3" value="${d.periodLength}" min="${PERIOD_LIMITS.period[0]}" max="${PERIOD_LIMITS.period[1]}">
        <div class="period-q-hint">${t('periodQ3Hint')}</div>${err}
      </div>
      <button class="btn btn-primary" style="width:100%;" data-action="period-quiz-finish">${t('finishBtn')}</button>
    </div>
  `;
}

function renderPeriodQuiz(){
  const d = periodDraft;
  if(!d) return;
  const dots = [1,2,3].map(n => `<span class="${d.step===n?'active':''}"></span>`).join('');
  document.getElementById('period-quiz-body').innerHTML = `<div class="period-quiz-dots">${dots}</div>${periodQuizStepHtml()}`;
  document.getElementById('period-q1')?.addEventListener('click', () => openDatePicker({
    title: t('periodQ1'), value: d.lastStart, max: dateKey(today), min: dateKey(addDays(today, -PERIOD_LIMITS.lastStartDays)),
    onPick: v => { d.lastStart = v; d.error = ''; renderPeriodQuiz(); },
  }));
  document.getElementById('period-q2')?.addEventListener('input', e => { d.cycleLength = e.target.value; });
  document.getElementById('period-q3')?.addEventListener('input', e => { d.periodLength = e.target.value; });
}

/* "Next" / "Finish": check this step's answer, stay on it with a message
   if it's out of range. */
function periodQuizNext(){
  const d = periodDraft;
  const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;
  if(d.step === 1){
    const oldest = dateKey(addDays(today, -PERIOD_LIMITS.lastStartDays));
    if(!d.lastStart || d.lastStart > dateKey(today) || d.lastStart < oldest){ d.error = t('periodQ1Hint'); renderPeriodQuiz(); return; }
    d.step = 2;
  } else if(d.step === 2){
    const v = Number(d.cycleLength);
    if(!inRange(v, PERIOD_LIMITS.cycle)){ d.error = t('periodCycleInvalid'); renderPeriodQuiz(); return; }
    d.cycleLength = v; d.step = 3;
  } else {
    const v = Number(d.periodLength);
    if(!inRange(v, PERIOD_LIMITS.period) || v >= d.cycleLength){ d.error = t('periodLengthInvalid'); renderPeriodQuiz(); return; }
    Object.assign(state.period, { lastStart: d.lastStart, cycleLength: d.cycleLength, periodLength: v, step: 'done' });
    periodDraft = null;
    closePeriodQuiz();
    render();
    return;
  }
  d.error = '';
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
  periodDraft = { step: 1, lastStart: last, cycleLength: p.cycleLength || 28, periodLength: p.periodLength || 5, error: '' };
  document.getElementById('period-quiz-overlay').classList.add('show');
  document.getElementById('period-quiz-sheet').classList.add('show');
  renderPeriodQuiz();
}

function closePeriodQuiz(){
  periodDraft = null; // cancelled: the existing setup is untouched
  document.getElementById('period-quiz-overlay').classList.remove('show');
  document.getElementById('period-quiz-sheet').classList.remove('show');
}
