/* ============ SUBTASKS AS FULL TASKS ============
   A subtask is stored inside its parent's `subtasks` array (that's the
   shape the Supabase row and the demo already use), but it carries the
   same fields as a task: its own date or date range, description,
   photos, reminder and done / not-done state. Editing one opens the
   normal task popup. Subtasks never repeat on their own and never have
   subtasks of their own (one level, same rule as the MySQL schema). */
function subTitle(s){ return s.title ?? s.text ?? ''; }

function newSubtask(parent, title){
  return {
    id: uid(), title, text: title, done: false, skipped: false,
    description: '', photos: [], timeMode: 'single',
    date: parent?.date || dateKey(today), endDate: null,
    notification: { type: null }
  };
}

/* Older rows only have { id, text, done }; fill in the task fields. */
function normalizeSubtask(s, parent){
  const title = subTitle(s);
  return Object.assign(newSubtask(parent, title), s, { title, text: title });
}

/* Finds a task or a subtask by id. parent is null for top-level tasks. */
function findTaskOrSub(id){
  for(const task of state.tasks){
    if(task.id === id) return { item: task, parent: null };
    const sub = (task.subtasks || []).find(s => s.id === id);
    if(sub) return { item: sub, parent: task };
  }
  return { item: null, parent: null };
}

/* ============ ITEM COLORS ============
   Settings → Planning lets each kind have its own color: the tick, the
   day-summary dot and chart, the calendar dots and the full-screen chips.
   state.settings.itemColors = { task, habit, event }: '#RRGGBB', or
   missing for the default (tasks: the theme's own primary). */
const ITEM_COLOR_DEFAULTS = { task: null, habit: '#4CC38A', event: '#D9B65C' };
const ITEM_COLOR_CHOICES = ['#EB7D00', '#E5484D', '#E93D82', '#8E4EC6', '#3E63DD', '#0EA5B7', '#30A46C', '#D9B65C'];

function itemColor(kind){ return state.settings.itemColors?.[kind] || ITEM_COLOR_DEFAULTS[kind]; }

/* --task-color etc. on #device (defaults in items.css); called by render(). */
function applyItemColors(){
  const dev = document.getElementById('device');
  ['task', 'habit', 'event'].forEach(k => {
    const c = state.settings.itemColors?.[k];
    if(c) dev.style.setProperty(`--${k}-color`, c); else dev.style.removeProperty(`--${k}-color`);
    // Text/tick on that color: dark on light colors, white on dark ones.
    const hex = c || ITEM_COLOR_DEFAULTS[k];
    if(hex) dev.style.setProperty(`--${k}-on`, colorIsLight(hex) ? '#1A1708' : '#FFFFFF'); else dev.style.removeProperty(`--${k}-on`);
  });
}

function colorIsLight(hex){
  const n = parseInt(hex.slice(1), 16);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4;
}

/* ============ DONE / NOT DONE PER DAY ============
   A one-off task keeps its state in done / skipped. A repeating task is
   ticked separately on every day it occurs (statusByDate, keyed by
   'YYYY-MM-DD'), the same model as the API's task_occurrences, so ticking
   today's run doesn't tick every other day of the series. */
function isRecurringTask(task){ return !!task.recurrence?.mode; }

function taskStatusOn(task, key){
  const set = !isRecurringTask(task) ? (task.done ? 'done' : task.skipped ? 'not_done' : null) : (task.statusByDate?.[key] || null);
  // Not ticked and its time is over: "not done" by itself (it can still be
  // ticked as done afterwards — an explicit status always wins).
  return set || (taskOverdue(task, key) ? 'not_done' : null);
}

/* A task's time is over: its last day has passed, or on that day its end
   time (else its start time) has. A repeating task: per occurrence. */
