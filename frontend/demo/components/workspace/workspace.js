function renderHome(){
  const d = state.homeDate;
  const {tasks, habits, events} = itemsForDate(d);
  /* The day summary card follows its setting (planningDaySummary) on
     both phone and desktop. */
  return renderDesktops(d, {tasks, habits, events});
}

/* "Today's occasions" pane for the "اصلی" desktop — real data now (see
   occasionsForDate/OCCASIONS_DATA above), for the currently-viewed date
   `d`, not hardcoded to today, so paging the home date updates it too. */
function renderOccasionsPane(d, events){
  const items = visibleOccasionsForDate(d); // null while still loading
  const occasionsHtml = items === null ? `<div class="empty-hint">…</div>` : (() => {
    return items.length ? items.map(it => `<div class="occasion-row ${it.is_holiday?'holiday':''}">${it.is_holiday?`<span class="occasion-holiday-dot"></span>`:''}${escapeHtml(it.event_name)}</div>`).join('') : '';
  })();
  const dayEvents = pref('occasionsShowEvents') ? (events || []) : [];
  const eventsHtml = dayEvents.length ? `
    <div class="section-title">${t('events')} <span class="count">${dig(dayEvents.length)}</span></div>
    <div class="events-scroll">${sortEvents(dayEvents).map(e=>eventCard(e)).join('')}</div>
  ` : '';
  const share = `<div class="occ-share-row"><button type="button" class="btn btn-outline btn-small" data-action="share-day">${ICONS.shareIcon}<span>${t('shareDay')}</span></button></div>`;
  if(!occasionsHtml && !eventsHtml) return `<div class="empty-hint">${t('noOccasionsToday')}</div>` + prayerBlockHtml(d) + share;
  return occasionsHtml + eventsHtml + prayerBlockHtml(d) + share;
}

/* The day's prayer times (js/core/prayer.js) for the chosen city; on today
   the next one is marked. The city name opens its setting. */
const PRAYER_SHOWN = [['fajr', 'prFajr'], ['sunrise', 'prSunrise'], ['dhuhr', 'prDhuhr'], ['sunset', 'prSunset'], ['maghrib', 'prMaghrib'], ['midnight', 'prMidnight']];
function prayerBlockHtml(d){
  if(!featureOn('prayer') || !pref('prayerShow')) return '';
  const times = prayerTimesFor(d, prayerCityId()), city = prayerCity(prayerCityId());
  const now = Date.now(), isToday = dateKey(d) === dateKey(new Date());
  const next = isToday ? (PRAYER_SHOWN.find(([k]) => times[k].at > now) || [])[0] : null;
  return `<div class="prayer-block">
    <div class="section-title">${t('prayerTimes')}
      <button type="button" class="link-btn prayer-city" data-action="open-prayer-settings">${escapeHtml(t('prayerIn').replace('{city}', lang() === 'fa' ? city.fa : city.en))}</button></div>
    <div class="prayer-grid">${PRAYER_SHOWN.map(([k, label]) => `<div class="prayer-cell ${k === next ? 'next' : ''}"><span class="lbl">${t(label)}</span><span class="hm">${dig(times[k].hm)}</span></div>`).join('')}</div>
  </div>`;
}

/* "Share this day": its date in every calendar, its occasions and the site's
   address, through the phone's share sheet (the Android app's bridge,
   js/core/android.js) or copied when there's none. Never anyone's own items. */
function shareDay(d){
  const occ = (visibleOccasionsForDate(d) || []).map(o => '• ' + o.event_name + (o.is_holiday ? ' (' + t('holidayWord') + ')' : ''));
  const text = [dayLabel(d), dayAllCalendarsLine(d)].concat(occ).filter(Boolean).join('\n');
  const url = 'https://toojibee.ir/';
  trackEvent('share'); // opt-in anonymous count (js/core/stats.js)
  if(navigator.share) navigator.share({ title: t('appName'), text, url }).catch(() => {});
  else { copyText(text + '\n' + url); showToast(t('linkCopied')); }
}

