/* ============ GROUP PLANNING (desk + dialogs) ============
   The "Group planning" desk: a square tile per group (two to a row) with
   its color, name and members; "+" at the top makes a new group. Tapping a
   tile opens the group: its members, and the picked day's tasks, habits
   and events (only there, not on the desk). Press and hold a tile (or
   right-click) for Edit / Group link / Delete (owner) or Leave (others).
   Roles: the owner does everything; admins also add tasks, habits and
   events; members tick. Data: js/core/groups.js. */
const GROUP_PLUS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></svg>';
const GROUP_EXIT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3h9v2H5v14h9v2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm11.6 4.4L21.2 12l-4.6 4.6-1.4-1.4 2.2-2.2H9v-2h8.4l-2.2-2.2 1.4-1.4z"/></svg>';

/* The owner and admins add a group's tasks, habits and events. */
function groupCanAdd(g){ return !!g && (g.owner || g.admin); }

/* Inline colors for a group item's row: its tick and border in the
   group's color (the color this person picked for it). */
function groupStyleAttr(item){
  const c = groupColorOf(item);
  if(!c) return '';
  const on = colorIsLight(c) ? '#1A1708' : '#FFFFFF';
  return ` style="--task-color:${c};--task-on:${on};--habit-color:${c};--habit-on:${on};--event-color:${c};--group-c:${c}"`;
}
/* The group's name on a row, and "2/5" for an each-person item. */
function groupRowBadge(item, key){
  if(!item.groupId) return '';
  const g = groupById(item.groupId);
  if(!g) return '';
  let count = '';
  if(item.doneMode === 'each' && key){
    const c = groupDoneCount(item, groupMarkKeyFor(item, key));
    if(c && c.total > 1) count = `<span class="group-count" title="${escapeAttr(t('groupDoneOf'))}">${dig(c.done)}/${dig(c.total)}</span>`;
  }
  return `<span class="group-tag">${escapeHtml(g.name)}</span>${count}`;
}
/* After a tick: the rows' "2/5" in place (ticking doesn't re-render). */
function refreshGroupCounts(item){
  document.querySelectorAll(`.swipe-wrap[data-swipe-id="${CSS.escape(item.id)}"]`).forEach(wrap => {
    const badge = wrap.querySelector('.group-count');
    const day = wrap.querySelector('.checkbox[data-date]')?.dataset.date;
    if(!badge || !day) return;
    const c = groupDoneCount(item, groupMarkKeyFor(item, day));
    if(c) badge.textContent = `${dig(c.done)}/${dig(c.total)}`;
  });
}
function groupMarkKeyFor(item, key){
  if(item.completedDates) return key; // a habit: per day
  return isRecurringTask(item) ? key : 'once';
}

function goToGroupsDesk(){
  const i = deskKeys().indexOf('groupsDesktop');
  if(i >= 0){ state.activeDesktopIndex = i; }
}

/* ---- the desk: square tiles ---- */
function renderGroupsPane(d){
  const add = `<button type="button" class="group-new-btn" data-action="group-new">${GROUP_PLUS}<span>${t('groupNew')}</span></button>`;
  if(!state.groups.length){
    return `<div class="groups-empty">
      <div class="groups-empty-icon">${ICONS.peopleIcon}</div>
      <p>${t('groupsEmpty')}</p>${add}</div>`;
  }
  const items = itemsForDate(d);
  return `<div class="groups-head">${add}</div><div class="groups-grid">${state.groups.map(g => groupTile(g, items)).join('')}</div>`;
}

function groupTile(g, items){
  const n = items.tasks.concat(items.habits, items.events).filter(x => x.groupId === g.id).length;
  const role = g.owner ? t('groupOwnerBadge') : g.admin ? t('groupAdmin') : '';
  return `<div class="group-tile" style="--group-c:${g.color}" data-select-type="group" data-select-id="${escapeAttr(g.id)}"
      data-action="group-view" data-id="${escapeAttr(g.id)}" role="button" tabindex="0">
    <span class="group-tile-dot" aria-hidden="true">${ICONS.peopleIcon}</span>
    <span class="group-tile-name">${escapeHtml(g.name)}</span>
    <span class="group-tile-meta">${t('groupMembersN').replace('{n}', dig(g.members.length || 1))}${role ? ` · ${role}` : ''}</span>
    <span class="group-tile-count">${n ? t('groupTodayN').replace('{n}', dig(n)) : t('groupNothingToday')}</span>
  </div>`;
}