function taskOverdue(task, key){
  const deadline = isRecurringTask(task) ? key : (task.timeMode === 'range' && task.endDate ? task.endDate : task.date);
  if(!deadline) return false;
  const now = new Date();
  const todayKey = dateKey(now);
  if(deadline !== todayKey) return deadline < todayKey;
  const hm = task.endTime || task.startTime;
  if(!hm) return false;
  const [h, m] = hm.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

/* "۱۰:۰۰ – ۱۲:۳۰" (or just the start) for an item with a time. */
function itemTimeLabel(item){
  if(!item.startTime) return '';
  return dig(item.startTime) + (item.endTime ? ' – ' + dig(item.endTime) : '');
}

/* Once a minute (js/app.js): repaint task checkboxes whose time just ran
   out, in place — no full render. */
function refreshOverdueTasks(){
  state.tasks.forEach(syncTaskDom);
  updateDayStatsInPlace();
}

function setTaskStatusOn(task, key, status){
  if(!isRecurringTask(task)){
    task.done = status === 'done';
    task.skipped = status === 'not_done';
    return;
  }
  // An older server save could turn an empty {} into []: keys on an array are lost when saved.
  task.statusByDate = Object.assign({}, task.statusByDate);
  if(status) task.statusByDate[key] = status; else delete task.statusByDate[key];
}

function isSelected(type, id){
  return !!state.selection && state.selection.type === type && state.selection.id === id;
}

function taskRow(task, key){
  const subs = task.subtasks || [];
  const status = taskStatusOn(task, key);
  const done = status === 'done', skipped = status === 'not_done';
  const open = subs.length > 0 && !!state.expandedTasks[task.id];
  const sel = isSelected('task', task.id);
  return `<div class="swipe-wrap task-wrap ${open?'subs-open':''} ${sel?'is-selected':''}" data-swipe-type="task" data-swipe-id="${task.id}"${groupStyleAttr(task)}>
    <div class="swipe-delete-bg">${ICONS.trash}</div>
    <div class="item-card task-row ${subs.length?'has-subtasks':''} ${done?'done':''} ${skipped?'skipped':''} ${sel?'is-selected':''}" data-select-type="task" data-select-id="${task.id}">
      <div class="checkbox ${done?'checked':''} ${skipped?'skipped':''}" data-action="toggle-task" data-id="${task.id}" data-date="${key}" role="checkbox" aria-checked="${done}" aria-label="${escapeAttr(task.title)}" tabindex="0">${done?ICONS.check:skipped?ICONS.close:''}</div>
      <div class="task-title-wrap" data-action="view-item" data-type="task" data-id="${task.id}">
        <p class="item-title">${escapeHtml(task.title)}</p>
        ${task.startTime ? `<span class="item-time" dir="ltr">${itemTimeLabel(task)}</span>` : ''}
        ${groupRowBadge(task, key)}
      </div>
      ${task.groupId ? '' : `<button class="star-mini ${task.pinned?'active':''}" data-action="toggle-pin" data-id="${task.id}" aria-label="${task.pinned?t('unpinBtn'):t('pinBtn')}">${ICONS.star}</button>`}
      ${subs.length ? `<button type="button" class="subtask-toggle ${open?'open':''}" data-action="toggle-subtasks" data-id="${task.id}" aria-label="${t('subtasksLabel')}" aria-expanded="${open}">${ICONS.chevronDown}</button>` : ''}
    </div>
  </div>
  ${open ? `<div class="subtask-children" role="group" aria-label="${t('subtasksLabel')}">${subs.map(s => subtaskRow(task, s)).join('')}</div>` : ''}`;
}

/* One row of the cascading block under an open task: same checkbox and
   title as a task row, smaller, joined to its siblings by the cascade
   line. Tap the title to edit it like any task; long-press or
   right-click to select it. */
function subtaskRow(task, s){
  const title = subTitle(s);
  const sel = isSelected('subtask', s.id);
  return `<div class="subtask-row ${s.done?'done':''} ${s.skipped?'skipped':''} ${sel?'is-selected':''}" data-task-id="${task.id}" data-sub-id="${s.id}" data-select-type="subtask" data-select-id="${s.id}">
    <div class="checkbox ${s.done?'checked':''} ${s.skipped?'skipped':''}" data-action="toggle-subtask" data-task-id="${task.id}" data-sub-id="${s.id}" role="checkbox" aria-checked="${!!s.done}" aria-label="${escapeAttr(title)}" tabindex="0">${s.done?ICONS.check:s.skipped?ICONS.close:''}</div>
    <p class="item-title" data-action="view-item" data-type="task" data-id="${s.id}">${escapeHtml(title)}</p>
  </div>`;
}

function habitRow(h, date){
  const key = dateKey(date);
  const checked = h.completedDates.includes(key);
  const skipped = !checked && (h.skippedDates||[]).includes(key);
  return `<div class="swipe-wrap ${isSelected('habit', h.id)?'is-selected':''}" data-swipe-type="habit" data-swipe-id="${h.id}"${groupStyleAttr(h)}>
    <div class="swipe-delete-bg">${ICONS.trash}</div>
    <div class="item-card ${checked?'done':''} ${skipped?'skipped':''} ${isSelected('habit', h.id)?'is-selected':''}" data-select-type="habit" data-select-id="${h.id}">
      <div class="checkbox square ${checked?'checked':''} ${skipped?'skipped':''}" data-action="toggle-habit" data-id="${h.id}" data-date="${key}" role="checkbox" aria-checked="${checked}" aria-label="${escapeAttr(h.title)}" tabindex="0">${checked?ICONS.check:skipped?ICONS.close:''}</div>
      <p class="item-title" data-action="view-item" data-type="habit" data-id="${h.id}" style="cursor:pointer;">${escapeHtml(h.title)}${groupRowBadge(h, key)}</p>
      ${trackerHtml(h, key)}
    </div>
  </div>`;
}

// An event's time: its own start time, else its reminder time.
function eventTime(e){ return e.startTime || (e.notification?.type === 'time' ? e.notification.time : null); }

function sortEvents(events){
  return [...events].sort((a,b) => {
    const at = eventTime(a);
    const bt = eventTime(b);
    if(at && bt) return at.localeCompare(bt);
    if(at && !bt) return -1;
    if(!at && bt) return 1;
    return 0;
  });
}

/* Days until a countdown's day or a birthday's next one (0 = today); null
   for a plain event or a countdown that's over. */
function eventDaysLeft(e, from){
  const day = new Date(from || today); day.setHours(0, 0, 0, 0);
  if(e.kind === 'countdown'){ const n = Math.round((parseDateKey(e.date) - day) / 86400000); return n >= 0 ? n : null; }
  if(e.kind === 'birthday'){ for(let k = 0; k <= 366; k++) if(occursOnDate(e, addDays(day, k))) return k; }
  return null;
}
function daysLeftLabel(n){ return n === 0 ? t('today') : t('daysLeft').replace('{n}', dig(n)); }
function eventBadgeHtml(e){
  const n = eventDaysLeft(e);
  return n == null ? '' : `<span class="event-badge">${e.kind === 'birthday' ? '🎂 ' : ''}${daysLeftLabel(n)}</span>`;
}
/* The Occasions desk's coming countdowns and birthdays (next 60 days). */
function countdownsHtml(){
  const list = state.events.filter(e => e.kind).map(e => ({ e, n: eventDaysLeft(e) })).filter(x => x.n != null && x.n <= 60).sort((a, b) => a.n - b.n).slice(0, 4);
  return list.length ? `<div class="section-title">${t('countdowns')}</div>${list.map(x => `<div class="occasion-row countdown-row" data-action="view-item" data-type="event" data-id="${x.e.id}"><span>${escapeHtml(x.e.title)}</span>${eventBadgeHtml(x.e)}</div>`).join('')}` : '';
}

/* An event's menu (long press or right click on its card, instead of a
   trash button): edit, share a copy, delete after a confirm. */
function openEventMenu(card){
  const id = card.dataset.id, e = state.events.find(x => x.id === id);
  if(!e) return;
  const editable = groupItemEditable(e);
  const m = tjMenu(card, `
    ${editable ? `<button type="button" class="tj-option" data-m="edit">${t('editBtn')}</button>` : ''}
    <button type="button" class="tj-option" data-m="share">${t('itemShareLink')}</button>
    ${editable ? `<button type="button" class="tj-option tj-danger" data-m="delete">${t('deleteBtn')}</button>` : ''}`, 'item-menu');
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-m]'); if(!b) return;
    closeTjMenu();
    if(b.dataset.m === 'edit') openPopup('event', null, e);
    else if(b.dataset.m === 'share') shareItemLink('event', id);
    else if(confirm(t('deleteEventConfirm').replace('{title}', e.title))) deleteEventById(id);
  });
  haptic(15);
}
function deleteEventById(id){
  if(!deleteGroupAware('event', id)){ state.events = state.events.filter(x => x.id !== id); cloudSync(() => Cloud.deleteEvent(id)); }
  forgetItemReminders('event', id); // its reminders go too (js/core/notify.js)
  render();
}
/* Long press (450 ms without moving) or right click on an event card. */
(function attachEventMenu(){
  let timer = null, sx = 0, sy = 0, card = null;
  document.addEventListener('contextmenu', ev => { const c = ev.target.closest('#device .event-card'); if(c){ ev.preventDefault(); openEventMenu(c); } });
  document.addEventListener('pointerdown', ev => {
    card = ev.target.closest('#device .event-card'); if(!card || ev.pointerType === 'mouse') return;
    sx = ev.clientX; sy = ev.clientY;
    clearTimeout(timer); timer = setTimeout(() => { const c = card; card = null; if(c){ c.dataset.longPressed = '1'; openEventMenu(c); } }, 450);
  });
  document.addEventListener('pointermove', ev => { if(card && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10){ clearTimeout(timer); card = null; } });
  ['pointerup', 'pointercancel'].forEach(n => document.addEventListener(n, () => { clearTimeout(timer); card = null; }));
  // The tap that ends a long press doesn't also open the details.
  document.addEventListener('click', ev => { const c = ev.target.closest('.event-card[data-long-pressed]'); if(c){ ev.stopPropagation(); ev.preventDefault(); delete c.dataset.longPressed; } }, true);
})();

