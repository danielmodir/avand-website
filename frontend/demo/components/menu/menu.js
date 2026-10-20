const MENU_PARENT = {
  'profile': null, 'profile-edit': 'profile', 'share': 'profile', 'about': 'profile', 'settings': 'profile', 'friends': 'profile', 'store': null, 'admin': null,
  'settings-general': 'settings', 'settings-calendar': 'settings', 'settings-avandmenu': 'settings',
  // Monthly-cycle settings live with the desks in Management (its gear), not in Settings.
  'settings-period': 'admin',
  'settings-planning': 'admin', 'settings-occasions': 'admin'
};

function initials(name){
  return (name||'').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase() || '?';
}

function subHeader(title){
  return `<div class="popup-subview-header" style="margin:4px 2px 20px 2px;">
    <div class="popup-back" data-action="menu-back">${ICONS.arrowBack}</div>
    <div class="popup-subview-title" style="font-size:18px;">${title}</div>
  </div>`;
}

function renderMenu(){
  const sub = state.menuSubView;
  if(sub === 'profile') return renderProfilePage();
  if(sub === 'profile-edit') return renderProfileEditPage();
  if(sub === 'friends') return renderFriendsPage();
  if(sub === 'store') return renderStorePage();
  if(sub === 'admin') return renderAdminPanel();
  if(sub === 'share') return renderSharePage();
  if(sub === 'about') return renderAboutPage();
  if(sub === 'settings') return renderSettingsList();
  if(sub === 'settings-general') return renderGeneralSettings();
  if(sub === 'settings-calendar') return renderCalendarSettings();
  if(sub === 'settings-avandmenu') return renderToojibeeMenuSettings();
  if(sub === 'settings-period') return `<div class="period-themed">${renderPeriodSettings()}</div>`;
  if(sub === 'settings-planning') return renderPlanningSettings();
  if(sub === 'settings-occasions') return renderOccasionsSettings();
  /* No button opens the menu panel with no data-sub anymore (the
     hamburger entry point is gone — Profile/Store/Management each have
     their own bottom-bar button), so this is just a safe fallback. */
  return renderProfilePage();
}

function renderProfilePage(){
  const p = state.profile;
  // Today only: tasks done, habits done out of today's, tasks still left.
  const dk = dateKey(today);
  const todays = itemsForDate(today);
  const completedTasks = todays.tasks.filter(x => taskStatusOn(x, dk) === 'done').length;
  const remainingTasks = todays.tasks.length - completedTasks;
  const habitsDone = todays.habits.filter(h => h.completedDates.includes(dk)).length;
  const displayName = p.username || p.name || '';
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return `
    <div class="popup-subview-header" style="margin:4px 2px 20px 2px;">
      <div class="popup-back" data-action="menu-back">${ICONS.arrowBack}</div>
      <div class="popup-subview-title" style="font-size:18px;">${t('profile')}</div>
      <button type="button" class="theme-toggle-btn" data-action="toggle-app-theme" aria-label="${t('toggleTheme')}" aria-pressed="${isLight?'false':'true'}">
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>
      </button>
    </div>
    <div class="profile-header-new">
      <div class="profile-avatar-sm" ${p.photo?`style="background-image:url('${p.photo}')"`:''}>${p.photo?'':initials(p.name)}</div>
      <div class="profile-header-text">
        <div class="profile-username-row">
          ${displayName
            ? `<span class="profile-username">${escapeHtml(displayName)}</span>`
            : `<span class="profile-username profile-no-name" data-action="menu-nav" data-sub="profile-edit">${t('profileNoName')}</span>`}
          <button type="button" class="icon-btn-sm" data-action="menu-nav" data-sub="profile-edit" aria-label="${t('editBtn')}">${ICONS.pencilIcon}</button>
        </div>
        <div class="profile-id-row">
          <span class="profile-id-text">${escapeHtml(p.userId)}</span>
          <button type="button" class="icon-btn-sm" data-action="copy-user-id" aria-label="${t('copyBtn')}">${ICONS.copyIcon}</button>
        </div>
      </div>
    </div>

    <div class="profile-stats">
      <div class="profile-stat"><div class="num">${dig(completedTasks)}</div><div class="lbl">${t('tasksDoneToday')}</div></div>
      <div class="profile-stat"><div class="num">${dig(habitsDone)}/${dig(todays.habits.length)}</div><div class="lbl">${t('habitsToday')}</div></div>
      <div class="profile-stat"><div class="num">${dig(remainingTasks)}</div><div class="lbl">${t('tasksLeftToday')}</div></div>
    </div>

    <div class="section-title" style="margin-top:22px;">${t('accountInfo')}</div>
    <div class="menu-list">
      ${Cloud.supportsSocial === false || !Cloud.isConfigured() ? '' : `<div class="menu-item-row" data-action="menu-nav" data-sub="friends">
        <div class="menu-item-icon">${ICONS.peopleIcon}</div>
        <div class="menu-item-label">${t('connections')} <span class="count">${dig(state.connections.filter(c=>c.status==='accepted').length)}</span></div>
        ${ICONS.chevronRightSmall}
      </div>`}
      <div class="menu-item-row" data-action="menu-nav" data-sub="share">
        <div class="menu-item-icon">${ICONS.shareIcon}</div><div class="menu-item-label">${t('shareApp')}</div>${ICONS.chevronRightSmall}
      </div>
      <div class="menu-item-row" data-action="menu-nav" data-sub="about">
        <div class="menu-item-icon">${ICONS.infoIcon}</div><div class="menu-item-label">${t('aboutUs')}</div>${ICONS.chevronRightSmall}
      </div>
      <div class="menu-item-row" data-action="menu-nav" data-sub="settings">
        <div class="menu-item-icon">${ICONS.gearIcon}</div><div class="menu-item-label">${t('settings')}</div>${ICONS.chevronRightSmall}
      </div>
      <div class="menu-item-row disabled" aria-disabled="true">
        <div class="menu-item-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16l1.5 5a2.5 2.5 0 0 1-4 2 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4-2L4 4zm1 8.9c.7.3 1.4.4 2 .4.9 0 1.7-.2 2.5-.6a5.6 5.6 0 0 0 5 0 5.6 5.6 0 0 0 5 0c.6.4 1.4.6 2.5.6.6 0 1.3-.1 2-.4V20H5v-7.1z"/></svg></div>
        <div class="menu-item-label">${t('store')}</div>
        <span class="soon-badge">${t('comingSoon')}</span>
      </div>
    </div>
    ${/* No backend = no account: nothing to log out of (it used to wipe
         this device's data). */ REAL_LOGIN_DISABLED ? '' : `
    <button class="btn btn-outline logout-hold-btn" style="margin-top:22px; color:var(--danger); border-color:var(--danger);" data-action="logout-user">
      <span class="logout-hold-fill"></span>
      <span class="logout-hold-label">${t('logout')}</span>
    </button>`}
  `;
}