/* ---- the group's own page (tap a tile) ---- */
let groupViewId = null;

function openGroupView(id){
  if(!groupById(id)) return;
  groupViewId = id;
  const el = groupOverlay('group-view-overlay', closeGroupView);
  renderGroupView();
  requestAnimationFrame(() => el.classList.add('show'));
}
function closeGroupView(){
  groupViewId = null;
  dropGroupOverlay('group-view-overlay', () => !groupViewId);
}
/* render() calls this: the open page follows ticks, edits and new items. */
function refreshGroupView(){ if(groupViewId) renderGroupView(); }

function renderGroupView(){
  const el = document.getElementById('group-view-overlay');
  const g = groupViewId ? groupById(groupViewId) : null;
  if(!el) return;
  if(!g){ closeGroupView(); return; }
  const d = state.homeDate || today, key = dateKey(d);
  const items = itemsForDate(d), of = x => x.groupId === g.id;
  const events = sortEvents(items.events.filter(of)), tasks = items.tasks.filter(of), habits = items.habits.filter(of);
  const body = (events.length ? `<div class="section-title">${t('events')}</div><div class="events-scroll">${events.map(e => eventCard(e)).join('')}</div>` : '')
    + (tasks.length ? `<div class="section-title">${t('tasks')}</div>${tasks.map(x => taskRow(x, key)).join('')}` : '')
    + (habits.length ? `<div class="section-title">${t('habits')}</div>${habits.map(h => habitRow(h, d)).join('')}` : '');
  const scroll = el.querySelector('.group-view-body')?.scrollTop || 0;
  el.innerHTML = `<div class="group-dialog group-view" role="dialog" aria-modal="true" aria-labelledby="group-view-title" dir="${lang() === 'fa' ? 'rtl' : 'ltr'}" style="--group-c:${g.color}">
    <div class="popup-topbar">
      <span class="popup-topbar-title" id="group-view-title"><span class="group-dot" aria-hidden="true"></span>${escapeHtml(g.name)}</span>
      <button type="button" class="popup-close" data-gv="close" aria-label="${t('closeBtn')}">${ICONS.close}</button>
    </div>
    <div class="group-dialog-body group-view-body">
      <div class="group-member-list">${g.members.map(m => groupMemberChip(m)).join('')}</div>
      <div class="group-view-day">${formatDateLabel(key)}</div>
      ${body || `<div class="empty-hint">${t('groupNothingToday')}</div>`}
    </div>
    <div class="group-dialog-actions group-view-actions">
      ${groupCanAdd(g) ? `<button type="button" class="btn btn-primary" data-gv="add">${GROUP_PLUS}<span>${t('add')}</span></button>` : ''}
      <button type="button" class="btn btn-outline" data-gv="edit">${ICONS.pencilIcon}<span>${t(g.owner ? 'groupEdit' : 'groupMyColor')}</span></button>
    </div>
  </div>`;
  el.querySelector('.group-view-body').scrollTop = scroll;
  el.querySelector('.group-dialog').addEventListener('click', e => {
    const b = e.target.closest('[data-gv]');
    if(!b) return;
    if(b.dataset.gv === 'close') closeGroupView();
    else if(b.dataset.gv === 'edit') openGroupDialog(g.id);
    else if(b.dataset.gv === 'add') openGroupAddMenu(b, g.id);
  });
}

function groupMemberChip(m){
  const role = m.owner ? t('groupOwnerBadge') : m.admin ? t('groupAdmin') : '';
  return `<span class="group-member ${m.owner || m.admin ? 'lead' : ''}">${escapeHtml(m.name)}${role ? ` · ${role}` : ''}</span>`;
}

/* "+": task, habit or event, already in that group. */
function openGroupAddMenu(btn, id){
  showMiniMenu(btn, ['task', 'habit', 'event'].map(k => ({ label: t(k), run: () => {
    closeGroupView(); // the form opens on its own; the group page comes back after
    popupPresetGroup = id; openPopup(k, btn, null);
  } })));
}

