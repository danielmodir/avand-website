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

/* ============ DONE / NOT DONE PER DAY ============
   A one-off task keeps its state in done / skipped. A repeating task is
   ticked separately on every day it occurs (statusByDate, keyed by
   'YYYY-MM-DD'), the same model as the API's task_occurrences, so ticking
   today's run doesn't tick every other day of the series. */
function isRecurringTask(task){ return !!task.recurrence?.mode; }

function taskStatusOn(task, key){
  if(!isRecurringTask(task)) return task.done ? 'done' : task.skipped ? 'not_done' : null;
  return task.statusByDate?.[key] || null;
}

function setTaskStatusOn(task, key, status){
  if(!isRecurringTask(task)){
    task.done = status === 'done';
    task.skipped = status === 'not_done';
    return;
  }
  task.statusByDate = task.statusByDate || {};
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
  return `<div class="swipe-wrap task-wrap ${open?'subs-open':''} ${sel?'is-selected':''}" data-swipe-type="task" data-swipe-id="${task.id}">
    <div class="swipe-delete-bg">${ICONS.trash}</div>
    <div class="item-card task-row ${subs.length?'has-subtasks':''} ${done?'done':''} ${skipped?'skipped':''} ${sel?'is-selected':''}" data-select-type="task" data-select-id="${task.id}">
      <div class="checkbox ${done?'checked':''} ${skipped?'skipped':''}" data-action="toggle-task" data-id="${task.id}" data-date="${key}" role="checkbox" aria-checked="${done}" aria-label="${escapeAttr(task.title)}" tabindex="0">${done?ICONS.check:skipped?ICONS.close:''}</div>
      <div class="task-title-wrap" data-action="edit-item" data-type="task" data-id="${task.id}">
        <p class="item-title">${escapeHtml(task.title)}</p>
      </div>
      <button class="star-mini ${task.pinned?'active':''}" data-action="toggle-pin" data-id="${task.id}" aria-label="${task.pinned?t('unpinBtn'):t('pinBtn')}">${ICONS.star}</button>
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
    <p class="item-title" data-action="edit-item" data-type="task" data-id="${s.id}">${escapeHtml(title)}</p>
  </div>`;
}

function habitRow(h, date){
  const key = dateKey(date);
  const checked = h.completedDates.includes(key);
  const skipped = !checked && (h.skippedDates||[]).includes(key);
  return `<div class="swipe-wrap ${isSelected('habit', h.id)?'is-selected':''}" data-swipe-type="habit" data-swipe-id="${h.id}">
    <div class="swipe-delete-bg">${ICONS.trash}</div>
    <div class="item-card ${checked?'done':''} ${skipped?'skipped':''} ${isSelected('habit', h.id)?'is-selected':''}" data-select-type="habit" data-select-id="${h.id}">
      <div class="checkbox square ${checked?'checked':''} ${skipped?'skipped':''}" data-action="toggle-habit" data-id="${h.id}" data-date="${key}" role="checkbox" aria-checked="${checked}" aria-label="${escapeAttr(h.title)}" tabindex="0">${checked?ICONS.check:skipped?ICONS.close:''}</div>
      <p class="item-title" data-action="edit-item" data-type="habit" data-id="${h.id}" style="cursor:pointer;">${escapeHtml(h.title)}</p>
    </div>
  </div>`;
}

function sortEvents(events){
  return [...events].sort((a,b) => {
    const at = a.notification?.type === 'time' ? a.notification.time : null;
    const bt = b.notification?.type === 'time' ? b.notification.time : null;
    if(at && bt) return at.localeCompare(bt);
    if(at && !bt) return -1;
    if(!at && bt) return 1;
    return 0;
  });
}

function eventCard(e){
  const time = e.notification?.type === 'time' ? e.notification.time : '';
  return `<div class="event-card" data-action="edit-item" data-type="event" data-id="${e.id}">
    <button class="mini-btn event-del" data-action="delete-event" data-id="${e.id}" aria-label="${t('deleteBtn')}">${ICONS.trash}</button>
    ${time?`<span class="event-time">${time}</span>`:''}
    <p class="event-title">${escapeHtml(e.title)}</p>
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
    cloudSync(() => Cloud.saveTask(task));
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
    cloudSync(() => Cloud.saveTask(task));
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
    cloudSync(() => Cloud.saveHabit(habit));
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
  if(target.closest('.star-mini, .subtask-toggle, .row-context-menu')) return null;
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
  menu.innerHTML = `
    <button type="button" role="menuitem" data-ctx="done">${ICONS.check}${t('qsDone')}</button>
    <button type="button" role="menuitem" data-ctx="undone">${ICONS.close}${t('qsUndone')}</button>
    <button type="button" role="menuitem" data-ctx="edit">${ICONS.pencilIcon}${t('editBtn')}</button>
    <button type="button" role="menuitem" data-ctx="delete" class="danger">${ICONS.trash}${t('deleteBtn')}</button>
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
  else if(action === 'edit'){
    if(type === 'habit') openPopup('habit', el, findItem('habit', id));
    else openPopup('task', el, findTaskOrSub(id).item);
  } else if(action === 'delete'){
    deleteItem(type, id);
    render();
  }
}

function deleteItem(type, id){
  if(type === 'task'){
    state.tasks = state.tasks.filter(x => x.id !== id);
    cloudSync(() => Cloud.deleteTask(id));
  } else if(type === 'subtask'){
    const { parent } = findTaskOrSub(id);
    if(!parent) return;
    parent.subtasks = parent.subtasks.filter(s => s.id !== id);
    if(parent.subtasks.length && !isRecurringTask(parent)) parent.done = parent.subtasks.every(s => s.done);
    cloudSync(() => Cloud.saveTask(parent));
  } else if(type === 'habit'){
    state.habits = state.habits.filter(x => x.id !== id);
    cloudSync(() => Cloud.deleteHabit(id));
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