/* "۴ آبان ۱۴۰۵ · 26 October 2026 · ۱۴ جمادی‌الاول ۱۴۴۸": the day in each enabled calendar. */
function dayAllCalendarsLine(d){
  const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
  const j = toJalali(y, m, dd), h = toHijri(y, m, dd), on = state.settings.calendarEnabled || {};
  return [
    on.jalali !== false ? `${toSysDigits(j.jd, 'jalali')} ${jalaliMonthName(j.jm - 1)} ${toSysDigits(j.jy, 'jalali')}` : '',
    on.gregorian !== false ? `${toSysDigits(dd, 'gregorian')} ${monthName(m - 1)} ${toSysDigits(y, 'gregorian')}` : '',
    on.hijri !== false ? `${toSysDigits(h.hd, 'hijri')} ${hijriMonthName(h.hm - 1)} ${toSysDigits(h.hy, 'hijri')}` : '',
  ].filter(Boolean).join(' · ');
}

/* The three swipeable "desktops" described in the plan: occasions (the
   "main" one — daily occasions from the self-hosted dataset above),
   planning (the pre-existing home content, unchanged), and period
   (reuses renderPeriodPage()'s body, just with the banner header instead
   of the Settings back-button header) — shown only when the profile's
   gender is 'female', same gate Settings/Management already used. */
/* Articles the admin panel placed on this desk (SITE_ARTICLES, loaded
   from our own API in js/app.js): a row of cards that open the article
   on the site. Nothing without a backend or when none are placed. */
function renderArticleStrip(place){
  const list = (SITE_ARTICLES[lang()] || {})[place] || [];
  if(!list.length) return '';
  // Only our own addresses: the article page and /uploads covers.
  const safe = list.filter(a => /^\/(fa|en)\/articles\/[a-z0-9-]+\/$/.test(a.url) && (!a.cover || /^\/uploads\/[a-f0-9]{32}\.(webp|jpg|png)$/.test(a.cover)));
  if(!safe.length) return '';
  return `
    <div class="section-title desk-articles-title">${t('articlesTitle')}</div>
    <div class="desk-articles">${safe.map(a => `
      <a class="desk-article" href="${a.url}" target="_blank" rel="noopener">
        ${a.cover ? `<img src="${a.cover}" alt="" loading="lazy">` : ''}
        <span class="desk-article-title">${escapeHtml(a.title)}</span>
        ${a.summary ? `<span class="desk-article-sub">${escapeHtml(a.summary)}</span>` : ''}
      </a>`).join('')}
    </div>`;
}

/* Which desks show, in order (also used to jump to one: search, a group link). */
function deskKeys(){
  const keys = [];
  /* Planning is the main desk: always there for an account and always
     first, so signing in or opening the app lands on it (the owner's
     request, 2026-10-25). Guests only browse the calendar and occasions. */
  if(!state.guest) keys.push('planning');
  if(pref('occasionsEnabled')) keys.push('occasionsDesktop');
  if(pref('groupsEnabled') && groupsAvailable()) keys.push('groupsDesktop'); // needs our API and an account
  if(periodViews().length) keys.push('periodDesktop'); // her own cycle and/or ones friends share with this person
  return keys;
}