function showMiniMenu(anchor, entries){
  closeRowContextMenu();
  const menu = document.createElement('div');
  menu.id = 'row-context-menu';
  menu.className = 'row-context-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = entries.map((e, i) => `<button type="button" role="menuitem" data-i="${i}" class="${e.danger ? 'danger' : ''}">${e.icon || ''}${escapeHtml(e.label)}</button>`).join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
  const x = lang() === 'fa' ? r.left : r.right - w;
  const y = r.top - h - 6 > 8 ? r.top - h - 6 : r.bottom + 6;
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if(!b) return;
    e.stopPropagation();
    closeRowContextMenu();
    entries[Number(b.dataset.i)].run();
  });
  // A tap anywhere else closes it (the item-selection code clears it too).
  setTimeout(() => document.addEventListener('pointerdown', function off(e){
    if(!e.target.closest('#row-context-menu')){ closeRowContextMenu(); document.removeEventListener('pointerdown', off, true); }
  }, true), 0);
}

/* Press-and-hold menu on a tile (items.js showRowContextMenu). */
function groupMenuEntries(id){
  const g = groupById(id);
  if(!g) return [];
  return [
    { icon: ICONS.pencilIcon, label: t('editBtn'), run: () => openGroupDialog(id) },
    { icon: ICONS.linkIcon, label: t('groupLink'), run: () => shareGroupLink(g) },
    g.owner
      ? { icon: ICONS.trash, label: t('groupDelete'), danger: true, run: () => deleteGroupAsk(g) }
      : { icon: GROUP_EXIT, label: t('groupLeave'), danger: true, run: () => leaveGroupAsk(g) },
  ];
}

function shareGroupLink(g){
  if(!g.token) return;
  const url = groupUrl(g.token);
  if(navigator.share) navigator.share({ title: g.name, text: t('groupShareText').replace('{name}', g.name), url }).catch(() => {});
  else { copyText(url); showToast(t('linkCopied')); }
}
function deleteGroupAsk(g){
  appConfirm(t('groupDeleteConfirm').replace('{name}', g.name), t('groupDelete'), true).then(yes => {
    if(!yes) return;
    closeGroupDialog(); closeGroupView();
    groupCall(() => Cloud.deleteGroup(g.id), t('groupDeleted')).catch(() => {});
  });
}
function leaveGroupAsk(g){
  appConfirm(t('groupLeaveConfirm').replace('{name}', g.name), t('groupLeave'), true).then(yes => {
    if(!yes) return;
    closeGroupDialog(); closeGroupView();
    groupCall(() => Cloud.leaveGroup(g.id), t('groupLeft')).catch(() => {});
  });
}

/* The app's own yes/no box: the browser's confirm() is blocked in some
   places the app runs (an embedded browser, the Android app). */
function appConfirm(text, okLabel, danger){
  return new Promise(resolve => {
    document.getElementById('app-confirm-overlay')?.remove();
    const el = document.createElement('div');
    el.id = 'app-confirm-overlay';
    el.className = 'app-confirm-overlay';
    el.innerHTML = `<div class="app-confirm" role="alertdialog" aria-modal="true" dir="${lang() === 'fa' ? 'rtl' : 'ltr'}">
      <p>${escapeHtml(text)}</p>
      <div class="app-confirm-btns">
        <button type="button" class="btn btn-outline" data-ok="0">${t('groupCancel')}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok="1">${escapeHtml(okLabel || t('groupConfirm'))}</button>
      </div></div>`;
    const done = v => { el.remove(); document.removeEventListener('keydown', keys, true); resolve(v); };
    const keys = e => { if(e.key === 'Escape'){ e.stopPropagation(); done(false); } };
    el.addEventListener('click', e => {
      if(e.target === el) return done(false);
      const b = e.target.closest('[data-ok]');
      if(b) done(b.dataset.ok === '1');
    });
    document.addEventListener('keydown', keys, true);
    document.getElementById('device').appendChild(el);
    el.querySelector('[data-ok="1"]').focus();
  });
}