function dobLabel(p){
  if(!p.dob || isNaN(new Date(p.dob + 'T00:00:00'))) return t('dateOfBirth');
  return formatDateLabel(p.dob);
}

function renderProfileEditPage(){
  const p = state.profile;
  return `
    ${subHeader(t('editProfile'))}
    <div class="profile-edit-form">
    <div class="profile-avatar-big" ${p.photo?`style="background-image:url('${p.photo}')"`:''}>${p.photo?'':initials(p.name)}</div>
    <div class="profile-photo-actions">
      <label class="link-btn">${t('changePhoto')}<input type="file" accept="image/*" id="profile-photo-input" class="hidden"></label>
      ${p.photo ? `<span class="link-btn" data-action="remove-profile-photo">${t('removePhoto')}</span>` : ''}
    </div>
    <div class="section-title" style="margin-top:18px;">${t('personalInfo')}</div>
    <div class="profile-field-row">
      <div class="field"><input type="text" id="profile-first-name" value="${escapeAttr(p.firstName)}" placeholder="${t('firstName')}"></div>
      <div class="field"><input type="text" id="profile-last-name" value="${escapeAttr(p.lastName)}" placeholder="${t('lastName')}"></div>
    </div>
    <div class="field"><input type="text" id="profile-username" dir="ltr" autocapitalize="off" spellcheck="false" value="${escapeAttr(p.username)}" placeholder="${t('username')}">
      <div class="profile-hint">${t('usernameHint')}</div></div>
    ${/* Gender and birth date are fixed once set (sign-up asks for both);
         an empty one (older account, or no backend) can be filled in once. */''}
    <div class="field">
      ${p.dob ? `<div class="locked-field"><span>${t('dateOfBirth')}</span><b>${dobLabel(p)}</b></div>`
        : `<button type="button" class="dob-field-btn" id="profile-dob-btn">${dobLabel(p)}</button><div class="profile-hint">${t('setOnceHint')}</div>`}
    </div>
    <div class="field">
      ${p.gender === 'female' || p.gender === 'male' ? `<div class="locked-field"><span>${t('gender')}</span><b>${t(p.gender)}</b></div>` : `
      <select class="settings-select" id="profile-gender-select" style="width:100%;">
        <option value="" selected disabled>${t('gender')}</option>
        <option value="female">${t('female')}</option>
        <option value="male">${t('male')}</option>
      </select><div class="profile-hint">${t('setOnceHint')}</div>`}
    </div>

    <div class="section-title">${t('contactInfo')}</div>
    ${p.email ? `<div class="field"><div class="locked-field"><span>${t('email')}</span><b dir="ltr">${escapeHtml(p.email)}</b></div></div>` : ''}
    <div class="field"><input type="tel" id="profile-phone" value="${escapeAttr(p.phone)}" placeholder="${t('phoneNumber')}"></div>
    ${Cloud.isConfigured() && !state.guest && Cloud.changePassword ? `
      <div class="section-title">${t('accountSecurity')}</div>
      <div class="field"><input type="password" id="pw-current" autocomplete="current-password" placeholder="${t('currentPassword')}"></div>
      <div class="field"><input type="password" id="pw-new" autocomplete="new-password" placeholder="${t('newPassword')}"><div class="profile-hint">${t('passwordHint')}</div></div>
      <button type="button" class="btn btn-outline" id="pw-change" style="width:100%;">${t('changePasswordBtn')}</button>
      <button type="button" class="btn delete-account-btn" id="account-delete" style="width:100%; margin-top:18px;">${t('deleteAccountBtn')}</button>` : ''}
    </div>
  `;
}