function renderDesktops(d, data){
  const {tasks, habits, events} = data;
  const panes = deskKeys().map(key => {
    if(key === 'occasionsDesktop') return { key, html: renderOccasionsPane(d, events) };
    if(key === 'planning') return { key, html:`
      ${window.innerWidth >= 960 ? renderHomeCalWidget() : ''}
      ${pref('planningDaySummary') ? renderDayStatsCard(tasks, habits, events, d) : ''}
      ${renderItemSections(tasks, habits, events, d)}
    ` };
    if(key === 'groupsDesktop') return { key, html: renderGroupsPane(d) };
    return { key, html: renderPeriodPage('') + renderArticleStrip('app_period') };
  });
  /* Every desktop switched off: on a phone the app becomes a full-screen
     month calendar (no workspace box under it); on desktop the calendar
     column already fills the left, so the box just says how to get one back. */
  if(!panes.length){
    state.activeDesktopIndex = 0;
    syncPeriodDeskOnCalendar(null);
    if(window.innerWidth < 960) return renderHomeCalWidget(true);
    return `<div class="desktop-box desktop-box-empty"><div class="empty-hint">${t('noDesktopsEnabled')}</div></div>`;
  }
  // Clamp in case the pane count just shrank (e.g. gender toggled off,
  // dropping the period pane) out from under whatever was active.
  state.activeDesktopIndex = Math.max(0, Math.min(state.activeDesktopIndex || 0, panes.length - 1));
  const activeKey = panes[state.activeDesktopIndex]?.key || 'workspace';
  syncPeriodDeskOnCalendar(activeKey);
  const atStart = state.activeDesktopIndex <= 0;
  const atEnd = state.activeDesktopIndex >= panes.length - 1;
  return `
    ${window.innerWidth < 960 ? renderHomeCalWidget() : ''}
    <div class="desktop-box ${activeKey==='periodDesktop'?'period-mode':''}">
      <div class="desktop-box-topbar">
        <button type="button" class="desk-full-btn" data-action="toggle-desk-full" aria-pressed="${!!state.deskFull}" aria-label="${t(state.deskFull ? 'deskExitFull' : 'deskFull')}" title="${t(state.deskFull ? 'deskExitFull' : 'deskFull')}">
          ${state.deskFull
            ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 4h2v7H4V9h3.6L3.3 4.7l1.4-1.4L9 7.6V4zm6 16h-2v-7h7v2h-3.6l4.3 4.3-1.4 1.4-4.3-4.3V20z"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h7v2H7.4l4.3 4.3-1.4 1.4L6 7.4V11H4V4zm16 16h-7v-2h3.6l-4.3-4.3 1.4-1.4 4.3 4.3V13h2v7z"/></svg>'}
        </button>
        <div class="desktop-box-title-group">
          <button type="button" class="desktop-nav-arrow ${atStart?'disabled':''}" data-action="desktop-step" data-dir="-1" aria-label="${t('prev')}">${ICONS.chevronLeft}</button>
          <div class="desktop-box-title" id="desktop-box-title" data-action="toggle-desktop-title-menu">${t(activeKey)}</div>
          <button type="button" class="desktop-nav-arrow ${atEnd?'disabled':''}" data-action="desktop-step" data-dir="1" aria-label="${t('next')}">${ICONS.chevronRight}</button>
          ${state.desktopTitleMenuOpen ? `
            <div class="cal-dropdown" id="desktop-title-menu" style="top:calc(100% + 6px);">
              ${panes.map((p,i) => `<div class="cal-dropdown-item ${i===state.activeDesktopIndex?'active':''}" data-action="goto-desktop" data-i="${i}">${t(p.key)}</div>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
      <div class="desktop-wrap" id="desktop-wrap">
        <div class="desktop-track" id="desktop-track">
          ${panes.map(p => `<div class="desktop-pane ${p.key==='periodDesktop'?'period-pane':''}">${p.html}</div>`).join('')}
        </div>
      </div>
      <div class="desktop-dots" id="desktop-dots">
        ${panes.map((p,i) => `<span class="${i===state.activeDesktopIndex?'active':''}" data-action="goto-desktop" data-i="${i}" data-key="${p.key}" aria-label="${t(p.key)}"></span>`).join('')}
      </div>
    </div>
  `;
}

/* Updates the box title + prev/next arrow disabled state to match pane
   `i`, without a full render() — used both for click navigation and for
   the live drag/swipe sync below, neither of which should pay for a
   full re-render just to keep this topbar in sync. */
function syncDesktopTopbar(i){
  const dots = document.getElementById('desktop-dots');
  if(!dots) return;
  const dotEls = Array.from(dots.children);
  const key = dotEls[i]?.dataset.key;
  const titleEl = document.getElementById('desktop-box-title');
  if(titleEl && key) titleEl.textContent = t(key);
  // The period desk has its own palette, frame included (period.css).
  dots.closest('.desktop-box')?.classList.toggle('period-mode', key === 'periodDesktop');
  syncPeriodDeskOnCalendar(key);
  const arrows = document.querySelectorAll('.desktop-nav-arrow');
  if(arrows[0]) arrows[0].classList.toggle('disabled', i <= 0);
  if(arrows[1]) arrows[1].classList.toggle('disabled', i >= dotEls.length - 1);
}

function goToDesktopIndex(i){
  state.activeDesktopIndex = i;
  const wrap = document.getElementById('desktop-wrap');
  if(wrap){ desktopPagerProgrammatic = true; wrap.scrollTo({ left: i * wrap.clientWidth, behavior:'smooth' }); }
  // Title, arrows and dots go straight to the target (the scroll listener
  // stays quiet until the animation settles).
  document.querySelectorAll('#desktop-dots span').forEach((el, idx) => el.classList.toggle('active', idx === i));
  syncDesktopTopbar(i);
  tourWatch();
}

function attachDesktopPager(){
  const wrap = document.getElementById('desktop-wrap');
  const dots = document.getElementById('desktop-dots');
  if(!wrap || !dots) return;
  const dotEls = Array.from(dots.children);
  /* render() rebuilds this whole pager from scratch on every call (any
     action anywhere re-renders), which would otherwise reset a fresh
     #desktop-wrap's scrollLeft to 0 — snapping the user back to the
     first ("اصلی"/occasions) pane no matter which one they were
     actually on. Restore the persisted pane instantly (no animation;
     this isn't a user-initiated navigation) right after the fresh DOM
     is wired up. */
  wrap.scrollLeft = (state.activeDesktopIndex || 0) * wrap.clientWidth;
  let raf = null, settleTimer = null;
  let shownIndex = state.activeDesktopIndex || 0;
  wrap.addEventListener('scroll', () => {
    // Live dot/title sync during a finger swipe — purely visual, never
    // written to state here. Skipped while a programmatic jump (title
    // menu, arrows, dots) is animating: that already shows its target,
    // and following every in-between frame made the title flicker
    // through the panes it passed. abs(): scrollLeft is negative in RTL.
    if(!raf && !desktopPagerProgrammatic){
      raf = requestAnimationFrame(() => {
        raf = null;
        const i = Math.max(0, Math.min(dotEls.length - 1, Math.round(Math.abs(wrap.scrollLeft) / wrap.clientWidth)));
        if(i === shownIndex) return; // only when it actually changes
        shownIndex = i;
        dotEls.forEach((el, idx) => el.classList.toggle('active', idx === i));
        syncDesktopTopbar(i);
      });
    }
    /* Only COMMIT the active pane to state once scroll events have
       stopped arriving for a beat — not on every mid-animation frame.
       A smooth-scroll (from goto-desktop/the wheel switcher) fires a
       stream of scroll events while in flight; committing a mid-flight
       frame's rounded position is a real race: if an unrelated render()
       happens to land in that exact window, it rebuilds the pager and
       instantly jumps to whatever (wrong, transient) index was last
       committed, undoing the navigation the user just made. */
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if(desktopPagerProgrammatic){ desktopPagerProgrammatic = false; shownIndex = state.activeDesktopIndex; return; }
      state.activeDesktopIndex = Math.round(Math.abs(wrap.scrollLeft) / wrap.clientWidth);
      tourWatch();
    }, 120);
  }, {passive:true});
  /* Only a genuinely horizontal wheel/trackpad gesture switches
     میزکار desktops — vertical scroll must always reach each pane's own
     content underneath (.desktop-pane's overflow-y:auto) so a long
     pane (e.g. period's wheel+tips) can actually be scrolled
     with a plain mouse wheel. An earlier version also treated a *plain*
     vertical wheel as "switch panes" (reasoning that some mice have no
     horizontal wheel at all), but that unconditionally called
     preventDefault() on every vertical scroll over the pager — which
     silently broke scrolling a tall pane's content entirely. Removed;
     a mouse without horizontal scroll support just can't wheel-switch
     panes here (the dots and swipe/drag still work). */
  /* A single physical trackpad swipe fires a whole burst of wheel events
     (a ramp-up then an inertial decelerating tail), not one atomic
     event — reacting to the first event in that burst and then only
     locking out new ones for a fixed 350ms let a slow/long swipe's
     later tail events slip past the lockout and trigger a *second*
     step change, so one swipe could jump two panes instead of one.
     Instead, treat the whole burst as a single gesture: accumulate
     deltaX and only act once, after wheel events stop arriving for a
     beat (gestureIdleTimer) — exactly one step per physical swipe,
     regardless of how long its tail runs. */
  let gestureDeltaX = 0, gestureIdleTimer = null, navigating = false;
  wrap.addEventListener('wheel', e => {
    if(Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical (or ambiguous): let it scroll the pane's content natively
    e.preventDefault();
    if(navigating) return;
    gestureDeltaX += e.deltaX;
    clearTimeout(gestureIdleTimer);
    gestureIdleTimer = setTimeout(() => {
      const dir = gestureDeltaX > 0 ? 1 : -1;
      gestureDeltaX = 0;
      const i = Math.max(0, Math.min(dotEls.length - 1, Math.round(wrap.scrollLeft / wrap.clientWidth) + dir));
      if(i === state.activeDesktopIndex){ return; }
      navigating = true;
      goToDesktopIndex(i);
      setTimeout(() => { navigating = false; }, 350);
    }, 60);
  }, { passive:false });
}

/* Small dashboard-style stat card: a progress ring for the day's overall
   completion + a 3-line breakdown. Numbers animate in on every render via
   animateDayStats() (called from render()), not just on first paint. */
const STAT_RING_CIRC = 2 * Math.PI * 42;

/* The day's numbers for the card: what share of the ring each kind's
   done items fill (tasks then habits, each in its own color). */
function dayStats(d){
  const key = dateKey(d);
  const { tasks, habits } = itemsForDate(d);
  const doneTasks = tasks.filter(x => taskStatusOn(x, key) === 'done').length;
  const doneHabits = habits.filter(h => h.completedDates.includes(key)).length;
  const total = tasks.length + habits.length;
  return {
    tasks, habits, doneTasks, doneHabits,
    pct: total ? Math.round((doneTasks + doneHabits) / total * 100) : 0,
    taskFrac: total ? doneTasks / total : 0, habitFrac: total ? doneHabits / total : 0,
  };
}

function renderDayStatsCard(tasks, habits, events, d){
  const s = dayStats(d);
  return `
    <div class="stat-card" id="day-stat-card" data-pct="${s.pct}" data-task-frac="${s.taskFrac}" data-habit-frac="${s.habitFrac}">
      <div class="stat-ring-wrap">
        <svg viewBox="0 0 100 100" class="stat-ring">
          <circle cx="50" cy="50" r="42" class="stat-ring-track"></circle>
          <circle cx="50" cy="50" r="42" class="stat-ring-progress stat-ring-habits" id="stat-ring-habits" stroke-dasharray="0 ${STAT_RING_CIRC}"></circle>
          <circle cx="50" cy="50" r="42" class="stat-ring-progress stat-ring-tasks" id="stat-ring-progress" stroke-dasharray="0 ${STAT_RING_CIRC}"></circle>
        </svg>
        <div class="stat-ring-label"><span id="stat-ring-pct">0%</span></div>
      </div>
      <div class="stat-mini-list">
        <div class="stat-mini"><span class="stat-dot" style="background:var(--task-color)"></span>${t('tasks')} <b>${dig(s.doneTasks)}/${dig(tasks.length)}</b></div>
        <div class="stat-mini"><span class="stat-dot" style="background:var(--habit-color)"></span>${t('habits')} <b>${dig(s.doneHabits)}/${dig(habits.length)}</b></div>
        <div class="stat-mini"><span class="stat-dot" style="background:var(--event-color)"></span>${t('events')} <b>${dig(events.length)}</b></div>
      </div>
    </div>
  `;
}

function animateDayStats(){
  const card = document.getElementById('day-stat-card');
  const ring = document.getElementById('stat-ring-progress');
  const habitRing = document.getElementById('stat-ring-habits');
  const label = document.getElementById('stat-ring-pct');
  if(!card || !ring || !label) return;
  const pct = Number(card.dataset.pct) || 0;
  // Tasks' arc first, the habits' arc right after it.
  const taskLen = STAT_RING_CIRC * (Number(card.dataset.taskFrac) || 0);
  const habitLen = STAT_RING_CIRC * (Number(card.dataset.habitFrac) || 0);
  requestAnimationFrame(() => {
    ring.style.strokeDasharray = `${taskLen} ${STAT_RING_CIRC}`;
    if(habitRing){ habitRing.style.strokeDasharray = `${habitLen} ${STAT_RING_CIRC}`; habitRing.style.strokeDashoffset = -taskLen; }
  });

  const start = Number(label.dataset.animFrom || 0);
  const duration = 500;
  const t0 = performance.now();
  function step(now){
    const p = Math.min(1, (now - t0) / duration);
    const val = Math.round(start + (pct - start) * p);
    label.textContent = dig(val) + '%';
    if(p < 1) requestAnimationFrame(step); else label.dataset.animFrom = pct;
  }
  requestAnimationFrame(step);
}

/* Recomputes and animates the stat card's ring/percentage and the
   tasks/habits mini-counts in place, without touching any other DOM —
   used after toggling a task/habit so the whole page never re-renders
   just because a checkbox was tapped (see the toggle-task/habit/pin
   action handlers). The card node persists, so animateDayStats() eases
   from its current value instead of restarting from 0. */
function updateDayStatsInPlace(){
  const card = document.getElementById('day-stat-card');
  if(!card) return;
  const s = dayStats(state.homeDate);
  card.dataset.pct = s.pct;
  card.dataset.taskFrac = s.taskFrac;
  card.dataset.habitFrac = s.habitFrac;
  animateDayStats();
  const counts = card.querySelectorAll('.stat-mini b');
  if(counts[0]) counts[0].textContent = `${dig(s.doneTasks)}/${dig(s.tasks.length)}`;
  if(counts[1]) counts[1].textContent = `${dig(s.doneHabits)}/${dig(s.habits.length)}`;
}

/* Expand/collapse the merged calendar widget — reversed from the old
   behavior by request: scrolling DOWN into the agenda never expands it
   anymore (it collapses back to the week strip instead). The month view
   only opens via a "pull" gesture at the very top of the page: mouse
   wheel scrolled up, or a touch/pointer drag downward, while already at
   scrollTop 0. Nothing here calls preventDefault, so native scrolling
   (wheel and touch) stays completely unaffected either way. */
function initHomeScrollExpand(){
  const el = document.getElementById('page-home');
  /* The page itself no longer scrolls on phones — the workspace panes
     do. "Scrolled away from the top" therefore means the pane under the
     pointer (or the page, on layouts where it still scrolls). Scroll
     events don't bubble, hence the capture listener for the panes. */
  const paneOf = target => target && target.closest ? target.closest('.desktop-pane') : null;
  const scrolledFrom = target => (paneOf(target)?.scrollTop || 0) + el.scrollTop;
  el.addEventListener('scroll', (e) => {
    const t = e.target;
    if(t !== el && !(t.classList && t.classList.contains('desktop-pane'))) return; // the horizontal pager, tips, etc.
    if(t.scrollTop > 4 && state.calDensity !== 'compact'){
      setCalDensity('compact');
    }
  }, { passive: true, capture: true });

  el.addEventListener('wheel', (e) => {
    // Horizontal scroll here no longer changes the day at all (removed
    // per explicit request — it was firing on any left/right scroll
    // over the page, which read as a bug, not a gesture).
    if(Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if(scrolledFrom(e.target) <= 0 && e.deltaY < -10 && state.calDensity !== 'full'){
      setCalDensity('full');
    }
  }, { passive: true });

  let pullStartY = null, pullActive = false;
  el.addEventListener('pointerdown', (e) => {
    pullActive = scrolledFrom(e.target) <= 0;
    pullStartY = e.clientY;
  }, { passive: true });
  el.addEventListener('pointermove', (e) => {
    if(!pullActive || pullStartY === null || state.calDensity === 'full') return;
    if(e.clientY - pullStartY > 50){
      setCalDensity('full');
      pullActive = false;
    }
  }, { passive: true });
  el.addEventListener('pointerup', () => { pullActive = false; pullStartY = null; }, { passive: true });
  el.addEventListener('pointercancel', () => { pullActive = false; pullStartY = null; }, { passive: true });
}

/* Set true by any code that programmatically drives #desktop-wrap's
   scroll (goto-desktop, the wheel switcher) right before calling
   scrollTo — attachDesktopPager()'s own scroll listener checks it so
   it never "corrects" state.activeDesktopIndex from a mid-animation
   scrollLeft reading back to the pane the user just navigated away
   from. The index is already known synchronously at the moment of a
   programmatic navigation; the scroll listener only needs to infer it
   for organic touch-swipe/drag, which never sets this flag. */
let desktopPagerProgrammatic = false;