/* Shared overlay for the group page and the group dialog. */
function groupOverlay(id, onBackdrop){
  let el = document.getElementById(id);
  if(!el){
    el = document.createElement('div');
    el.id = id;
    el.className = 'group-dialog-overlay';
    el.addEventListener('click', e => { if(e.target === el) onBackdrop(); });
    document.getElementById('device').appendChild(el);
  }
  return el;
}
function dropGroupOverlay(id, stillClosed){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('show');
  setTimeout(() => { if(stillClosed()) el.remove(); }, 250);
}

/* ---- create / edit dialog ---- */
let groupDraft = null;

function openGroupDialog(id){
  const g = id ? groupById(id) : null;
  if(id && !g) return;
  const choices = groupColorChoices();
  groupDraft = {
    id: g ? g.id : null, owner: g ? g.owner : true,
    name: g ? g.name : '',
    color: g ? g.color : (choices[0] || ITEM_COLOR_CHOICES[0]),
    members: new Set(g ? g.members.filter(m => !m.me).map(m => String(m.id)) : []),
    admins: new Set(g ? g.members.filter(m => !m.me && m.admin).map(m => String(m.id)) : []),
    friendsOpen: false, busy: false,
  };
  const el = groupOverlay('group-dialog-overlay', closeGroupDialog);
  renderGroupDialog();
  requestAnimationFrame(() => el.classList.add('show'));
  if(!state.connections.length) refreshConnections().then(() => { if(groupDraft) renderGroupDialog(); });
  if(!g) setTimeout(() => document.getElementById('group-name')?.focus(), 150);
}

function closeGroupDialog(){
  groupDraft = null;
  dropGroupOverlay('group-dialog-overlay', () => !groupDraft);
}

function groupFriendsList(){
  const g = groupDraft.id ? groupById(groupDraft.id) : null;
  const friends = state.connections.filter(c => c.status === 'accepted').map(c => ({ id: String(c.id), name: c.name, sub: c.userId || '' }));
  // People who joined by link (maybe not my friends): still listed, ticked.
  (g ? g.members : []).filter(m => !m.me && !friends.some(f => f.id === String(m.id)))
    .forEach(m => friends.push({ id: String(m.id), name: m.name, sub: m.public_id ? 'TJ-' + m.public_id : '' }));
  return friends;
}
function groupPickedLabel(){
  const picked = groupFriendsList().filter(f => groupDraft.members.has(f.id));
  return picked.length ? picked.map(f => f.name + (groupDraft.admins.has(f.id) ? ` (${t('groupAdmin')})` : '')).join(lang() === 'fa' ? '، ' : ', ') : t('groupPickFriends');
}

