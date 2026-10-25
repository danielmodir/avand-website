/* ============ GROUP PLANNING (data) ============
   Groups come from our own API (Cloud.groups(): lib/groups.php or Django
   apps/social/groups.py). A group's tasks, habits and events are put into
   state.tasks / habits / events like the person's own, marked with
   groupId, so the desks, calendar, search and reminders show them as
   usual. They're never part of the person's own synced document (the API
   clients leave groupId items out); they're saved to the group instead.

   Ticks are "marks" on the server: one per person per day (or "once" for a
   one-off task, "once:<subtask id>" for a subtask). doneMode 'each': my
   own mark is my tick; 'shared': anyone's mark is everybody's tick. */
const GROUP_KIND_KEY = { task: 'tasks', habit: 'habits', event: 'events' };
const GROUP_CACHE_KEY = 'toojibee-groups-v1';
const GROUP_LOCAL_FIELDS = ['groupId', 'doneMode', 'groupMine', 'groupBy', 'groupMarks', 'pinned',
  'done', 'skipped', 'statusByDate', 'completedDates', 'skippedDates'];

function groupsAvailable(){ return !!Cloud.supportsGroups && !REAL_LOGIN_DISABLED && !state.guest && Cloud.hasSession(); }
function groupById(id){ return state.groups.find(g => g.id === id) || null; }
function groupColorOf(item){ const g = item && item.groupId ? groupById(item.groupId) : null; return g ? g.color : null; }

/* Only the one who made a group item, or the group's owner, edits or deletes it. */
function groupItemEditable(item){
  if(!item || !item.groupId) return true;
  const g = groupById(item.groupId);
  return !!g && (item.groupMine || g.owner);
}

/* The colors a group may not use: the ones tasks, habits and events have now. */
function groupBlockedColors(){
  const primary = getComputedStyle(document.getElementById('device') || document.documentElement).getPropertyValue('--primary').trim();
  return ['task', 'habit', 'event'].map(k => (itemColor(k) || primary || '').toUpperCase()).filter(Boolean);
}
function groupColorChoices(){
  const blocked = groupBlockedColors();
  return ITEM_COLOR_CHOICES.filter(c => !blocked.includes(c.toUpperCase()));
}

/* ---- server payload -> state ---- */
function applyGroupsPayload(p, fromCache){
  state.groups = (p && p.groups || []).map(g => ({
    id: String(g.id), name: g.name || '', color: g.color || ITEM_COLOR_CHOICES[0], owner: !!g.owner,
    token: g.token || '', members: g.members || [],
  }));
  ['tasks', 'habits', 'events'].forEach(k => { state[k] = state[k].filter(x => !x.groupId); });
  (p && p.items || []).forEach(it => {
    const k = GROUP_KIND_KEY[it.kind];
    if(!k || !groupById(String(it.group))) return;
    const item = Object.assign({}, it.data || {}, {
      id: it.id, groupId: String(it.group), doneMode: it.done_mode === 'shared' ? 'shared' : 'each',
      groupMine: !!it.mine, groupBy: it.by || null, groupMarks: (it.marks || []).slice(), pinned: false,
    });
    item.recurrence = item.recurrence || { mode: null, interval: 1, weekdays: [] };
    item.notification = item.notification || { type: null };
    if(it.kind === 'task') item.subtasks = (item.subtasks || []).map(s => normalizeSubtask(s, item));
    if(it.kind === 'habit') item.startDate = item.startDate || dateKey(today);
    projectGroupMarks(item, it.kind);
    state[k].push(item);
  });
  state.groupsLoaded = true;
  if(!fromCache) saveGroupsCache(p);
}

