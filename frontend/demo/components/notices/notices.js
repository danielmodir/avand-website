/* ============ MESSAGES FROM THE TEAM (Profile → پیام‌ها) ============
   Sent from the admin panel to one person, a filtered group or everyone
   (backend-php/lib/notices.php, Django apps/notifications). An unread one
   shows as a small centered popup when the app opens (welcomeChain in
   js/app.js); all of them stay on the Messages page. Only with an
   account and a backend. */
let noticeList = null;      // newest first (null = not loaded)
let noticeLoading = false;

function noticesAvailable(){ return !REAL_LOGIN_DISABLED && !state.guest && !!Cloud.notices; }
function noticeUnread(){ return (noticeList || []).filter(n => !n.seen).length; }

function loadNotices(){
  if(!noticesAvailable() || noticeLoading) return Promise.resolve(noticeList || []);
  noticeLoading = true;
  return Cloud.notices().then(list => { noticeList = list || []; return noticeList; })
    .catch(() => noticeList || [])
    .finally(() => { noticeLoading = false; });
}

function markNoticesSeen(ids){
  (noticeList || []).forEach(n => { if(!ids || ids.includes(n.id)) n.seen = true; });
  if(Cloud.noticesSeen) Cloud.noticesSeen(ids).catch(() => {});
}

function noticeRowBadge(){
  const n = noticeUnread();
  return n ? `<span class="count contact-unread">${dig(n)}</span>` : '';
}

/* On opening the app: the newest unread one, as a popup. Resolves to
   whether it showed one (then nothing else pops up this time). */
function maybeShowNotice(){
  if(!noticesAvailable()) return Promise.resolve(false);
  return loadNotices().then(list => {
    const n = list.find(x => !x.seen);
    if(!n || document.getElementById('notice-overlay')) return false;
    const el = document.createElement('div');
    el.id = 'notice-overlay';
    el.className = 'notice-overlay';
    const more = noticeUnread() - 1;
    el.innerHTML = `<div class="notice-dialog" role="dialog" aria-modal="true" aria-labelledby="notice-title" dir="${lang() === 'fa' ? 'rtl' : 'ltr'}">
      <div class="notice-icon">${ICONS.mail}</div>
      <div class="notice-from">${t('noticeFrom')}</div>
      <h2 id="notice-title">${escapeHtml(n.title)}</h2>
      <p>${escapeHtml(n.body).replace(/\n/g, '<br>')}</p>
      <div class="notice-actions">
        <button type="button" class="btn btn-primary" data-notice="ok">${t('noticeOk')}</button>
        ${more > 0 ? `<button type="button" class="btn btn-outline" data-notice="all">${t('noticeMore').replace('{n}', dig(more))}</button>` : ''}
      </div></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-notice]');
      if(!b && e.target !== el) return;
      markNoticesSeen([n.id]);
      el.remove();
      if(b && b.dataset.notice === 'all'){ state.menuPanelOpen = true; state.menuSubView = 'notices'; }
      render();
    });
    document.getElementById('device').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    return true;
  });
}

function renderNoticesPage(){
  if(!noticesAvailable()) return `${subHeader(t('notices'))}<div class="empty-hint">${t('noticesOffline')}</div>`;
  if(noticeList === null){ loadNotices().then(() => { if(state.menuSubView === 'notices') render(); }); return `${subHeader(t('notices'))}<div class="empty-hint">…</div>`; }
  const unread = noticeList.filter(n => !n.seen).map(n => n.id);
  if(unread.length) setTimeout(() => markNoticesSeen(unread), 1500); // opened the page: they're read
  const rows = noticeList.map(n => `
    <div class="store-card notice-card ${n.seen ? '' : 'unread'}" dir="${lang() === 'fa' ? 'rtl' : 'ltr'}">
      <div class="notice-card-head"><b>${escapeHtml(n.title)}</b><span>${formatDateLabel(String(n.created_at).slice(0, 10))}</span></div>
      <p>${escapeHtml(n.body).replace(/\n/g, '<br>')}</p>
    </div>`).join('');
  return `${subHeader(t('notices'))}${rows || `<div class="empty-hint">${t('noticesEmpty')}</div>`}`;
}
