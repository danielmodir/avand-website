/* ============ GROUP PLANNING (desk + dialog) ============
   The "Group planning" desk: a card per group with its color, members and
   the picked day's group tasks, habits and events; "+" at the top makes a
   new group. Press and hold a group's header (or right-click) for Edit /
   Group link / Delete (owner) or Leave (members). Data: js/core/groups.js. */
const GROUP_PLUS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></svg>';
const GROUP_EXIT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3h9v2H5v14h9v2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm11.6 4.4L21.2 12l-4.6 4.6-1.4-1.4 2.2-2.2H9v-2h8.4l-2.2-2.2 1.4-1.4z"/></svg>';

/* Inline colors for a group item's row: its tick and border in the
   group's color (the color this person picked for it). */
function groupStyleAttr(item){
  const c = groupColorOf(item);
  if(!c) return '';
  const on = colorIsLight(c) ? '#1A1708' : '#FFFFFF';
  return ` style="--task-color:${c};--task-on:${on};--habit-color:${c};--habit-on:${on};--event-color:${c};--group-c:${c}"`;
}
/* The group's name on a row outside the group desk, and "2/5" for an
   each-person item. */
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

/* ---- the desk ---- */
function renderGroupsPane(d){
  const add = `<button type="button" class="group-new-btn" data-action="group-new">${GROUP_PLUS}<span>${t('groupNew')}</span></button>`;
  if(!state.groups.length){
    return `<div class="groups-empty">
      <div class="groups-empty-icon">${ICONS.peopleIcon}</div>
      <p>${t('groupsEmpty')}</p>${add}</div>`;
  }
  const items = itemsForDate(d);
  return `<div class="groups-head">${add}</div>${state.groups.map(g => groupCard(g, items, d)).join('')}`;
}

function groupCard(g, items, d){
  const key = dateKey(d);
  const of = x => x.groupId === g.id;
  const events = sortEvents(items.events.filter(of)), tasks = items.tasks.filter(of), habits = items.habits.filter(of);
  const body = (events.length ? `<div class="events-scroll">${events.map(e => eventCard(e)).join('')}</div>` : '')
    + tasks.map(x => taskRow(x, key)).join('') + habits.map(h => habitRow(h, d)).join('');
  const n = g.members.length || 1;
  return `<section class="group-card" style="--group-c:${g.color}">
    <div class="group-card-head" data-select-type="group" data-select-id="${escapeAttr(g.id)}">
      <span class="group-dot" aria-hidden="true"></span>
      <button type="button" class="group-name" data-action="group-open" data-id="${escapeAttr(g.id)}">${escapeHtml(g.name)}</button>
      <span class="group-meta">${t('groupMembersN').replace('{n}', dig(n))}${g.owner ? ` · ${t('groupOwnerBadge')}` : ''}</span>
      <button type="button" class="group-add-item" data-action="group-add-item" data-id="${escapeAttr(g.id)}" aria-label="${escapeAttr(t('groupAddItem'))}">${GROUP_PLUS}</button>
    </div>
    <div class="group-card-body">${body || `<div class="empty-hint">${t('groupNothingToday')}</div>`}</div>
  </section>`;
}

/* "+" on a group's header: task, habit or event, already in that group. */
function openGroupAddMenu(btn){
  const id = btn.dataset.id;
  showMiniMenu(btn, ['task', 'habit', 'event'].map(k => ({ label: t(k), run: () => { popupPresetGroup = id; openPopup(k, btn, null); } })));
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
  const y = r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6;
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

/* Press-and-hold menu on a group's header (items.js showRowContextMenu). */
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
  if(!confirm(t('groupDeleteConfirm').replace('{name}', g.name))) return;
  closeGroupDialog();
  groupCall(() => Cloud.deleteGroup(g.id), t('groupDeleted')).catch(() => {});
}
function leaveGroupAsk(g){
  if(!confirm(t('groupLeaveConfirm').replace('{name}', g.name))) return;
  closeGroupDialog();
  groupCall(() => Cloud.leaveGroup(g.id), t('groupLeft')).catch(() => {});
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
    friendsOpen: false, busy: false,
  };
  let el = document.getElementById('group-dialog-overlay');
  if(!el){
    el = document.createElement('div');
    el.id = 'group-dialog-overlay';
    el.className = 'group-dialog-overlay';
    el.addEventListener('click', e => { if(e.target === el) closeGroupDialog(); });
    document.getElementById('device').appendChild(el);
  }
  renderGroupDialog();
  requestAnimationFrame(() => el.classList.add('show'));
  if(!state.connections.length) refreshConnections().then(() => { if(groupDraft) renderGroupDialog(); });
  if(!g) setTimeout(() => document.getElementById('group-name')?.focus(), 150);
}