/* The item's done/not-done fields from its marks (see the header). */
function groupMarkStatus(item, key){
  const marks = (item.groupMarks || []).filter(m => m.key === key);
  const m = item.doneMode === 'shared' ? marks[0] : marks.find(x => x.me);
  return m ? m.status : null;
}
function projectGroupMarks(item, kind){
  const keys = [...new Set((item.groupMarks || []).map(m => m.key))];
  const days = keys.filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if(kind === 'habit'){
    item.completedDates = days.filter(k => groupMarkStatus(item, k) === 'done');
    item.skippedDates = days.filter(k => groupMarkStatus(item, k) === 'not_done');
  } else if(kind === 'task'){
    item.statusByDate = {};
    days.forEach(k => { const s = groupMarkStatus(item, k); if(s) item.statusByDate[k] = s; });
    const once = groupMarkStatus(item, 'once');
    item.done = once === 'done'; item.skipped = once === 'not_done';
    (item.subtasks || []).forEach(s => {
      const st = groupMarkStatus(item, 'once:' + s.id);
      s.done = st === 'done'; s.skipped = st === 'not_done';
    });
  }
}

/* "2 of 5 done" for an each-person item on a day. */
function groupDoneCount(item, key){
  const g = groupById(item.groupId);
  if(!g) return null;
  const users = new Set((item.groupMarks || []).filter(m => m.key === key && m.status === 'done').map(m => m.user || (m.me ? 'me' : '')));
  return { done: users.size, total: g.members.length || 1 };
}

function saveGroupsCache(p){
  try{ localStorage.setItem(GROUP_CACHE_KEY, JSON.stringify({ who: state.profile.userId, p })); }catch(e){ /* storage full: online only */ }
}
function loadGroupsCache(){
  try{
    const c = JSON.parse(localStorage.getItem(GROUP_CACHE_KEY) || 'null');
    if(c && c.who === state.profile.userId && c.p) applyGroupsPayload(c.p, true);
  }catch(e){ /* nothing cached */ }
}
function clearGroupsState(){
  state.groups = []; state.groupsLoaded = false;
  ['tasks', 'habits', 'events'].forEach(k => { state[k] = state[k].filter(x => !x.groupId); });
}

/* Again whenever the app comes back to the foreground and every two
   minutes while it's open, so the others' changes show up. */
let groupsLoading = null;
function loadGroups(){
  if(!groupsAvailable()) return Promise.resolve();
  if(groupsLoading) return groupsLoading;
  groupsLoading = Cloud.groups().then(p => {
    const before = JSON.stringify([state.groups, state.tasks.filter(x => x.groupId), state.habits.filter(x => x.groupId), state.events.filter(x => x.groupId)]);
    applyGroupsPayload(p);
    const after = JSON.stringify([state.groups, state.tasks.filter(x => x.groupId), state.habits.filter(x => x.groupId), state.events.filter(x => x.groupId)]);
    if(before !== after && !state.popupOpen && !state.selection) render();
  }).catch(() => { /* offline: keep what we had */ }).finally(() => { groupsLoading = null; });
  return groupsLoading;
}
document.addEventListener('visibilitychange', () => { if(!document.hidden) loadGroups(); });
setInterval(() => { if(!document.hidden) loadGroups(); }, 120000);

/* A group change answered with the whole list (create, edit, leave...). */
function groupCall(call, okMsg){
  return call().then(p => {
    if(p && p.groups) applyGroupsPayload(p);
    if(okMsg) showToast(okMsg);
    render();
    return p;
  }).catch(err => { showToast(groupErrorText(err)); loadGroups(); throw err; });
}
function groupErrorText(err){
  const code = err && err.code;
  if(code === 'not_a_friend') return t('groupErrNotFriend');
  if(code === 'too_many_groups') return t('groupErrTooMany');
  if(code === 'group_full' || code === 'too_many') return t('groupErrFull');
  if(code === 'not_owner' || code === 'not_yours') return t('groupNotYours');
  if(code === 'group_not_found') return t('groupLinkInvalid');
  return authErrorMessage(err);
}