function friendRowActions(c){
  const status = c.status || 'none';
  if(status==='none') return `<button class="btn btn-primary btn-small" data-action="connect-request" data-id="${c.id}">${t('connect')}</button>`;
  if(status==='pending-outgoing') return `
    <button class="btn btn-outline btn-small" disabled>${t('pending')}</button>
    <button class="btn btn-outline btn-small" data-action="connect-remove" data-id="${c.id}">${t('cancelRequest')}</button>`;
  if(status==='pending-incoming') return `
    <button class="btn btn-primary btn-small" data-action="connect-accept" data-id="${c.id}">${t('accept')}</button>
    <button class="btn btn-outline btn-small" data-action="connect-decline" data-id="${c.id}">${t('decline')}</button>`;
  if(status==='accepted') return `
    <button class="btn btn-outline btn-small" data-action="connect-remove" data-id="${c.id}">${t('remove')}</button>
    <button class="btn btn-outline btn-small" style="color:var(--danger); border-color:var(--danger);" data-action="connect-block" data-id="${c.id}">${t('block')}</button>`;
  if(status==='blocked') return `<button class="btn btn-outline btn-small" data-action="connect-unblock" data-id="${c.id}">${t('unblock')}</button>`;
  if(status==='blocked-by-them') return '';
  return '';
}

function friendRow(c){
  // Search results don't carry a status (the backend doesn't expose
  // blocked-by-someone-else), so fall back to the real connection list
  // if this id is already known there (e.g. searching up someone you
  // already have a pending/accepted connection with).
  const known = state.connections.find(x => x.id === c.id);
  const merged = known || c;
  return `
    <div class="settings-row">
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <div class="menu-avatar" style="width:36px; height:36px; font-size:13px;">${initials(merged.name)}</div>
        <div style="min-width:0;"><div class="lbl" dir="ltr">${escapeHtml(merged.name)}</div><div class="sub" dir="ltr" style="white-space:nowrap;">${escapeHtml(merged.userId || c.userId || '')}</div></div>
      </div>
      <div style="display:flex; gap:6px; flex:0 0 auto;">${friendRowActions(merged)}</div>
    </div>`;
}

async function refreshConnections(){
  if(REAL_LOGIN_DISABLED || !Cloud.hasSession()) return; // nothing to load without a session (was a 401)
  try{ state.connections = await Cloud.listConnections(); }
  catch(e){ /* keep whatever was already loaded */ }
  render();
}

function runConnectionAction(btn, fn){
  btn.disabled = true;
  fn().then(refreshConnections).catch(err => {
    showToast(err && err.code === 'too_many_pending' ? t('errTooManyPending') : err && err.status === 404 ? t('errUserGone') : authErrorMessage(err));
    refreshConnections();
  });
}

let friendSearchTimer = null;

function scheduleFriendSearch(){
  clearTimeout(friendSearchTimer);
  const q = state.friendSearch.trim();
  if(!q){ state.friendSearchResults = []; state.friendSearchBusy = false; render(); return; }
  state.friendSearchBusy = true;
  friendSearchTimer = setTimeout(async () => {
    try{ state.friendSearchResults = await Cloud.searchUser(q); }
    catch(e){ state.friendSearchResults = []; }
    state.friendSearchBusy = false;
    render();
  }, 350);
}

function renderFriendsPage(){
  const q = state.friendSearch.trim();
  const incoming = state.connections.filter(c=>c.status==='pending-incoming');
  const accepted = state.connections.filter(c=>c.status==='accepted');
  const outgoing = state.connections.filter(c=>c.status==='pending-outgoing');
  const blocked = state.connections.filter(c=>c.status==='blocked');
  const nothingYet = !incoming.length && !accepted.length && !outgoing.length;
  return `
    ${subHeader(t('connections'))}
    <div class="settings-row">
      <div style="min-width:0;"><div class="lbl">${t('inviteLink')}</div><div class="sub" style="overflow:hidden; text-overflow:ellipsis;" dir="ltr">toojibee.ir · ${escapeHtml(state.profile.userId)}</div></div>
      <span class="link-btn" data-action="copy-invite-link" aria-label="${t('copyBtn')}">${ICONS.copyIcon}</span>
    </div>
    <div class="search-capsule" style="margin-top:16px;">
      <input type="text" id="friend-search" value="${escapeAttr(state.friendSearch)}" placeholder="${t('friendsSearchPlaceholder')}">
      <button type="button" class="search-capsule-btn" id="friend-search-btn" aria-label="${t('searchResults')}">${ICONS.searchIcon}</button>
    </div>
    ${q ? `
      <div class="section-title">${t('searchResults')}</div>
      ${state.friendSearchBusy ? `<div class="empty-hint">…</div>`
        : state.friendSearchResults.length ? state.friendSearchResults.map(friendRow).join('') : `<div class="empty-hint">${t('noSearchResults')}</div>`}
    ` : `
      ${incoming.length ? `<div class="section-title">${t('incomingRequests')} <span class="count">${dig(incoming.length)}</span></div>${incoming.map(friendRow).join('')}` : ''}
      ${accepted.length ? `<div class="section-title">${t('myConnections')} <span class="count">${dig(accepted.length)}</span></div>${accepted.map(friendRow).join('')}` : ''}
      ${outgoing.length ? `<div class="section-title">${t('sentRequests')} <span class="count">${dig(outgoing.length)}</span></div>${outgoing.map(friendRow).join('')}` : ''}
      ${nothingYet ? `<div class="empty-hint" style="margin-top:16px;">${t('noConnectionsYet')}</div>` : ''}
      ${blocked.length ? `<div class="section-title">${t('blockedUsers')} <span class="count">${dig(blocked.length)}</span></div>${blocked.map(friendRow).join('')}` : ''}
    `}
  `;
}