function renderGroupDialog(){
  const el = document.getElementById('group-dialog-overlay');
  if(!el || !groupDraft) return;
  const d = groupDraft;
  const g = d.id ? groupById(d.id) : null;
  const canEdit = d.owner;
  const friends = groupFriendsList();
  const choices = groupColorChoices();
  if(!choices.includes(d.color)) choices.unshift(d.color); // its current color stays pickable
  const dir = lang() === 'fa' ? 'rtl' : 'ltr';
  el.innerHTML = `<div class="group-dialog" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" dir="${dir}">
    <div class="popup-topbar">
      <span class="popup-topbar-title" id="group-dialog-title">${t(!g ? 'groupNew' : g.owner ? 'groupEdit' : 'groupMyColor')}</span>
      <button type="button" class="popup-close" data-gd="close" aria-label="${t('closeBtn')}">${ICONS.close}</button>
    </div>
    <div class="group-dialog-body">
      ${canEdit
        ? `<div class="float-field"><input type="text" id="group-name" placeholder=" " maxlength="60" value="${escapeAttr(d.name)}" autocomplete="off"><label for="group-name">${t('groupName')}</label></div>`
        : `<h3 class="group-dialog-name">${escapeHtml(d.name)}</h3>`}
      <div class="field-label">${t('groupMembers')}</div>
      ${canEdit ? `
        <button type="button" class="group-friends-toggle ${d.friendsOpen ? 'open' : ''}" data-gd="friends" aria-expanded="${d.friendsOpen}">
          <span>${escapeHtml(groupPickedLabel())}</span>${ICONS.chevronDown}
        </button>
        ${d.friendsOpen ? `<div class="group-friends-list">${friends.length ? friends.map(f => `
          <div class="group-friend">
            <span class="group-friend-name">${escapeHtml(f.name)}</span>
            ${f.sub ? `<span class="group-friend-sub" dir="ltr">${escapeHtml(f.sub)}</span>` : ''}
            <label class="group-role"><input type="checkbox" data-role="admin" data-friend="${escapeAttr(f.id)}" ${d.admins.has(f.id) ? 'checked' : ''}><span>${t('groupAdmin')}</span></label>
            <label class="group-role"><input type="checkbox" data-role="member" data-friend="${escapeAttr(f.id)}" ${d.members.has(f.id) ? 'checked' : ''}><span>${t('groupMember')}</span></label>
          </div>`).join('') : `<div class="empty-hint">${t('groupNoFriends')}</div>`}</div>
          <div class="profile-hint">${t('groupRolesHint')}</div>` : ''}`
        : `<div class="group-member-list">${(g ? g.members : []).map(m => groupMemberChip(m)).join('')}</div>`}
      <div class="field-label">${t('groupColor')}</div>
      <div class="color-swatches" role="radiogroup" aria-label="${escapeAttr(t('groupColor'))}">
        ${choices.map(c => `<button type="button" class="color-swatch ${d.color === c ? 'active' : ''}" data-gd="color" data-color="${c}" style="--c:${c}" role="radio" aria-checked="${d.color === c}" aria-label="${c}"></button>`).join('')}
      </div>
      <div class="profile-hint">${t(g ? 'groupColorMine' : 'groupColorHint')}</div>
      ${g ? `
        <div class="field-label">${t('groupLink')}</div>
        <div class="group-link-row">
          <span class="group-link-url" dir="ltr">${escapeHtml(groupUrl(g.token))}</span>
          <button type="button" class="link-btn" data-gd="copy" aria-label="${t('copyBtn')}">${ICONS.copyIcon}</button>
          ${navigator.share ? `<button type="button" class="link-btn" data-gd="share" aria-label="${t('shareLink')}">${ICONS.shareIcon}</button>` : ''}
        </div>
        ${g.owner ? `<button type="button" class="btn btn-outline btn-small group-newlink" data-gd="newlink">${t('newLink')}</button>` : ''}` : ''}
    </div>
    <div class="group-dialog-actions">
      <button type="button" class="btn btn-primary group-save" data-gd="save" ${d.busy ? 'disabled' : ''}>${t('groupConfirm')}</button>
      ${g ? (g.owner
        ? `<button type="button" class="btn btn-outline group-danger" data-gd="delete">${ICONS.trash}<span>${t('groupDelete')}</span></button>`
        : `<button type="button" class="btn btn-outline group-danger" data-gd="leave">${GROUP_EXIT}<span>${t('groupLeave')}</span></button>`) : ''}
    </div>
  </div>`;
  wireGroupDialog(el);
}

function wireGroupDialog(el){
  const d = groupDraft;
  document.getElementById('group-name')?.addEventListener('input', e => { d.name = e.target.value; });
  // An admin is a member too; someone who isn't a member isn't an admin.
  el.querySelectorAll('[data-role]').forEach(cb => cb.addEventListener('change', () => {
    const id = cb.dataset.friend;
    if(cb.dataset.role === 'admin'){
      if(cb.checked){ d.admins.add(id); d.members.add(id); } else d.admins.delete(id);
    } else if(cb.checked) d.members.add(id);
    else { d.members.delete(id); d.admins.delete(id); }
    el.querySelectorAll(`[data-friend="${CSS.escape(id)}"]`).forEach(x => { x.checked = x.dataset.role === 'admin' ? d.admins.has(id) : d.members.has(id); });
    const s = el.querySelector('.group-friends-toggle span');
    if(s) s.textContent = groupPickedLabel();
  }));
  el.querySelector('.group-dialog').addEventListener('click', e => {
    const b = e.target.closest('[data-gd]');
    if(!b) return;
    const g = d.id ? groupById(d.id) : null;
    const act = b.dataset.gd;
    if(act === 'close') closeGroupDialog();
    else if(act === 'friends'){ d.friendsOpen = !d.friendsOpen; renderGroupDialog(); }
    else if(act === 'color'){ d.color = b.dataset.color; el.querySelectorAll('.color-swatch').forEach(s => { s.classList.toggle('active', s === b); s.setAttribute('aria-checked', s === b); }); }
    else if(act === 'copy' && g){ copyText(groupUrl(g.token)); showToast(t('linkCopied')); }
    else if(act === 'share' && g) shareGroupLink(g);
    else if(act === 'newlink' && g){
      appConfirm(t('newLinkConfirm'), t('newLink')).then(yes => {
        if(yes) groupCall(() => Cloud.resetGroupLink(g.id), t('newLinkDone')).then(renderGroupDialog).catch(() => {});
      });
    }
    else if(act === 'delete' && g) deleteGroupAsk(g);
    else if(act === 'leave' && g) leaveGroupAsk(g);
    else if(act === 'save') saveGroupDialog();
  });
}