/* ---- saving group items ---- */
function groupItemData(item){
  const d = {};
  Object.keys(item).forEach(k => { if(!GROUP_LOCAL_FIELDS.includes(k)) d[k] = item[k]; });
  if(d.subtasks) d.subtasks = d.subtasks.map(s => { const c = Object.assign({}, s); delete c.done; delete c.skipped; return c; });
  return d;
}
function groupCloud(call){
  if(!groupsAvailable()) return;
  call().catch(err => { showToast(groupErrorText(err)); loadGroups(); });
}
function groupSaveItem(kind, item){
  groupCloud(() => Cloud.saveGroupItem(item.groupId, kind, groupItemData(item), item.doneMode));
}
function groupDeleteItem(item){
  groupCloud(() => Cloud.deleteGroupItem(item.groupId, item.id));
}
function groupSetMark(item, key, status){
  const shared = item.doneMode === 'shared';
  item.groupMarks = (item.groupMarks || []).filter(m => !(m.key === key && (shared || m.me)));
  if(status) item.groupMarks.push({ key, status, me: true, user: 'me', name: '' });
  refreshGroupCounts(item); // components/groups/groups.js
  groupCloud(() => Cloud.markGroupItem(item.groupId, item.id, key, status));
}

/* After a tick on a group task: its marks follow the task's fields. */
function groupMarkTask(task, dayKey, subId){
  const st = x => x.done ? 'done' : x.skipped ? 'not_done' : null;
  const once = !isRecurringTask(task);
  if(subId){
    const s = (task.subtasks || []).find(x => x.id === subId);
    if(s) groupSetMark(task, 'once:' + s.id, st(s));
  } else if(!once){ groupSetMark(task, dayKey, task.statusByDate?.[dayKey] || null); return; }
  else (task.subtasks || []).forEach(s => groupSetMark(task, 'once:' + s.id, st(s)));
  if(once) groupSetMark(task, 'once', st(task)); // a one-off parent follows its subtasks
}
function groupMarkHabit(habit, dayKey){
  const st = habit.completedDates.includes(dayKey) ? 'done' : (habit.skippedDates || []).includes(dayKey) ? 'not_done' : null;
  groupSetMark(habit, dayKey, st);
}

/* Deleting from a row, a swipe or the event card's bin. Returns true when
   it was a group item (handled here). */
function deleteGroupAware(kind, id){
  const arr = GROUP_KIND_KEY[kind];
  const item = state[arr].find(x => x.id === id);
  if(!item || !item.groupId) return false;
  if(!groupItemEditable(item)){ showToast(t('groupNotYours')); return true; }
  state[arr] = state[arr].filter(x => x.id !== id);
  groupDeleteItem(item);
  return true;
}

/* ---- group links: /demo/#group=CODE ---- */
const PENDING_GROUP_KEY = 'toojibee-pending-group';
function pendingGroup(){ try{ return localStorage.getItem(PENDING_GROUP_KEY) || ''; }catch(e){ return ''; } }
(function takeGroupFromLink(){
  const m = /[#&]group=([0-9A-Za-z]{20})/.exec(location.hash);
  if(!m) return;
  try{ localStorage.setItem(PENDING_GROUP_KEY, m[1]); }catch(e){ /* private mode: lost after sign-up */ }
  history.replaceState(null, '', location.pathname + location.search);
})();
function groupUrl(token){ return new URL('./', location.href).href + '#group=' + encodeURIComponent(token); }

async function joinPendingGroup(){
  const code = pendingGroup();
  if(!code || !groupsAvailable()) return;
  try{ localStorage.removeItem(PENDING_GROUP_KEY); }catch(e){ /* ignore */ }
  try{
    const p = await Cloud.joinGroup(code);
    applyGroupsPayload(p);
    showToast(t('groupJoined').replace('{name}', p.name || ''));
    goToGroupsDesk();
    render();
  }catch(err){ showToast(groupErrorText(err)); }
}