const STORE_FEATURE_META = {
  theme: { icon: 'storeIcon', name: 'featThemesName', desc: 'featThemesDesc' },
  advcal: { icon: 'calendarIcon', name: 'featAdvCalName', desc: 'featAdvCalDesc' },
  prodtools: { icon: 'repeatIcon', name: 'featProdToolsName', desc: 'featProdToolsDesc' },
  analytics: { icon: 'bellIcon', name: 'featAnalyticsName', desc: 'featAnalyticsDesc' },
  ai: { icon: 'infoIcon', name: 'featAIName', desc: 'featAIDesc' }
};

function storeFeatureCard(f){
  const meta = STORE_FEATURE_META[f.id];
  let badgeClass, badgeLabel, actionHtml;
  if(f.kind === 'toggle'){
    badgeClass = f.on ? 'store-badge-enabled' : 'store-badge-available';
    badgeLabel = f.on ? t('statusEnabled') : t('statusAvailable');
    actionHtml = `<div class="switch ${f.on?'on':''}" data-action="toggle-store-feature" data-id="${f.id}"><div class="knob"></div></div>`;
  } else if(f.kind === 'locked'){
    badgeClass = 'store-badge-locked';
    badgeLabel = t('statusLocked');
    actionHtml = `<span class="store-card-hint">${t('comingSoon')}</span>`;
  } else {
    badgeClass = 'store-badge-premium';
    badgeLabel = t('statusPremium');
    actionHtml = `<button class="btn btn-primary btn-small" data-action="store-upgrade">${t('upgrade')}</button>`;
  }
  return `
    <div class="store-card">
      <div class="store-card-top">
        <div class="store-card-icon">${ICONS[meta.icon]}</div>
        <span class="store-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="store-card-name">${t(meta.name)}</div>
      <div class="store-card-desc">${t(meta.desc)}</div>
      <div class="store-card-action">${actionHtml}</div>
    </div>`;
}

function renderStorePage(){
  return `
    ${subHeader(t('store'))}
    ${state.store.length
      ? `<div class="store-grid">${state.store.map(storeFeatureCard).join('')}</div>`
      : `<div class="empty-hint">${t('storeEmpty')}</div>`}
  `;
}

function renderAdminPanel(){
  return `
    ${subHeader(t('adminPanel'))}
    <div class="section-title">${t('enabledDesktops')}</div>
    <div class="sub" style="margin:-6px 2px 10px 2px;">${t('enabledDesktopsSub')}</div>
    <div class="desktop-manage-card">
      <button type="button" class="desktop-manage-gear" data-action="open-desktop-settings" data-sub="settings-occasions" aria-label="${t('occasionsSettings')}">${ICONS.gearIcon}</button>
      <div class="desktop-manage-title">${t('occasionsDesktop')}</div>
      <div class="desktop-manage-desc">${t('occasionsDesktopSub')}</div>
      <div class="switch ${pref('occasionsEnabled')?'on':''}" data-action="toggle-occasions-enabled"><div class="knob"></div></div>
    </div>
    <div class="desktop-manage-card">
      <button type="button" class="desktop-manage-gear" data-action="open-desktop-settings" data-sub="settings-planning" aria-label="${t('planningSettings')}">${ICONS.gearIcon}</button>
      <div class="desktop-manage-title">${t('planning')}</div>
      <div class="desktop-manage-desc">${t('planningDesktopSub')}</div>
      <div class="switch ${state.settings.planningEnabled?'on':''}" data-action="toggle-planning-enabled"><div class="knob"></div></div>
    </div>
    ${state.profile.gender === 'female' ? `
      <div class="desktop-manage-card">
        <button type="button" class="desktop-manage-gear" data-action="open-desktop-settings" data-sub="settings-period" aria-label="${t('settings')}">${ICONS.gearIcon}</button>
        <div class="desktop-manage-title">${t('periodDesktop')}</div>
        <div class="desktop-manage-desc">${t('periodDesktopSub')}</div>
        <div class="switch ${state.period.enabled?'on':''}" data-action="toggle-period-enabled"><div class="knob"></div></div>
      </div>
    ` : ''}
    ${state.store.length
      ? `<div class="store-grid">${state.store.map(storeFeatureCard).join('')}</div>`
      : ''}
  `;
}

function renderSharePage(){
  return `
    ${subHeader(t('shareToojibee'))}
    <div class="share-hero">
      <div class="share-app-icon"><img class="brand-mark-img" src="../assets/icons/logo-mark.png" alt=""></div>
      <div class="share-app-name">${t('appName')}</div>
      <div class="share-app-desc">${t('shareDesc')}</div>
    </div>
    <div class="share-options">
      <div class="share-option" data-action="share-copy"><div class="share-opt-icon">${ICONS.linkIcon}</div><span>${t('copyLink')}</span></div>
    </div>
    <div class="empty-hint" id="share-feedback" style="margin-top:14px; display:none;"></div>
  `;
}