/* An event's own colour (a #RRGGBB from the form; anything else is ignored). */
function eventColor(e){ return e && /^#[0-9a-fA-F]{6}$/.test(e.color || '') ? e.color : ''; }

function eventCard(e){
  const time = e.startTime ? itemTimeLabel(e) : (eventTime(e) || '');
  return `<div class="event-card ${e.groupId ? 'in-group' : ''}" data-action="view-item" data-type="event" data-id="${e.id}"${e.groupId ? groupStyleAttr(e) : eventColor(e) ? ` style="--event-color:${eventColor(e)}"` : ''}>
    ${time?`<span class="event-time">${time}</span>`:''}
    <p class="event-title">${eventIconHtml(e)}${escapeHtml(e.title)}</p>${eventBadgeHtml(e)}
  </div>`;
}

/* An empty section renders nothing at all — not even a title — on both
   breakpoints now (desktop used to keep a "no X yet" + CTA card per an
   earlier decision, see SPEC.md §11.9; dropped on request so both
   breakpoints match). Mobile-only: a non-empty section also gets a
   collapse triangle that hides/shows its whole list (not just a
   truncated preview); desktop keeps the truncate-past-`limit` toggle.
   #page-home is shared markup between both breakpoints, so this has to
   branch on viewport here rather than via CSS alone. */
function renderEventsSection(events){
  const sorted = sortEvents(events);
  const isMobile = window.innerWidth < 960;
  if(!events.length) return '';
  const collapsed = state.sectionCollapsed.events;
  const showToggle = isMobile && events.length > 0;
  const visible = isMobile ? (collapsed ? [] : sorted) : sorted;
  const open = !collapsed;
  return `
    <div class="section-title">${t('events')} <span class="count">${dig(events.length)}</span>
      ${showToggle ? `<button class="section-toggle ${open?'open':''}" data-action="toggle-section" data-section="events">${ICONS.chevronDown}</button>` : ''}
    </div>
    <div class="events-scroll">${visible.map(e=>eventCard(e)).join('')}</div>
  `;
}

function renderTasksSection(tasks, date){
  const key = dateKey(date);
  const isDone = t => taskStatusOn(t, key) === 'done';
  const sorted = [...tasks].sort((a,b) => (b.pinned - a.pinned) || (isDone(a) - isDone(b)));
  const isMobile = window.innerWidth < 960;
  if(!tasks.length) return '';
  const limit = 3;
  const expanded = state.sectionExpanded.tasks;
  const collapsed = state.sectionCollapsed.tasks;
  const hasMore = sorted.length > limit;
  const visible = isMobile ? (collapsed ? [] : sorted) : (expanded ? sorted : sorted.slice(0, limit));
  const showToggle = isMobile ? tasks.length > 0 : hasMore;
  const open = isMobile ? !collapsed : expanded;
  return `
    <div class="section-title">${t('tasks')} <span class="count">${dig(tasks.length)}</span>
      ${showToggle ? `<button class="section-toggle ${open?'open':''}" data-action="toggle-section" data-section="tasks">${ICONS.chevronDown}</button>` : ''}
    </div>
    ${visible.map(t=>taskRow(t, key)).join('')}
  `;
}

function renderHabitsSection(habits, date){
  const isMobile = window.innerWidth < 960;
  if(!habits.length) return '';
  const limit = 2;
  const expanded = state.sectionExpanded.habits;
  const collapsed = state.sectionCollapsed.habits;
  const hasMore = habits.length > limit;
  const visible = isMobile ? (collapsed ? [] : habits) : (expanded ? habits : habits.slice(0, limit));
  const showToggle = isMobile ? habits.length > 0 : hasMore;
  const open = isMobile ? !collapsed : expanded;
  return `
    <div class="section-title">${t('habits')} <span class="count">${dig(habits.length)}</span>
      ${showToggle ? `<button class="section-toggle ${open?'open':''}" data-action="toggle-section" data-section="habits">${ICONS.chevronDown}</button>` : ''}
    </div>
    ${visible.map(h=>habitRow(h,date)).join('')}
  `;
}

function renderItemSections(tasks, habits, events, date){
  return `${renderEventsSection(events)}${renderTasksSection(tasks, date)}${renderHabitsSection(habits, date)}`;
}

/* ============ DONE / NOT DONE ============
   One entry point for every checkbox (task, subtask, habit), used by a
   plain tap, swipe-left and the selection menu. markSkipped is only true
   from the menu's "not done": an explicit red X + strikethrough, distinct
   from the untouched state.
   Parent and subtasks stay consistent both ways: checking a parent
   checks all of its subtasks, and a parent is done exactly when every
   subtask is done. */
function applyQuicksetState(cb, wantDone, markSkipped){
  const action = cb.dataset.action;
  const isSkipped = !!markSkipped && !wantDone;
  // Nothing can be done (or "not done") on a day that hasn't come yet;
  // clearing an old mark on such a day is still allowed.
  const sub = action === 'toggle-subtask' ? state.tasks.find(x => x.id === cb.dataset.taskId)?.subtasks?.find(s => s.id === cb.dataset.subId) : null;
  const day = cb.dataset.date || sub?.date || cb.closest('[data-date]')?.dataset.date;
  if((wantDone || isSkipped) && day && day > dateKey(today)){ showToast(t('futureNotYet')); haptic(20); return; }
  if(action === 'toggle-task'){
    const task = state.tasks.find(x => x.id === cb.dataset.id);
    if(!task) return;
    setTaskStatusOn(task, cb.dataset.date, wantDone ? 'done' : isSkipped ? 'not_done' : null);
    // A one-off parent and its subtasks move together. A repeating parent
    // is ticked per day while its (one-off) subtasks keep their own state.
    if(!isRecurringTask(task)) (task.subtasks || []).forEach(s => { s.done = wantDone; s.skipped = isSkipped; });
    // A group's task: the tick is this person's mark (or everyone's), js/core/groups.js.
    if(task.groupId) groupMarkTask(task, cb.dataset.date); else cloudSync(() => Cloud.saveTask(task));
    syncTaskDom(task);
  } else if(action === 'toggle-subtask'){
    const task = state.tasks.find(x => x.id === cb.dataset.taskId);
    const sub = task?.subtasks?.find(s => s.id === cb.dataset.subId);
    if(!sub) return;
    sub.done = wantDone; sub.skipped = isSkipped;
    if(!isRecurringTask(task)){
      task.done = task.subtasks.every(s => s.done);
      if(task.done) task.skipped = false;
    }
    if(task.groupId) groupMarkTask(task, null, sub.id); else cloudSync(() => Cloud.saveTask(task));
    syncTaskDom(task);
  } else if(action === 'toggle-habit'){
    const habit = state.habits.find(x => x.id === cb.dataset.id);
    if(!habit) return;
    const dk = cb.dataset.date;
    const i = habit.completedDates.indexOf(dk);
    if(wantDone && i < 0) habit.completedDates.push(dk);
    else if(!wantDone && i >= 0) habit.completedDates.splice(i, 1);
    habit.skippedDates = habit.skippedDates || [];
    const si = habit.skippedDates.indexOf(dk);
    if(isSkipped && si < 0) habit.skippedDates.push(dk);
    else if(!isSkipped && si >= 0) habit.skippedDates.splice(si, 1);
    if(habit.groupId) groupMarkHabit(habit, dk); else cloudSync(() => Cloud.saveHabit(habit));
    paintCheckbox(cb, wantDone, isSkipped);
  } else return;
  updateDayStatsInPlace();
}

function toggleSubtask(taskId, subId){
  const cb = document.querySelector(`.checkbox[data-action="toggle-subtask"][data-sub-id="${CSS.escape(subId)}"]`);
  const sub = state.tasks.find(x => x.id === taskId)?.subtasks?.find(s => s.id === subId);
  if(cb && sub) applyQuicksetState(cb, !sub.done);
}

/* In-place DOM patches instead of a full render(), so the pane keeps its
   scroll position while ticking things off. */
function paintCheckbox(cb, done, skipped){
  cb.classList.toggle('checked', !!done);
  cb.classList.toggle('skipped', !!skipped);
  cb.setAttribute('aria-checked', !!done);
  cb.innerHTML = done ? ICONS.check : skipped ? ICONS.close : '';
  const row = cb.closest('.item-card, .subtask-row');
  row?.classList.toggle('done', !!done);
  row?.classList.toggle('skipped', !!skipped);
}

function syncTaskDom(task){
  document.querySelectorAll(`.checkbox[data-action="toggle-task"][data-id="${CSS.escape(task.id)}"]`)
    .forEach(cb => { const st = taskStatusOn(task, cb.dataset.date); paintCheckbox(cb, st === 'done', st === 'not_done'); });
  (task.subtasks || []).forEach(s => {
    document.querySelectorAll(`.checkbox[data-action="toggle-subtask"][data-sub-id="${CSS.escape(s.id)}"]`)
      .forEach(cb => paintCheckbox(cb, s.done, s.skipped));
  });
}

/* ============ SELECTION ============
   Right-click (mouse) or press-and-hold (touch) on a task, subtask or
   habit selects it: the row glows and lifts (.is-selected) and the
   Done / Not done / Edit / Delete menu opens next to it. Tapping
   anywhere else, scrolling or Escape clears it. */
const LONG_PRESS_MS = 450;

function selectableFrom(target){
  if(target.closest('.star-mini, .subtask-toggle, .row-context-menu, .group-add-item, .habit-tracker')) return null;
  return target.closest('[data-select-type]');
}

function closeRowContextMenu(){ document.getElementById('row-context-menu')?.remove(); }

function clearSelection(){
  closeRowContextMenu();
  if(!state.selection) return;
  state.selection = null;
  document.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
  refreshCalendarRanges();
}

function selectItem(el, point){
  clearSelection();
  state.selection = { type: el.dataset.selectType, id: el.dataset.selectId };
  el.classList.add('is-selected');
  el.closest('.swipe-wrap')?.classList.add('is-selected');
  refreshCalendarRanges();
  showRowContextMenu(el, point);
  haptic(12);
}

function showRowContextMenu(el, point){
  closeRowContextMenu();
  const menu = document.createElement('div');
  menu.id = 'row-context-menu';
  menu.className = 'row-context-menu';
  menu.setAttribute('role', 'menu');
  const type = el.dataset.selectType, id = el.dataset.selectId;
  // A group's header: its own menu (components/groups/groups.js).
  const groupEntries = type === 'group' ? groupMenuEntries(id) : null;
  // Someone else's item in a group: only ticking it.
  const owner = type === 'habit' ? state.habits.find(x => x.id === id) : type === 'subtask' ? findTaskOrSub(id).parent : findTaskOrSub(id).item;
  const editable = groupItemEditable(owner);
  menu.innerHTML = groupEntries
    ? groupEntries.map((e, i) => `<button type="button" role="menuitem" data-ctx="group" data-i="${i}" class="${e.danger ? 'danger' : ''}">${e.icon}${escapeHtml(e.label)}</button>`).join('')
    : `
    <button type="button" role="menuitem" data-ctx="done">${ICONS.check}${t('qsDone')}</button>
    <button type="button" role="menuitem" data-ctx="undone">${ICONS.close}${t('qsUndone')}</button>
    ${type === 'habit' && habitTracker(owner) ? `<button type="button" role="menuitem" data-ctx="reset">${ICONS.repeatIcon}${t('trackerReset')}</button>` : ''}
    ${editable ? `<button type="button" role="menuitem" data-ctx="edit">${ICONS.pencilIcon}${t('editBtn')}</button>
    <button type="button" role="menuitem" data-ctx="delete" class="danger">${ICONS.trash}${t('deleteBtn')}</button>` : ''}
  `;
  document.body.appendChild(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  let x, y;
  if(point){
    x = point.x; y = point.y;
  } else {
    // Under the row, aligned with its reading-start edge; above it when
    // there's no room below.
    const r = el.getBoundingClientRect();
    x = lang() === 'fa' ? r.right - w : r.left;
    y = r.bottom + 10 + h > window.innerHeight ? r.top - h - 10 : r.bottom + 10;
  }
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
  menu.addEventListener('click', e => {
    const btn = e.target.closest('[data-ctx]');
    if(!btn) return;
    e.stopPropagation();
    if(btn.dataset.ctx === 'group'){ clearSelection(); groupEntries[Number(btn.dataset.i)].run(); return; }
    runItemMenuAction(el, btn.dataset.ctx);
  });
  menu.querySelector('button')?.focus({ preventScroll: true });
}

function runItemMenuAction(el, action){
  const type = el.dataset.selectType, id = el.dataset.selectId;
  const cb = el.querySelector('.checkbox[data-action]');
  clearSelection();
  if(action === 'done' && cb) applyQuicksetState(cb, true);
  else if(action === 'undone' && cb) applyQuicksetState(cb, false, true);
  else if(action === 'reset' && cb) habitTrackerReset(id, cb.dataset.date); // counter / timer back to zero (js/core/trackers.js)
  else if(action === 'edit'){
    if(type === 'habit') openPopup('habit', el, findItem('habit', id));
    else openPopup('task', el, findTaskOrSub(id).item);
  } else if(action === 'delete'){
    deleteItem(type, id);
    render();
  }
}

function deleteItem(type, id){
  if(deleteGroupAware(type, id)) return; // a group's task or habit (js/core/groups.js)
  if(type === 'subtask' && findTaskOrSub(id).parent?.groupId){
    const { parent } = findTaskOrSub(id);
    if(!groupItemEditable(parent)){ showToast(t('groupNotYours')); return; }
    parent.subtasks = parent.subtasks.filter(s => s.id !== id);
    groupSaveItem('task', parent);
    return;
  }
  if(type === 'task'){
    state.tasks = state.tasks.filter(x => x.id !== id);
    cloudSync(() => Cloud.deleteTask(id));
    forgetItemReminders('task', id); // js/core/notify.js
  } else if(type === 'subtask'){
    const { parent } = findTaskOrSub(id);
    if(!parent) return;
    parent.subtasks = parent.subtasks.filter(s => s.id !== id);
    if(parent.subtasks.length && !isRecurringTask(parent)) parent.done = parent.subtasks.every(s => s.done);
    cloudSync(() => Cloud.saveTask(parent));
  } else if(type === 'habit'){
    state.habits = state.habits.filter(x => x.id !== id);
    cloudSync(() => Cloud.deleteHabit(id));
    forgetItemReminders('habit', id);
  }
}

function attachItemSelection(){
  const root = document.getElementById('device');
  if(!root) return;
  let timer = null, startX = 0, startY = 0, pressedEl = null;
  let swallowClick = false, lastLongPress = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };

  root.addEventListener('pointerdown', e => {
    if(e.target.closest('.row-context-menu')) return;
    const el = selectableFrom(e.target);
    if(!el || !el.classList.contains('is-selected')) clearSelection();
    if(!el || e.button !== 0) return;
    pressedEl = el; startX = e.clientX; startY = e.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      swallowClick = true; // the click after this release must not toggle or open the editor
      lastLongPress = Date.now();
      selectItem(pressedEl, null);
    }, LONG_PRESS_MS);
  }, true);
  root.addEventListener('pointermove', e => {
    if(timer && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) cancel();
  }, true);
  root.addEventListener('pointerup', cancel, true);
  root.addEventListener('pointercancel', cancel, true);
  root.addEventListener('click', e => {
    if(!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  root.addEventListener('contextmenu', e => {
    const el = selectableFrom(e.target);
    if(!el) return;
    e.preventDefault();
    // Touch browsers also fire contextmenu after a long press, which the
    // timer above already handled.
    if(Date.now() - lastLongPress < 800) return;
    selectItem(el, { x: e.clientX, y: e.clientY });
  });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') clearSelection(); });
  document.addEventListener('scroll', clearSelection, true);
  window.addEventListener('resize', clearSelection);
}

/* ============ SHARE A COPY (link) ============
   A task, habit or event as a link (#add=… with its fields, never its
   ticks, photos, group or reminders' own text); whoever opens it is asked,
   and gets a copy of their own with a new id. Nothing goes through our
   server: the data is in the link itself. */
const SHARE_FIELDS = { task: ['title', 'description', 'timeMode', 'date', 'endDate', 'startTime', 'endTime', 'recurrence'],
  habit: ['title', 'startDate', 'recurrence', 'tracker'], event: ['title', 'description', 'kind', 'color', 'timeMode', 'date', 'endDate', 'startTime', 'endTime', 'recurrence'] };
function shareItemLink(kind, id){
  const it = findItem(kind, id); if(!it) return;
  const d = { k: kind };
  SHARE_FIELDS[kind].forEach(f => { if(it[f] != null && it[f] !== '') d[f] = it[f]; });
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = 'https://toojibee.ir/demo/#add=' + b64, text = it.title;
  trackEvent('share');
  if(androidApp) androidApp.share(t('appName'), text + '\n' + url);
  else if(navigator.share) navigator.share({ title: t('appName'), text, url }).catch(() => {});
  else { copyText(url); showToast(t('itemLinkCopied')); }
}
function takeItemFromLink(){
  const m = /[#&]add=([A-Za-z0-9_-]{4,6000})/.exec(location.hash);
  if(!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  let d; try{ d = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); }catch(e){ return; }
  const kind = d && d.k, fields = SHARE_FIELDS[kind];
  if(!fields || typeof d.title !== 'string' || !d.title.trim()) return;
  const key = /^\d{4}-\d{2}-\d{2}$/, hm = /^\d{2}:\d{2}$/;
  const it = { id: uid(), title: d.title.trim().slice(0, 300), notification: { type: null } };
  if(typeof d.description === 'string') it.description = d.description.slice(0, 5000);
  ['date', 'endDate', 'startDate'].forEach(f => { if(key.test(d[f] || '')) it[f] = d[f]; });
  ['startTime', 'endTime'].forEach(f => { it[f] = hm.test(d[f] || '') ? d[f] : null; });
  const r = d.recurrence && typeof d.recurrence === 'object' ? d.recurrence : {};
  it.recurrence = { mode: ['interval', 'weekdays', 'monthly', 'yearly'].includes(r.mode) ? r.mode : null, interval: Math.min(99, Math.max(1, Number(r.interval) || 1)),
    weekdays: Array.isArray(r.weekdays) ? r.weekdays.filter(n => n >= 0 && n <= 6) : [], anchor: key.test(r.anchor || '') ? r.anchor : null, cal: ['jalali', 'gregorian', 'hijri'].includes(r.cal) ? r.cal : null };
  if(!confirm(t('itemImportTitle') + '\n\n' + it.title)) return;
  const today_ = dateKey(today);
  if(kind === 'task'){
    Object.assign(it, { category: '', photos: [], pinned: false, done: false, skipped: false, statusByDate: {}, subtasks: [], timeMode: d.timeMode === 'range' && it.endDate ? 'range' : 'single', date: it.date || today_ });
    state.tasks.push(it); cloudSync(() => Cloud.saveTask(it));
  } else if(kind === 'habit'){
    const tr = d.tracker && (d.tracker.kind === 'counter' || d.tracker.kind === 'timer') ? d.tracker : null;
    Object.assign(it, { startDate: today_, completedDates: [], skippedDates: [], progress: {}, tracker: tr });
    if(!it.recurrence.mode) it.recurrence.mode = 'interval';
    state.habits.push(it); cloudSync(() => Cloud.saveHabit(it));
  } else {
    Object.assign(it, { kind: ['birthday', 'countdown'].includes(d.kind) ? d.kind : '', color: /^#[0-9a-fA-F]{6}$/.test(d.color || '') ? d.color : '', timeMode: d.timeMode === 'range' && it.endDate ? 'range' : 'single', date: it.date || today_ });
    state.events.push(it); cloudSync(() => Cloud.saveEvent(it));
  }
  render();
  showToast(t('itemAdded'));
}