function closeGroupDialog(){
  groupDraft = null;
  const el = document.getElementById('group-dialog-overlay');
  if(!el) return;
  el.classList.remove('show');
  setTimeout(() => { if(!groupDraft) el.remove(); }, 250);
}

function groupFriendsList(){
  const g = groupDraft.id ? groupById(groupDraft.id) : null;
  const friends = state.connections.filter(c => c.status === 'accepted').map(c => ({ id: String(c.id), name: c.name, sub: c.userId || '' }));
  // People who joined by link (maybe not my friends): still listed, ticked.
  (g ? g.members : []).filter(m => !m.me && !friends.some(f => f.id === String(m.id)))
    .forEach(m => friends.push({ id: String(m.id), name: m.name, sub: m.public_id ? 'TJ-' + m.public_id : '' }));
  return friends;
}

function renderGroupDialog(){
  const el = document.getElementById('group-dialog-overlay');
  if(!el || !groupDraft) return;
  const d = groupDraft;
  const g = d.id ? groupById(d.id) : null;
  const canEdit = d.owner;
  const friends = groupFriendsList();
  const picked = friends.filter(f => d.members.has(f.id));
  const choices = groupColorChoices();
  if(!choices.includes(d.color)) choices.unshift(d.color); // its current color stays pickable
  const dir = lang() === 'fa' ? 'rtl' : 'ltr';
  el.innerHTML = `<div class="group-dialog" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" dir="${dir}">
    <div class="popup-topbar">
      <span class="popup-topbar-title" id="group-dialog-title">${t(g ? 'groupEdit' : 'groupNew')}</span>
      <button type="button" class="popup-close" data-gd="close" aria-label="${t('closeBtn')}">${ICONS.close}</button>
    </div>
    <div class="group-dialog-body">
      ${canEdit
        ? `<div class="float-field"><input type="text" id="group-name" placeholder=" " maxlength="60" value="${escapeAttr(d.name)}" autocomplete="off"><label for="group-name">${t('groupName')}</label></div>`
        : `<h3 class="group-dialog-name">${escapeHtml(d.name)}</h3>`}
      <div class="field-label">${t('groupMembers')}</div>
      ${canEdit ? `
        <button type="button" class="group-friends-toggle ${d.friendsOpen ? 'open' : ''}" data-gd="friends" aria-expanded="${d.friendsOpen}">
          <span>${picked.length ? picked.map(f => escapeHtml(f.name)).join(lang() === 'fa' ? '، ' : ', ') : t('groupPickFriends')}</span>${ICONS.chevronDown}
        </button>
        ${d.friendsOpen ? `<div class="group-friends-list">${friends.length ? friends.map(f => `
          <label class="group-friend">
            <input type="checkbox" data-friend="${escapeAttr(f.id)}" ${d.members.has(f.id) ? 'checked' : ''}>
            <span class="group-friend-name">${escapeHtml(f.name)}</span>
            ${f.sub ? `<span class="group-friend-sub" dir="ltr">${escapeHtml(f.sub)}</span>` : ''}
          </label>`).join('') : `<div class="empty-hint">${t('groupNoFriends')}</div>`}</div>` : ''}`
        : `<div class="group-member-list">${(g ? g.members : []).map(m => `<span class="group-member ${m.owner ? 'owner' : ''}">${escapeHtml(m.name)}${m.owner ? ` · ${t('groupOwnerBadge')}` : ''}</span>`).join('')}</div>`}
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
  el.querySelectorAll('[data-friend]').forEach(cb => cb.addEventListener('change', () => {
    if(cb.checked) d.members.add(cb.dataset.friend); else d.members.delete(cb.dataset.friend);
    const s = el.querySelector('.group-friends-toggle span');
    const picked = groupFriendsList().filter(f => d.members.has(f.id));
    if(s) s.textContent = picked.length ? picked.map(f => f.name).join(lang() === 'fa' ? '، ' : ', ') : t('groupPickFriends');
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
      if(!confirm(t('newLinkConfirm'))) return;
      groupCall(() => Cloud.resetGroupLink(g.id), t('newLinkDone')).then(renderGroupDialog).catch(() => {});
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
  const members = [...d.members];
  const call = !d.id
    ? () => Cloud.createGroup({ name, color: d.color, members })
    : d.owner ? () => Cloud.updateGroup(d.id, { name, color: d.color, members })
    : () => Cloud.updateGroup(d.id, { color: d.color });
  groupCall(call, t(d.id ? 'groupSaved' : 'groupCreated')).then(() => {
    if(!d.id) goToGroupsDesk();
    closeGroupDialog();
    render();
  }).catch(() => { if(groupDraft){ groupDraft.busy = false; renderGroupDialog(); } });
}

document.addEventListener('keydown', e => { if(e.key === 'Escape' && groupDraft) closeGroupDialog(); });