function renderAboutPage(){
  const customText = state.aboutText[lang()];
  return `
    ${subHeader(t('aboutUs'))}
    <div class="about-logo"><img class="brand-mark-img" src="../assets/icons/logo-mark.png" alt=""></div>
    <div class="about-name">${t('appName')}</div>
    <div class="about-version">${t('aboutVersion')}</div>
    <div class="empty-hint">${escapeHtml(customText || t('aboutDesc'))}</div>
    <div class="about-links">
      <div class="about-link-row">${t('privacyPolicy')}</div>
      <div class="about-link-row">${t('termsOfService')}</div>
    </div>
  `;
}

function renderSettingsList(){
  return `
    ${subHeader(t('settings'))}
    <div class="menu-list">
      <div class="menu-item-row" data-action="menu-nav" data-sub="settings-general"><div class="menu-item-icon">${ICONS.gearIcon}</div><div class="menu-item-label">${t('generalSettings')}</div>${ICONS.chevronRightSmall}</div>
      <div class="menu-item-row" data-action="menu-nav" data-sub="settings-calendar"><div class="menu-item-icon">${ICONS.calendarIcon}</div><div class="menu-item-label">${t('calendarSettings')}</div>${ICONS.chevronRightSmall}</div>
    </div>
  `;
}

function renderGeneralSettings(){
  return `
    ${subHeader(t('generalSettings'))}
    <div class="settings-row">
      <div><div class="lbl">${t('language')}</div><div class="sub">${t('languageSub')}</div></div>
      <div class="toggle-pair" style="width:120px;">
        <button type="button" data-action="set-language" data-val="en" class="${lang()==='en'?'active':''}">English</button>
        <button type="button" data-action="set-language" data-val="fa" class="${lang()==='fa'?'active':''}">فارسی</button>
      </div>
    </div>
    <div class="section-title">${t('appearance')}</div>
    <div class="palette-picker" role="radiogroup" aria-label="${t('themePalette')}">
      ${['toojibee','classic'].map(p => `
        <button type="button" class="palette-option ${state.settings.palette===p?'active':''}" data-action="set-palette" data-val="${p}" role="radio" aria-checked="${state.settings.palette===p}">
          <span class="palette-swatches palette-swatches-${p}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="palette-name">${t(p==='toojibee'?'paletteToojibee':'paletteClassic')}</span>
        </button>`).join('')}
    </div>
    <div class="settings-row">
      <div><div class="lbl">${t('darkMode')}</div><div class="sub">${t('darkModeSub')}</div></div>
      <div class="switch ${document.documentElement.getAttribute('data-theme')!=='light'?'on':''}" data-action="toggle-app-theme" role="switch" aria-checked="${document.documentElement.getAttribute('data-theme')!=='light'}"><div class="knob"></div></div>
    </div>
    <div class="settings-row" style="opacity:.5;"><div><div class="lbl">${t('notifications')}</div><div class="sub">${t('notificationsSub')}</div></div><div class="switch" style="pointer-events:none;"><div class="knob"></div></div></div>
  `;
}

function renderCalendarSettings(){
  const weekdayLabels = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  return `
    ${subHeader(t('calendarSettings'))}
    <div class="section-title">${t('calendarSystemsShown')}</div>
    <div class="sub" style="margin:-6px 2px 10px 2px;">${t('calendarSystemsShownSub')}</div>
    ${['gregorian','jalali','hijri'].map(sys => `
      <div class="settings-row">
        <div><div class="lbl">${t(sys)}</div>${primarySystem()===sys?`<div class="sub">${t('primarySystemBadge')}</div>`:''}</div>
        <div class="switch ${state.settings.calendarEnabled[sys]?'on':''}" data-action="toggle-calendar-enabled" data-val="${sys}"><div class="knob"></div></div>
      </div>
    `).join('')}
    <div class="settings-row">
      <div><div class="lbl">${t('primarySystem')}</div><div class="sub">${t('primarySystemSub')}</div></div>
      <select class="settings-select" id="primary-calendar-select">
        ${['gregorian','jalali','hijri'].filter(sys => state.settings.calendarEnabled[sys]).map(sys => `<option value="${sys}" ${primarySystem()===sys?'selected':''}>${t(sys)}</option>`).join('')}
      </select>
    </div>
    <div class="settings-row">
      <div><div class="lbl">${t('weekStartsOn')}</div><div class="sub">${t('weekStartsSub')}</div></div>
      <select class="settings-select" id="week-start-select">
        ${weekdayLabels.map((key,i) => `<option value="${key}" ${state.settings.weekStartDay===key?'selected':''}>${weekdayFull(i)}</option>`).join('')}
      </select>
    </div>
  `;
}

function prefRow(key, label, sub){
  return `
    <div class="settings-row">
      <div><div class="lbl">${t(label)}</div>${sub ? `<div class="sub">${t(sub)}</div>` : ''}</div>
      <div class="switch ${pref(key)?'on':''}" data-action="toggle-pref" data-key="${key}" role="switch" aria-checked="${pref(key)}" aria-label="${escapeAttr(t(label))}"><div class="knob"></div></div>
    </div>`;
}

