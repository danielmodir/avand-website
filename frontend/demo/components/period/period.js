/* ============ PERIOD TRACKING (Admin Panel, gender === 'female' only) ====
   All estimates, not medical advice: period days from the quiz answers,
   repeated every cycleLength; PMS = the 5 days before each predicted
   period; ovulation/fertile window = ~14 days before each predicted
   period (the luteal phase is the relatively constant part of a cycle). */
function computePeriodCycleStart(){
  const p = state.period;
  const lastStart = new Date(p.lastStart + 'T00:00:00');
  const daysSince = Math.round((today - lastStart) / 86400000);
  const cyclesPassed = Math.floor(daysSince / p.cycleLength);
  return addDays(lastStart, cyclesPassed * p.cycleLength);
}

function periodDayCategories(){
  const p = state.period;
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
    return lang()==='fa' ? `${nextPeriodIdx} روز تا پریود بعدیت` : `${nextPeriodIdx} day${nextPeriodIdx===1?'':'s'} until your next period`;
  }
  return '';
}

function periodWheelSvg(cats){
  const size=240, cx=size/2, cy=size/2, rOuter=104, rInner=74;
  const colorFor = c => c==='period' ? 'var(--danger)' : c==='pms' ? 'var(--pms)' : c==='fertile' ? 'var(--secondary)' : 'var(--border)';
  let ticks = '';
  for(let i=0;i<30;i++){
    const angle = (i/30)*2*Math.PI - Math.PI/2;
    const x1 = (cx + rInner*Math.cos(angle)).toFixed(1), y1 = (cy + rInner*Math.sin(angle)).toFixed(1);
    const x2 = (cx + rOuter*Math.cos(angle)).toFixed(1), y2 = (cy + rOuter*Math.sin(angle)).toFixed(1);
    const isToday = i===0;
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colorFor(cats[i])}" stroke-width="${isToday?5:3}" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" class="period-wheel">${ticks}</svg>`;
}

/* Compact entry card shown in Management. Just the toggle, a settings
   gear (jumps straight into the quiz for editing), title/description,
   and an Open button into the full page below — the actual quiz, wheel,
   articles and tips all live in renderPeriodPage(), not here. */
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
   the current status, tips and articles. */
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
          ${periodWheelSvg(cats)}
          <div class="period-wheel-center">${periodSummaryText(cats)}</div>
        </div>
        <div class="period-legend">
          <span class="period-legend-item"><span class="dot" style="background:var(--danger);"></span>${t('legendPeriod')}</span>
          <span class="period-legend-item"><span class="dot" style="background:var(--pms);"></span>${t('legendPms')}</span>
          <span class="period-legend-item"><span class="dot" style="background:var(--secondary);"></span>${t('legendFertile')}</span>
        </div>
        <div class="empty-hint" style="margin-top:12px;">${t('periodDisclaimer')}</div>
      </div>
    `;
  })();
  const articleCount = 4;
  return `
    <div class="period-themed">
    ${headerHtml}
    ${trackerBody}
    <div class="section-title">${t('tipsTitle')}</div>
    <div class="tips-card">
      <div class="tips-card-text" id="period-tip-text"></div>
    </div>
    <div class="section-title">${t('articlesTitle')}</div>
    <div class="articles-scroll">
      ${Array.from({length: articleCount}, (_, idx) => idx + 1).map(i => `
        <div class="article-card" data-action="open-article">
          <div class="article-row-icon">${ICONS.infoIcon}</div>
          <div class="article-row-title">${t('article'+i+'Title')}</div>
          <div class="article-row-desc">${t('article'+i+'Desc')}</div>
        </div>
      `).join('')}
    </div>
    </div>
  `;
}

/* Rotating tips, typed out character by character and swapped every few
   seconds. Runs via setInterval against a fixed element id, never via
   render() — so it can never trigger the kind of full-page re-render
   that caused the earlier scroll/animation bug. Always cleared before a
   new one starts so leaving and reopening the page can't stack timers. */
const PERIOD_TIPS = ['tip1','tip2','tip3','tip4','tip5','tip6'];

let periodTipsTimer = null;

function stopPeriodTipsRotator(){
  clearTimeout(periodTipsTimer);
  periodTipsTimer = null;
}

function startPeriodTipsRotator(){
  stopPeriodTipsRotator();
  const el = document.getElementById('period-tip-text');
  if(!el) return;
  let tipIndex = 0;
  const typeTip = () => {
    const text = t(PERIOD_TIPS[tipIndex]);
    let i = 0;
    const type = () => {
      el.innerHTML = escapeHtml(text.slice(0, i)) + '<span class="caret"></span>';
      i++;
      if(i <= text.length){
        periodTipsTimer = setTimeout(type, 22);
      } else {
        periodTipsTimer = setTimeout(() => {
          tipIndex = (tipIndex + 1) % PERIOD_TIPS.length;
          typeTip();
        }, 3200);
      }
    };
    type();
  };
  typeTip();
}

function periodQuizStepHtml(){
  const p = state.period;
  if(p.step === 1){
    return `
      <div class="period-quiz-step">
        <div class="field">
          <label class="field-label">${t('periodQ1')}</label>
          <input type="date" id="period-q1" value="${escapeAttr(p.lastStart)}" max="${dateKey(today)}">
        </div>
        <button class="btn btn-primary" style="width:100%;" data-action="period-quiz-next">${t('nextBtn')}</button>
      </div>
    `;
  }
  if(p.step === 2){
    return `
      <div class="period-quiz-step">
        <div class="field">
          <label class="field-label">${t('periodQ2')}</label>
          <input type="number" id="period-q2" value="${p.cycleLength}" min="15" max="60">
        </div>
        <button class="btn btn-primary" style="width:100%;" data-action="period-quiz-next">${t('nextBtn')}</button>
      </div>
    `;
  }
  return `
    <div class="period-quiz-step">
      <div class="field">
        <label class="field-label">${t('periodQ3')}</label>
        <input type="number" id="period-q3" value="${p.periodLength}" min="1" max="14">
      </div>
      <button class="btn btn-primary" style="width:100%;" data-action="period-quiz-finish">${t('finishBtn')}</button>
    </div>
  `;
}

function renderPeriodQuiz(){
  const p = state.period;
  const dots = [1,2,3].map(n => `<span class="${p.step===n?'active':''}"></span>`).join('');
  document.getElementById('period-quiz-body').innerHTML = `<div class="period-quiz-dots">${dots}</div>${periodQuizStepHtml()}`;
  document.getElementById('period-q1')?.addEventListener('input', e => { state.period.lastStart = e.target.value; });
  document.getElementById('period-q2')?.addEventListener('input', e => { const v = Number(e.target.value); if(v>0) state.period.cycleLength = v; });
  document.getElementById('period-q3')?.addEventListener('input', e => { const v = Number(e.target.value); if(v>0) state.period.periodLength = v; });
}

function openPeriodQuiz(){
  state.period.step = 1;
  document.getElementById('period-quiz-overlay').classList.add('show');
  document.getElementById('period-quiz-sheet').classList.add('show');
  renderPeriodQuiz();
}

function closePeriodQuiz(){
  document.getElementById('period-quiz-overlay').classList.remove('show');
  document.getElementById('period-quiz-sheet').classList.remove('show');
}
