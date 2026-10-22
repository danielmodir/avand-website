/* What a guest (API configured, not signed in) may do without an account:
   look around the calendar and the occasions. Every other action opens
   the sign-in popup instead (requireAccount). */
const GUEST_ACTIONS = new Set([
  'cal-prev-week','cal-next-week','cal-prev-day','cal-next-day','cal-prev-month','cal-next-month',
  'home-prev-month','home-next-month','home-pick-month','home-pick-year','set-cal-mode',
  'pick-month','pick-year','tap-month','tap-year','tap-sec-month','tap-sec-year','pick-sec-month','pick-sec-year',
  'pick-day','close-day-sheet','go-today','goto-desktop','desktop-step','toggle-desktop-title-menu',
  'toggle-section','go-landing','toggle-app-theme','retry-boot','toggle-desk-full',
  'toggle-cal-full','cal-full-step','cal-full-today','cal-full-pick','open-search','close-search',
  'open-auth','close-auth','auth-tab','auth-submit','auth-google','auth-resend','start-tour',
]);

function requireAccount(){
  openAuth('signup', 'authGateSub');
}
document.getElementById('device').addEventListener('click', (e) => {
  if((state.monthDropdownOpen || state.yearDropdownOpen || state.secDropdown.kind) && !e.target.closest('.cal-dropdown, .cal-label, .cal-subrow-item')){
    state.monthDropdownOpen = false; state.yearDropdownOpen = false;
    state.secDropdown = { kind:null, sys:null, home:false };
    render();
  }
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const action = el.dataset.action;

  // Guests may browse; anything that needs an account opens the sign-in popup.
  if(state.guest && !GUEST_ACTIONS.has(action)){ e.preventDefault(); requireAccount(); return; }

  // Leaving the profile edit page with unsaved changes asks first (menu.js).
  if(['open-menu', 'close-menu-overlay', 'menu-back', 'menu-nav'].includes(action) && !leaveProfileEditOk()) return;

  if(action === 'toggle-subtasks'){
    state.expandedTasks[el.dataset.id] = !state.expandedTasks[el.dataset.id];
    render();
    return;
  }
  if(action === 'toggle-subtask'){
    toggleSubtask(el.dataset.taskId, el.dataset.subId);
    return;
  }
  if(action === 'toggle-task'){
    const task = state.tasks.find(x=>x.id===el.dataset.id);
    if(!task) return;
    applyQuicksetState(el, taskStatusOn(task, el.dataset.date) !== 'done');
    return;
  }
  if(action === 'toggle-habit'){
    const dk = el.dataset.date;
    const habit = state.habits.find(x=>x.id===el.dataset.id);
    if(!habit) return;
    applyQuicksetState(el, !habit.completedDates.includes(dk));
    return;
  }
  if(action === 'delete-event'){ state.events = state.events.filter(x=>x.id!==el.dataset.id); cloudSync(() => Cloud.deleteEvent(el.dataset.id)); render(); return; }

  if(action === 'open-popup'){ openPopup(el.dataset.type, el, null); return; }
  if(action === 'view-item'){ openItemDetails(el.dataset.type, el.dataset.id, el); return; } // tap: details first (popup.js)
  if(action === 'edit-item'){ openPopup(el.dataset.type, el, findItem(el.dataset.type, el.dataset.id)); return; }
  if(action === 'close-popup'){ closePopup(); return; }
  if(action === 'toggle-desk-full'){ state.deskFull = !state.deskFull; haptic(10); render(); return; }
  // Full-screen month (calendar.js renderCalFull): opens on the month
  // the calendar it was opened from is showing.
  if(action === 'toggle-cal-full'){
    state.calFull = !state.calFull;
    if(state.calFull) state.calFullCursor = new Date(el.closest('#page-calendar') ? state.calCursor : state.homeDate);
    state.monthDropdownOpen = false; state.yearDropdownOpen = false;
    haptic(10); render(); return;
  }
  if(action === 'cal-full-step'){ stepCalFull(Number(el.dataset.dir)); return; }
  if(action === 'cal-full-today'){ state.calFullCursor = new Date(today); render(); return; }
  if(action === 'cal-full-pick'){
    if(el.closest('#cf-grid')?.dataset.swiped) return;
    const day = parseDateKey(el.dataset.date);
    state.homeDate = day; state.calCursor = new Date(day);
    state.calFull = false; haptic(10); render(); return;
  }
  if(action === 'open-menu'){
    /* Tapping the same nav button that's already open closes the panel
       instead of re-opening to the same view — the only way to close it
       on mobile now that the top-corner X/chevron buttons are gone (they
       required scrolling back up on a long page to reach, and the
       grow/shrink they drove isn't needed). */
    if(state.menuPanelOpen && state.menuSubView === (el.dataset.sub || null)){
      state.menuPanelOpen = false; render(); return;
    }
    state.menuSubView = el.dataset.sub || null; state.menuPanelOpen = true; render();
    if(state.menuSubView === 'friends') refreshConnections();
    return;
  }
  if(action === 'close-menu-overlay'){ state.menuPanelOpen = false; render(); return; }
  if(action === 'toggle-menu-maximize'){ state.menuMaximized = !state.menuMaximized; render(); return; }
  if(action === 'home-pick-month'){ state.homeDate = setMonthOf(state.homeDate, Number(el.dataset.month)); state.monthDropdownOpen=false; render(); return; }
  if(action === 'home-pick-year'){ state.homeDate = setYearOf(state.homeDate, Number(el.dataset.year)); state.yearDropdownOpen=false; render(); return; }
  if(action === 'submit-popup'){ submitPopup(); return; }
  if(action === 'notification-coming-soon'){ showToast(t('notificationComingSoon')); return; }
  if(action === 'open-subview' && el.dataset.sub === 'calendar'){
    // The item's date (or a range: press and drag) in the small date picker.
    openDatePicker({
      // Within a year back and five years ahead (it used to allow 1926).
      // A new task or event can't go on a day that has passed.
      title: t('dateTitle'), range: true, min: state.editingId ? dateYearsAgo(1) : dateKey(today), max: dateKey(stepYear(today, 5)), value: formDraft.date, end: formDraft.timeMode === 'range' ? formDraft.endDate : formDraft.date,
      time: { start: formDraft.startTime, end: formDraft.endTime },
      onPick: (start, end, time) => {
        formDraft.date = start; formDraft.endDate = end;
        formDraft.timeMode = start === end ? 'single' : 'range';
        if(time){ formDraft.startTime = time.start; formDraft.endTime = time.end; }
        renderPopupBody();
      },
    });
    return;
  }
  if(action === 'open-subview'){
    if(el.dataset.sub === 'repeat') startRepeatDraft(); // edited as a draft until "Confirm" (popup.js)
    if(el.dataset.sub === 'notification') startReminderDraft();
    state.popupSubView = el.dataset.sub; renderPopupBody(); return;
  }
  if(action === 'close-subview'){ repeatDraft = null; reminderDraft = null; state.popupSubView = null; renderPopupBody(); return; }

  if(action === 'pick-month'){ state.calCursor = setMonthOf(state.calCursor, Number(el.dataset.month)); state.monthDropdownOpen=false; render(); return; }
  if(action === 'pick-year'){ state.calCursor = setYearOf(state.calCursor, Number(el.dataset.year)); state.yearDropdownOpen=false; render(); return; }
  if(action === 'tap-sec-month' || action === 'tap-sec-year'){
    const sys = el.dataset.sys;
    const home = el.dataset.home === '1';
    const kind = action === 'tap-sec-month' ? 'month' : 'year';
    const sd = state.secDropdown;
    state.secDropdown = (sd.home===home && sd.sys===sys && sd.kind===kind)
      ? { kind:null, sys:null, home:false }
      : { kind, sys, home };
    state.monthDropdownOpen = false; state.yearDropdownOpen = false;
    render();
    return;
  }
  if(action === 'pick-sec-month' || action === 'pick-sec-year'){
    const sys = el.dataset.sys;
    const home = el.dataset.home === '1';
    const anchor = home ? state.homeDate : state.calCursor;
    const next = action === 'pick-sec-month'
      ? setMonthOfSys(anchor, sys, Number(el.dataset.month))
      : setYearOfSys(anchor, sys, Number(el.dataset.year));
    if(home) state.homeDate = next; else state.calCursor = next;
    state.secDropdown = { kind:null, sys:null, home:false };
    render();
    return;
  }
  if(action === 'cal-prev-week'){ shiftWeek(-1); return; }
  if(action === 'cal-next-week'){ shiftWeek(1); return; }
  if(action === 'cal-prev-day'){ shiftDay(-1); return; }
  if(action === 'cal-next-day'){ shiftDay(1); return; }
  if(action === 'cal-prev-month'){ shiftMonthRoll(-1); return; }
  if(action === 'cal-next-month'){ shiftMonthRoll(1); return; }
  if(action === 'home-prev-month'){ shiftHomeMonthRoll(-1); return; }
  if(action === 'home-next-month'){ shiftHomeMonthRoll(1); return; }
  if(action === 'set-cal-mode'){ state.calMode = el.dataset.mode; state.daySheetOpen = false; render(); return; }
  if(action === 'toggle-section'){
    const key = el.dataset.section;
    if(window.innerWidth < 960) state.sectionCollapsed[key] = !state.sectionCollapsed[key];
    else state.sectionExpanded[key] = !state.sectionExpanded[key];
    render();
    return;
  }
  if(action === 'toggle-pin'){
    const t = state.tasks.find(x=>x.id===el.dataset.id); t.pinned = !t.pinned;
    el.classList.toggle('active', t.pinned);
    cloudSync(() => Cloud.saveTask(t));
    return;
  }

  if(action === 'open-auth'){ openAuth(el.dataset.val || 'login'); return; }
  if(action === 'close-auth'){ closeAuth(); return; }
  if(action === 'auth-tab'){
    state.authTab = el.dataset.val;
    authErrors = { ...EMPTY_AUTH_ERRORS };
    authNotice = '';
    renderAuth();
    document.getElementById(state.authTab === 'signup' ? 'auth-username' : 'auth-email')?.focus();
    return;
  }
  if(action === 'auth-submit'){ submitAuth(); return; }
  if(action === 'auth-resend'){ resendAuthCode(); return; }
  if(action === 'contact-send'){ sendContactMessage(); return; }
  if(action === 'articles-cat'){ articlesView.cat = el.dataset.val; render(); return; }
  if(action === 'start-tour'){ startTour(el.dataset.tourId); return; }
  if(action === 'auth-google'){ Cloud.signInWithGoogle(); return; }  if(action === 'remove-profile-photo'){
    if(profileDraft) profileDraft.photo = null; // edit page: waits for "Save changes"
    else { state.profile.photo = null; cloudSync(() => Cloud.saveProfile(state.profile)); }
    render(); return;
  }
  if(action === 'copy-user-id'){
    copyText(state.profile.userId);
    showToast(t('idCopied'));
    return;
  }
  if(action === 'go-landing'){
    location.href = `../${lang()}/`;
    return;
  }
  if(action === 'toggle-app-theme'){
    // The circle opens from the sun/moon icon (or the switch's knob) itself.
    const icon = [...el.querySelectorAll('svg, .knob')].find(n => n.getBoundingClientRect().width > 0) || el;
    const r = icon.getBoundingClientRect();
    switchThemeAnimated(r.left + r.width / 2, r.top + r.height / 2, () => {
      state.settings.theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyAppearance();
      render();
    });
    cloudSync(() => Cloud.saveSettings(state.settings));
    return;
  }
  if(action === 'set-palette'){
    state.settings.palette = el.dataset.val === 'classic' ? 'classic' : 'toojibee';
    applyAppearance();
    cloudSync(() => Cloud.saveSettings(state.settings));
    render();
    return;
  }
  if(action === 'toggle-notifications'){
    const turnOn = !state.settings.notifications;
    state.settings.notifications = turnOn;
    cloudSync(() => Cloud.saveSettings(state.settings));
    render();
    if(turnOn) askNotificationPermission().then(p => {
      if(p === 'denied') showToast(t('notifBlockedHint'));
      if(p === 'granted'){ registerReminderWorker().then(() => enablePush()); showToast(t('notifOnSub')); }
      render();
    });
    else disablePush();
    return;
  }
  if(action === 'open-search'){ if(state.searchOpen) closeSearch(); else openSearch(); haptic(10); return; }
  if(action === 'close-search'){ closeSearch(); return; }
  if(action === 'period-view-step'){
    const n = periodViews().length;
    if(n > 1){ state.periodViewIndex = (periodViewIndex() + Number(el.dataset.dir) + n) % n; haptic(10); render(); }
    return;
  }
  if(action === 'period-share-open'){ openPeriodShareMenu(el); return; }
  if(action === 'set-item-color'){
    const kind = el.dataset.kind, color = el.dataset.color;
    if(!['task', 'habit', 'event'].includes(kind) || (color && !/^#[0-9A-Fa-f]{6}$/.test(color))) return;
    state.settings.itemColors = Object.assign({}, state.settings.itemColors);
    if(color) state.settings.itemColors[kind] = color; else delete state.settings.itemColors[kind];
    cloudSync(() => Cloud.saveSettings(state.settings));
    haptic(10); render();
    return;
  }
  if(action === 'toggle-pref'){
    setPref(el.dataset.key, !pref(el.dataset.key));
    render();
    return;
  }
  if(action === 'toggle-occasions-enabled'){
    setPref('occasionsEnabled', !pref('occasionsEnabled'));
    state.activeDesktopIndex = 0;
    render();
    return;
  }
  if(action === 'copy-invite-link'){
    // My personal invite link (opening it makes us friends); without that
    // API, the site link plus the code to search for.
    if(state.inviteToken){ copyText(inviteUrl(state.inviteToken)); showToast(t('inviteLinkCopiedNew')); }
    else { copyText(`https://toojibee.ir/ — ${t('myCode')}: ${state.profile.userId}`); showToast(t('inviteLinkCopied')); }
    return;
  }
  if(action === 'share-invite-link'){
    if(state.inviteToken && navigator.share) navigator.share({ title: t('appName'), text: t('inviteShareText'), url: inviteUrl(state.inviteToken) }).catch(() => {});
    return;
  }
  if(action === 'reset-invite-link'){
    if(!Cloud.resetInviteToken || !confirm(t('newLinkConfirm'))) return;
    el.disabled = true;
    Cloud.resetInviteToken().then(tok => { state.inviteToken = tok; showToast(t('newLinkDone')); render(); })
      .catch(() => { showToast(t('saveFailed')); el.disabled = false; });
    return;
  }
  if(action === 'connect-request'){ runConnectionAction(el, () => Cloud.sendConnectionRequest(el.dataset.id)); return; }
  if(action === 'connect-accept'){ runConnectionAction(el, () => Cloud.respondConnectionRequest(el.dataset.id, true)); return; }
  if(action === 'connect-decline'){ runConnectionAction(el, () => Cloud.respondConnectionRequest(el.dataset.id, false)); return; }
  if(action === 'connect-remove'){ runConnectionAction(el, () => Cloud.removeConnection(el.dataset.id)); return; }
  if(action === 'connect-block'){ runConnectionAction(el, () => Cloud.blockUser(el.dataset.id)); return; }
  if(action === 'connect-unblock'){ runConnectionAction(el, () => Cloud.unblockUser(el.dataset.id)); return; }
  if(action === 'toggle-store-feature'){ const f = state.store.find(x=>x.id===el.dataset.id); if(f) f.on = !f.on; render(); return; }
  if(action === 'store-upgrade'){ showToast(t('upgradeUnavailable')); return; }
  if(action === 'goto-desktop'){
    state.desktopTitleMenuOpen = false;
    // Picked from the title menu: highlight the choice at once, then close
    // the menu (it's not re-rendered by goToDesktopIndex, so it used to
    // stay open with the old item highlighted).
    const menu = el.closest('#desktop-title-menu');
    if(menu){
      menu.querySelectorAll('.cal-dropdown-item').forEach(x => x.classList.toggle('active', x === el));
      setTimeout(() => menu.remove(), 120);
    }
    goToDesktopIndex(Number(el.dataset.i));
    return;
  }
  if(action === 'toggle-desktop-title-menu'){
    state.desktopTitleMenuOpen = !state.desktopTitleMenuOpen;
    render();
    return;
  }
  if(action === 'desktop-step'){
    const dots = document.getElementById('desktop-dots');
    const count = dots ? dots.children.length : 1;
    const i = Math.max(0, Math.min(count - 1, (state.activeDesktopIndex || 0) + Number(el.dataset.dir)));
    goToDesktopIndex(i);
    return;
  }
  if(action === 'open-desktop-settings'){
    state.menuSubView = el.dataset.sub;
    render();
    return;
  }
  if(action === 'toggle-period-enabled'){ state.period.enabled = !state.period.enabled; savePeriodSetup(); render(); return; }
  if(action === 'toggle-planning-enabled'){ state.settings.planningEnabled = !state.settings.planningEnabled; cloudSync(() => Cloud.saveSettings(state.settings)); render(); return; }
  if(action === 'toggle-calendar-reminder'){ state.period.calendarReminder = !state.period.calendarReminder; savePeriodSetup(); render(); return; }
  if(action === 'period-settings' || action === 'period-quiz-start'){
    state.menuSubView = 'settings-period';
    render();
    openPeriodQuiz();
    return;
  }
  if(action === 'close-period-quiz'){ closePeriodQuiz(); return; }
  if(action === 'period-quiz-next' || action === 'period-quiz-finish'){ periodQuizNext(); return; }
  if(action === 'logout-user'){
    /* Logging out now needs a 3s press-and-hold (see attachLogoutHold()),
       not a plain tap — a quick click just shows a hint toast instead. */
    showToast(t('holdToLogout'));
    return;
  }
  if(action === 'menu-nav'){
    state.menuSubView = el.dataset.sub; render();
    if(state.menuSubView === 'friends') refreshConnections();
    return;
  }
  if(action === 'menu-back'){
    /* Profile/Store/Management have no parent (MENU_PARENT maps them to
       null) since each is its own entry point from the bottom bar now —
       falling back to null used to show a root "menu home" list, but
       that's gone, and renderMenu()'s null fallback is Profile itself,
       so back-from-Profile was landing right back on Profile (a dead
       end, not an actual "back"). Close the panel instead when there's
       nowhere real to go back to. */
    const parent = MENU_PARENT[state.menuSubView];
    if(parent){ state.menuSubView = parent; }
    else{ state.menuPanelOpen = false; state.menuSubView = null; }
    render();
    return;
  }
  if(action === 'toggle-setting'){ state.settings[el.dataset.key] = !state.settings[el.dataset.key]; cloudSync(() => Cloud.saveSettings(state.settings)); render(); return; }
  if(action === 'toggle-calendar-enabled'){
    const sys = el.dataset.val;
    const en = state.settings.calendarEnabled;
    const enabledCount = Object.values(en).filter(Boolean).length;
    if(en[sys] && enabledCount <= 1){ showToast(t('atLeastOneCalendar')); return; }
    en[sys] = !en[sys];
    /* If the system that was primary just got switched off, fall back
       to the first system that's still on. */
    if(!en[sys] && primarySystem() === sys){
      state.settings.calendarSystem = ['gregorian','jalali','hijri'].find(s => en[s]);
    }
    state.monthDropdownOpen = false; state.yearDropdownOpen = false;
    cloudSync(() => Cloud.saveSettings(state.settings));
    render();
    return;
  }
  if(action === 'set-language'){
    if(el.dataset.val === lang()) return;
    showLanguageLoading(el.dataset.val);
    return;
  }
  if(action === 'share-copy'){
    copyText('https://toojibee.ir/');
    const fb = document.getElementById('share-feedback');
    if(fb){ fb.textContent = t('linkCopied'); fb.style.display = 'block'; setTimeout(()=>{ fb.style.display='none'; }, 1500); }
    return;
  }
  if(action === 'pick-day'){
    /* Only the week-mode list rows still use this click action now — the
       month-grid day cells are handled by attachDayCellGestures()'s
       pointer state machine instead. */
    const d = new Date(el.dataset.date);
    state.selectedDate = d;
    state.homeDate = d;
    render();
    return;
  }
  if(action === 'close-day-sheet'){ state.daySheetOpen = false; render(); return; }
  if(action === 'retry-boot'){ boot(); return; }
  if(action === 'go-today'){
    /* Single shared button — on desktop it's anchored to #page-calendar's
       box (see updateNav()), so it resets the calendar's own cursor;
       below that breakpoint the merged home widget IS the calendar, so
       it resets homeDate instead. */
    if(window.innerWidth >= 960){
      state.calCursor = new Date(today);
      state.homeDate = new Date(today);
      state.monthDropdownOpen = false; state.yearDropdownOpen = false;
      state.secDropdown = { kind:null, sys:null, home:false };
    } else {
      state.homeDate = new Date(today);
    }
    render();
    return;
  }
});

/* role="checkbox" divs (task/habit toggles) have no native Enter/Space
   activation the way a <button> would, so wire it up manually. They can't
   be real <button>s because each one nests the qs-done/qs-undone quickset
   buttons, and a <button> can't contain interactive children. */
document.getElementById('device').addEventListener('keydown', (e) => {
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const cb = e.target.closest('[role="checkbox"]');
  if(!cb) return;
  e.preventDefault();
  cb.click();
});