function renderPlanningSettings(){
  return `
    ${subHeader(t('planningSettings'))}
    ${prefRow('planningDaySummary', 'prefDaySummary', 'prefDaySummarySub')}
    ${prefRow('planningCalendarDots', 'prefCalendarDots', 'prefCalendarDotsSub')}
    ${prefRow('planningShowEvents', 'prefPlanningEvents', 'prefPlanningEventsSub')}
    ${prefRow('planningShowHabits', 'prefPlanningHabits', 'prefPlanningHabitsSub')}
  `;
}

function renderOccasionsSettings(){
  return `
    ${subHeader(t('occasionsSettings'))}
    <div class="section-title">${t('occasionSources')}</div>
    ${prefRow('occasionsJalali', 'prefOccJalali', 'prefOccJalaliSub')}
    ${prefRow('occasionsHijri', 'prefOccHijri', 'prefOccHijriSub')}
    ${prefRow('occasionsGregorian', 'prefOccGregorian', 'prefOccGregorianSub')}
    <div class="section-title">${t('display')}</div>
    ${prefRow('occasionsHolidaysOnly', 'prefOccHolidaysOnly', 'prefOccHolidaysOnlySub')}
    ${prefRow('occasionsMarkHolidays', 'prefOccMarkHolidays', 'prefOccMarkHolidaysSub')}
    ${prefRow('occasionsShowEvents', 'prefOccShowEvents', 'prefOccShowEventsSub')}
  `;
}

function renderToojibeeMenuSettings(){
  return `
    ${subHeader(t('avandMenuSettings'))}
    <div class="settings-row">
      <div><div class="lbl">${t('showLabels')}</div><div class="sub">${t('showLabelsSub')}</div></div>
      <div class="switch ${state.settings.showAddMenuLabels?'on':''}" data-action="toggle-setting" data-key="showAddMenuLabels"><div class="knob"></div></div>
    </div>
  `;
}

function syncProfileName(){
  state.profile.name = [state.profile.firstName, state.profile.lastName].filter(Boolean).join(' ').trim()
    || state.profile.username || 'Toojibee User';
}

let profileSaveTimer = null;

function scheduleProfileSave(){
  clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(() => cloudSync(() => Cloud.saveProfile(state.profile)), 600);
}

function wireMenuInteractivity(){
  document.getElementById('profile-first-name')?.addEventListener('input', e => { state.profile.firstName = e.target.value; syncProfileName(); scheduleProfileSave(); });
  document.getElementById('profile-last-name')?.addEventListener('input', e => { state.profile.lastName = e.target.value; syncProfileName(); scheduleProfileSave(); });
  // Username: same rules as sign-up, checked when the field is left; the
  // server also checks it's not taken (then the old one comes back).
  document.getElementById('profile-username')?.addEventListener('change', e => {
    const before = state.profile.username;
    const v = e.target.value.trim().toLowerCase();
    if(v === before) return;
    if(!USERNAME_RE.test(v)){ showToast(t('usernameInvalid')); e.target.value = before || ''; return; }
    state.profile.username = v; e.target.value = v; syncProfileName();
    Promise.resolve(Cloud.saveProfile(state.profile)).catch(err => {
      state.profile.username = before; syncProfileName(); render();
      showToast(err && err.code === 'username_taken' ? t('errUsernameTaken') : t('saveFailed'));
    });
  });
  // Gender and birth date: only when still empty, once, after a confirm.
  const setOnce = (field, value) => {
    if(!confirm(t('setOnceConfirm'))) { render(); return; }
    state.profile[field] = value;
    Promise.resolve(Cloud.saveProfile(state.profile)).catch(() => showToast(t('saveFailed')));
    render();
  };
  document.getElementById('profile-dob-btn')?.addEventListener('click', () => openDatePicker({
    title: t('dateOfBirth'), value: state.profile.dob, max: dateYearsAgo(MIN_SIGNUP_AGE), min: dateYearsAgo(110),
    onPick: v => setOnce('dob', v),
  }));
  document.getElementById('profile-gender-select')?.addEventListener('change', e => setOnce('gender', e.target.value));
  document.getElementById('profile-phone')?.addEventListener('input', e => { state.profile.phone = e.target.value; scheduleProfileSave(); });
  document.getElementById('pw-change')?.addEventListener('click', () => {
    const cur = document.getElementById('pw-current').value, next = document.getElementById('pw-new').value;
    const problem = passwordProblem(next);
    if(!cur || problem){ showToast(problem || t('currentPasswordRequired')); return; }
    Cloud.changePassword(cur, next).then(() => {
      document.getElementById('pw-current').value = ''; document.getElementById('pw-new').value = '';
      showToast(t('passwordChangedToast'));
    }).catch(err => showToast(authErrorMessage(err)));
  });
  document.getElementById('account-delete')?.addEventListener('click', () => {
    const pw = prompt(t('deleteAccountPrompt'));
    if(pw === null) return;
    Cloud.deleteAccount(pw).then(() => {
      enterGuestMode(); state.menuPanelOpen = false; state.menuSubView = null; render();
      showToast(t('accountDeleted'));
    }).catch(err => showToast(authErrorMessage(err)));
  });
  document.getElementById('week-start-select')?.addEventListener('change', e => { state.settings.weekStartDay = e.target.value; cloudSync(() => Cloud.saveSettings(state.settings)); render(); });
  document.getElementById('primary-calendar-select')?.addEventListener('change', e => {
    state.settings.calendarSystem = e.target.value;
    state.monthDropdownOpen = false; state.yearDropdownOpen = false;
    cloudSync(() => Cloud.saveSettings(state.settings));
    render();
  });
  document.getElementById('profile-photo-input')?.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    if(file.size > MAX_UPLOAD_BYTES){ showToast(t('fileTooLarge')); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { state.profile.photo = reader.result; cloudSync(() => Cloud.saveProfile(state.profile)); render(); };
    reader.readAsDataURL(file);
  });
  document.getElementById('friend-search')?.addEventListener('input', e => {
    state.friendSearch = e.target.value;
    const cursor = e.target.selectionStart;
    scheduleFriendSearch();
    render();
    const el2 = document.getElementById('friend-search');
    if(el2){ el2.focus(); el2.setSelectionRange(cursor, cursor); }
  });
  document.getElementById('friend-search-btn')?.addEventListener('click', runFriendSearchNow);
  document.getElementById('friend-search')?.addEventListener('keydown', e => {
    if(e.key === 'Enter') runFriendSearchNow();
  });
}