function saveGroupDialog(){
  const d = groupDraft;
  if(!d || d.busy) return;
  const name = (d.name || '').trim();
  if(d.owner && !name){ showToast(t('groupNameRequired')); document.getElementById('group-name')?.focus(); return; }
  if(groupBlockedColors().includes(d.color.toUpperCase())){ showToast(t('groupColorTaken')); return; }
  d.busy = true; renderGroupDialog();
  const members = [...d.members], admins = [...d.admins].filter(id => d.members.has(id));
  const call = !d.id
    ? () => Cloud.createGroup({ name, color: d.color, members, admins })
    : d.owner ? () => Cloud.updateGroup(d.id, { name, color: d.color, members, admins })
    : () => Cloud.updateGroup(d.id, { color: d.color });
  groupCall(call, t(d.id ? 'groupSaved' : 'groupCreated')).then(() => {
    if(!d.id) goToGroupsDesk();
    closeGroupDialog();
    render();
  }).catch(() => { if(groupDraft){ groupDraft.busy = false; renderGroupDialog(); } });
}

/* ---- details of a group item: who did it ----
   Each person ticks their own: a ring with the share of members who did
   it (that day) and their names. One tick for all: who ticked it. */
function groupDoneHtml(item, type, day){
  const g = item.groupId ? groupById(item.groupId) : null;
  if(!g || type === 'event') return '';
  const key = groupMarkKeyFor(item, day);
  const marks = (item.groupMarks || []).filter(m => m.key === key && m.status === 'done');
  const nameOf = m => { const mem = g.members.find(x => (m.me && x.me) || String(x.id) === String(m.user)); return mem ? mem.name : (m.name || ''); };
  if(item.doneMode === 'shared'){
    return marks.length ? `<div class="group-done-shared">${ICONS.check}<span>${escapeHtml(t('groupSharedDoneBy').replace('{name}', nameOf(marks[0])))}</span></div>` : '';
  }
  const doneIds = new Set(marks.map(m => m.me ? 'me' : String(m.user)));
  const done = g.members.filter(x => doneIds.has(x.me ? 'me' : String(x.id)));
  const rest = g.members.filter(x => !done.includes(x));
  const total = g.members.length || 1;
  const pct = Math.round(done.length / total * 100);
  const C = 2 * Math.PI * 40;
  return `<div class="section-title">${t('groupDoneOf')}</div>
    <div class="group-done" style="--group-c:${g.color}">
      <div class="group-done-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" class="track"/><circle cx="50" cy="50" r="40" class="fill" stroke-dasharray="${C * pct / 100} ${C}"/></svg>
        <span>${dig(pct)}${lang() === 'fa' ? '٪' : '%'}</span>
      </div>
      <div class="group-done-names">
        ${done.map(m => `<span class="group-member lead">${ICONS.check}${escapeHtml(m.name)}</span>`).join('')}
        ${rest.map(m => `<span class="group-member">${escapeHtml(m.name)}</span>`).join('')}
        <div class="profile-hint">${t('groupDoneCount').replace('{done}', dig(done.length)).replace('{total}', dig(total))}</div>
      </div>
    </div>`;
}

document.addEventListener('keydown', e => {
  if(e.key !== 'Escape' || document.getElementById('app-confirm-overlay')) return;
  if(groupDraft) closeGroupDialog(); else if(groupViewId) closeGroupView();
});