function runFriendSearchNow(){
  clearTimeout(friendSearchTimer);
  const q = state.friendSearch.trim();
  if(!q){ state.friendSearchResults = []; state.friendSearchBusy = false; render(); return; }
  state.friendSearchBusy = true;
  render();
  Cloud.searchUser(q).then(r => { state.friendSearchResults = r; }).catch(() => { state.friendSearchResults = []; }).finally(() => { state.friendSearchBusy = false; render(); });
}

function updateNav(){
  // A resize while the page is still loading (a phone's address bar
  // sliding away) can land before the partials are injected.
  if(!document.getElementById('fab-add')) return;
  /* The add menu only makes sense when the Planning desktop is on —
     there'd be nowhere for a new task/habit/event to show up otherwise
     (see Management's "Workspace desktops" toggles). */
  document.getElementById('fab-add').classList.toggle('hidden', !state.settings.planningEnabled);
  // Signed-out guests: no profile or management until there's an account;
  // the header shows a sign-in button instead.
  document.getElementById('toolbar-pill').classList.toggle('hidden', !!state.guest);
  const authBtn = document.getElementById('app-banner-auth');
  if(authBtn){
    authBtn.classList.toggle('hidden', !state.guest);
    authBtn.textContent = t('loginSignup');
  }
  document.getElementById('fab-add').classList.toggle('active', state.navExpanded);
  document.getElementById('fab-menu').classList.toggle('show', state.navExpanded);
  document.getElementById('fab-menu').classList.toggle('labels-hidden', !state.settings.showAddMenuLabels);

  const avatarBtn = document.getElementById('toolbar-avatar-btn');
  if(state.profile.photo){
    avatarBtn.style.backgroundImage = `url('${state.profile.photo}')`;
    avatarBtn.textContent = '';
  } else {
    avatarBtn.style.backgroundImage = 'none';
    avatarBtn.textContent = initials(state.profile.name);
  }

  /* Mobile-only: '+' doesn't make sense while browsing Store/Management
     (reached via the capsule next to this same button), so it swaps to a
     "back to today" control there instead of opening the add-menu — see
     the click handler in initFabAndMenuInteractions() for the behavior. */
  const fab = document.getElementById('fab-add');
  const inStoreOrAdmin = state.menuPanelOpen && (state.menuSubView === 'store' || state.menuSubView === 'admin');
  fab.setAttribute('aria-label', inStoreOrAdmin ? t('calendar') : t('add'));
  fab.innerHTML = inStoreOrAdmin ? ICONS.calendarIcon
    : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></svg>';

  const backBtn = document.getElementById('back-today-btn');
  backBtn.textContent = t('backToToday');
  if(window.innerWidth >= 960){
    /* Desktop: #page-calendar itself is height:100% (matching #page-
       home's .desktop-box, so the two cards read as a pair) — anchor
       straddling its own visible bottom border, same as the mobile
       home-widget pill below, rather than the shorter inner
       #cal-content wrapper. Shown whenever the viewed month (calCursor)
       or the highlighted day (homeDate — the month grid's own "selected"
       class is keyed off this, not calCursor; see renderCalendar())
       isn't today, since tapping a day within the current month moves
       homeDate off today without touching calCursor at all. */
    backBtn.classList.toggle('show', !sameDay(state.calCursor, today) || !sameDay(state.homeDate, today));
    const boxEl = document.getElementById('page-calendar');
    if(boxEl){
      const boxRect = boxEl.getBoundingClientRect();
      backBtn.style.left = (boxRect.left + boxRect.width / 2) + 'px';
      backBtn.style.bottom = 'auto';
      backBtn.style.top = (boxRect.bottom - backBtn.offsetHeight - BACK_TODAY_GAP) + 'px'; // above the edge, not on it
    }
  } else {
    /* Below 960px, the merged home widget IS the calendar (no separate
       #page-calendar column), so the same button anchors to the home
       calendar widget itself (not the میزکار desktop-box below it) and
       tracks homeDate. Explicit `bottom:auto` here clears the base
       mobile CSS's own `bottom:84px` — leaving both that and this
       inline `top` set at once stretches the pill's height to fill the
       gap between them instead of sizing to its own content. */
    backBtn.classList.toggle('show', !sameDay(state.homeDate, today));
    syncBackTodayButton(); // also re-run every frame while the widget resizes
  }

  /* Quick-add popup aligns to #fab-add's real measured center — desktop
     via `top` (menu opens to the left, vertically centered), mobile via
     `left` (menu opens upward, horizontally centered) — rather than a
     guessed offset, since the toolbar's own size now depends on its
     content (Profile+Management pill width/height). */
  const addRect = fab.getBoundingClientRect();
  const fabMenu = document.getElementById('fab-menu');
  if(window.innerWidth >= 960){
    fabMenu.style.top = (addRect.top + addRect.height / 2) + 'px';
    fabMenu.style.left = '';
  } else {
    fabMenu.style.left = (addRect.left + addRect.width / 2) + 'px';
    fabMenu.style.top = '';
  }
}

function initFabAndMenuInteractions(){
  document.getElementById('fab-add').addEventListener('click', () => {
    if(state.guest) return; // the delegated click handler opens sign-in instead
    if(state.menuPanelOpen && (state.menuSubView === 'store' || state.menuSubView === 'admin')){
      state.menuPanelOpen = false; render();
      return;
    }
    /* The person stays on whatever desk they're on (no jump to planning),
       and nothing else is redrawn: only the button and its menu change,
       so the open/close animation runs smoothly (toolbar.css). */
    state.navExpanded = !state.navExpanded;
    haptic(10);
    updateNav();
  });
  // tap outside the fab-menu collapses it
  document.getElementById('device').addEventListener('pointerdown', (e) => {
    if(state.navExpanded && !e.target.closest('#fab-add, #fab-menu')){
      state.navExpanded = false; updateNav();
    }
  });
}

/* Phone: a sideways swipe on the open Profile/Management panel closes it
   and goes back to the home screen — either direction. The panel follows
   the finger, then slides out (or springs back if the swipe was short).
   Horizontal scrollers, fields and sliders inside keep their own drags. */
function attachMenuSwipeClose(){
  const panel = document.getElementById('page-menu');
  if(!panel) return;
  let x0 = null, y0 = 0, dx = 0, axis = null;
  const skip = t => t.closest('input, textarea, select, .events-scroll, .store-grid, .toggle-pair, .dob-cal-popover, .logout-hold-btn');
  panel.addEventListener('pointerdown', e => {
    if(window.innerWidth >= 960 || !state.menuPanelOpen || skip(e.target)) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null;
  });
  panel.addEventListener('pointermove', e => {
    if(x0 === null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if(!axis && (Math.abs(mx) > 10 || Math.abs(my) > 10)) axis = Math.abs(mx) > Math.abs(my) * 1.3 ? 'x' : 'y';
    if(axis !== 'x') return;
    dx = mx;
    panel.style.transition = 'none';
    panel.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if(x0 === null) return;
    x0 = null;
    if(axis !== 'x') return;
    panel.style.transition = '';
    const close = Math.abs(dx) > Math.min(110, panel.clientWidth * 0.28);
    if(close){
      // Finish the slide out in the swipe's direction, then close for real.
      panel.style.transform = `translateX(${dx > 0 ? '100%' : '-100%'})`;
      setTimeout(() => {
        panel.style.transform = '';
        state.menuPanelOpen = false; state.menuSubView = null;
        render();
      }, 260);
    } else {
      panel.style.transform = '';
    }
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
}

function doLogout(){
  if(REAL_LOGIN_DISABLED) return; // no account to sign out of
  Cloud.signOut();
  enterGuestMode();
  state.menuPanelOpen = false;
  state.menuSubView = null;
  render();
}

/* Press-and-hold (3s) instead of a plain tap for the logout button —
   the fill/color CSS transitions (.holding class, see .logout-hold-*
   rules) are purely visual; this is what actually drives the timing and
   calls doLogout() once the hold completes. Releasing early (pointerup/
   leave/cancel) before 3s just resets the fill via the 'holding' class
   transitioning back to scale(0) — no separate "cancel" animation
   needed, the same transition runs in reverse. */
function attachLogoutHold(){
  const root = document.getElementById('device');
  if(!root) return;
  let timer = null, firedByHold = false;
  const press = e => {
    const btn = e.target.closest('.logout-hold-btn');
    if(!btn) return;
    btn.classList.add('holding');
    timer = setTimeout(() => {
      timer = null;
      firedByHold = true; // the click the browser fires right after this pointerup must not also show the toast
      haptic(30);
      doLogout();
    }, 3000);
  };
  const release = () => {
    if(timer){ clearTimeout(timer); timer = null; }
    document.querySelectorAll('.logout-hold-btn.holding').forEach(b => b.classList.remove('holding'));
  };
  root.addEventListener('pointerdown', press);
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('pointerleave', release, true);
  root.addEventListener('click', e => {
    if(!firedByHold) return;
    firedByHold = false;
    if(e.target.closest('.logout-hold-btn')) e.stopPropagation();
  }, true);
}
