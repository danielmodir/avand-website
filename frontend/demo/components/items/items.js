/* Small DONE/UNDONE popover, revealed by holding a checkbox (see
   attachCheckboxLongPress) — an explicit alternative to the normal tap-
   to-toggle, independent of the row's own swipe-to-delete gesture. */
function checkboxQuicksetHtml(){
  return `<div class="checkbox-quickset">
    <button type="button" class="qs-done" data-qs="done" tabindex="-1">${t('qsDone')}</button>
    <button type="button" class="qs-undone" data-qs="undone" tabindex="-1">${t('qsUndone')}</button>
  </div>`;
}

function taskRow(task){
  const subs = task.subtasks || [];
  const open = subs.length > 0 && !!state.expandedTasks[task.id];
  return `<div class="swipe-wrap task-wrap" data-swipe-type="task" data-swipe-id="${task.id}">
    <div class="swipe-delete-bg">${ICONS.trash}</div>
    <div class="item-card task-row ${subs.length?'has-subtasks':''} ${task.done?'done':''} ${task.skipped?'skipped':''}">
      <div class="checkbox ${task.done?'checked':''} ${task.skipped?'skipped':''}" data-action="toggle-task" data-id="${task.id}" role="checkbox" aria-checked="${task.done}" aria-label="${escapeAttr(task.title)}" tabindex="0">${task.done?ICONS.check:task.skipped?ICONS.close:''}${checkboxQuicksetHtml()}</div>
      <div class="task-title-wrap" data-action="edit-item" data-type="task" data-id="${task.id}">
        <p class="item-title">${escapeHtml(task.title)}</p>
      </div>
      <button class="star-mini ${task.pinned?'active':''}" data-action="toggle-pin" data-id="${task.id}" aria-label="${task.pinned?t('unpinBtn'):t('pinBtn')}">${ICONS.star}</button>
      ${subs.length ? `<button type="button" class="subtask-toggle ${open?'open':''}" data-action="toggle-subtasks" data-id="${task.id}" aria-label="${t('subtasksLabel')}" aria-expanded="${open}">${ICONS.chevronDown}</button>` : ''}
    </div>
  </div>
  ${open ? `<div class="subtask-children">${subs.map(s => subtaskRow(task, s)).join('')}</div>` : ''}`;
}

/* Same checkbox + title as a task row, just smaller and indented under
   its parent's checkbox — toggled via toggle-subtask, which keeps the
   parent's done state in sync both ways (see syncTaskFromSubtasks). */
function subtaskRow(task, s){
  return `<div class="subtask-row ${s.done?'done':''}" data-task-id="${task.id}" data-sub-id="${s.id}">
    <div class="checkbox ${s.done?'checked':''}" data-action="toggle-subtask" data-task-id="${task.id}" data-sub-id="${s.id}" role="checkbox" aria-checked="${!!s.done}" aria-label="${escapeAttr(s.text)}" tabindex="0">${s.done?ICONS.check:''}</div>
    <p class="item-title">${escapeHtml(s.text)}</p>
  </div>`;
}

function habitRow(h, date){
  const key = dateKey(date);
  const checked = h.completedDates.includes(key);
  const skipped = !checked && (h.skippedDates||[]).includes(key);
  return `<div class="swipe-wrap" data-swipe-type="habit" data-swipe-id="${h.id}">
    <div class="swipe-delete-bg">${ICONS.trash}</div>
    <div class="item-card ${checked?'done':''} ${skipped?'skipped':''}">
      <div class="checkbox square ${checked?'checked':''} ${skipped?'skipped':''}" data-action="toggle-habit" data-id="${h.id}" data-date="${key}" role="checkbox" aria-checked="${checked}" aria-label="${escapeAttr(h.title)}" tabindex="0">${checked?ICONS.check:skipped?ICONS.close:''}${checkboxQuicksetHtml()}</div>
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

function renderTasksSection(tasks){
  const sorted = [...tasks].sort((a,b) => (b.pinned - a.pinned) || (a.done - b.done));
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
    ${visible.map(t=>taskRow(t)).join('')}
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
  return `${renderEventsSection(events)}${renderTasksSection(tasks)}${renderHabitsSection(habits, date)}`;
}

/* Holding a checkbox (task or habit) reveals a small DONE/UNDONE popover
   next to it — an explicit alternative to the normal tap-to-toggle,
   separate from the row's own swipe-to-delete gesture. Delegated once on
   #device (not per-row) so it keeps working after the scoped DOM patches
   in the toggle-task/habit handlers, which never re-render the row. */
/* markSkipped is only ever true from the quickset's UNDONE button — an
   explicit "not done" (red X + strikethrough), distinct from the plain
   tap-to-toggle empty state. The three states this gives a task/habit:
   done, explicitly-not-done, and (via swipe) deleted. */
function applyQuicksetState(cb, wantDone, markSkipped){
  const action = cb.dataset.action;
  const isSkipped = !!markSkipped && !wantDone;
  let isDone, toggledTask = null;
  if(action === 'toggle-task'){
    const item = state.tasks.find(x => x.id === cb.dataset.id);
    if(!item) return;
    item.done = wantDone; item.skipped = isSkipped; isDone = wantDone;
    // Checking/unchecking the parent cascades to every subtask, so the
    // "all subtasks done <=> parent done" rule never ends up violated.
    (item.subtasks || []).forEach(s => { s.done = wantDone; });
    toggledTask = item;
    cloudSync(() => Cloud.saveTask(item));
  } else if(action === 'toggle-habit'){
    const item = state.habits.find(x => x.id === cb.dataset.id);
    if(!item) return;
    const dk = cb.dataset.date;
    const i = item.completedDates.indexOf(dk);
    if(wantDone && i < 0) item.completedDates.push(dk);
    else if(!wantDone && i >= 0) item.completedDates.splice(i, 1);
    item.skippedDates = item.skippedDates || [];
    const si = item.skippedDates.indexOf(dk);
    if(isSkipped && si < 0) item.skippedDates.push(dk);
    else if(!isSkipped && si >= 0) item.skippedDates.splice(si, 1);
    isDone = wantDone;
    cloudSync(() => Cloud.saveHabit(item));
  } else return;
  cb.classList.toggle('checked', isDone);
  cb.classList.toggle('skipped', isSkipped);
  cb.setAttribute('aria-checked', isDone);
  const qs = cb.querySelector('.checkbox-quickset');
  qs?.classList.remove('show'); // always closes the popover, even when set via a qs button
  cb.innerHTML = (isDone ? ICONS.check : isSkipped ? ICONS.close : '') + (qs ? qs.outerHTML : '');
  cb.closest('.item-card')?.classList.toggle('done', isDone);
  cb.closest('.item-card')?.classList.toggle('skipped', isSkipped);
  if(toggledTask) syncSubtaskRowsDom(toggledTask);
  updateDayStatsInPlace();
}

/* In-place DOM patch (no full render(), same reasoning as above — keeps
   the pane's scroll position) for a task's subtask rows, and optionally
   its own parent checkbox. */
function syncSubtaskRowsDom(task){
  (task.subtasks || []).forEach(s => {
    document.querySelectorAll(`.subtask-row[data-task-id="${CSS.escape(task.id)}"][data-sub-id="${CSS.escape(s.id)}"]`).forEach(row => {
      row.classList.toggle('done', !!s.done);
      const scb = row.querySelector('.checkbox');
      if(!scb) return;
      scb.classList.toggle('checked', !!s.done);
      scb.setAttribute('aria-checked', !!s.done);
      scb.innerHTML = s.done ? ICONS.check : '';
    });
  });
}

function syncTaskCheckboxDom(task){
  document.querySelectorAll(`.checkbox[data-action="toggle-task"][data-id="${CSS.escape(task.id)}"]`).forEach(cb => {
    const qs = cb.querySelector('.checkbox-quickset');
    cb.classList.toggle('checked', !!task.done);
    cb.classList.toggle('skipped', !!task.skipped);
    cb.setAttribute('aria-checked', !!task.done);
    cb.innerHTML = (task.done ? ICONS.check : task.skipped ? ICONS.close : '') + (qs ? qs.outerHTML : '');
    cb.closest('.item-card')?.classList.toggle('done', !!task.done);
    cb.closest('.item-card')?.classList.toggle('skipped', !!task.skipped);
  });
}

/* Toggling one subtask: the parent becomes done exactly when every
   subtask is done (and loses any explicit "skipped" mark), and goes back
   to not-done as soon as one subtask is unchecked. */
function toggleSubtask(taskId, subId){
  const task = state.tasks.find(x => x.id === taskId);
  const sub = task?.subtasks?.find(s => s.id === subId);
  if(!sub) return;
  sub.done = !sub.done;
  task.done = task.subtasks.every(s => s.done);
  if(task.done) task.skipped = false;
  cloudSync(() => Cloud.saveTask(task));
  syncSubtaskRowsDom(task);
  syncTaskCheckboxDom(task);
  updateDayStatsInPlace();
}

function attachCheckboxLongPress(){
  const root = document.getElementById('device');
  if(!root) return;
  let timer = null, startX = 0, startY = 0;
  const closeAllQuicksets = () => {
    document.querySelectorAll('.checkbox-quickset.show').forEach(el => el.classList.remove('show'));
  };
  root.addEventListener('pointerdown', e => {
    const cb = e.target.closest('.checkbox[data-action]');
    if(!cb){ closeAllQuicksets(); return; }
    if(e.target.closest('.checkbox-quickset')) return;
    startX = e.clientX; startY = e.clientY;
    e.stopPropagation(); // keep the row's own swipe-to-delete from tracking this drag
    timer = setTimeout(() => {
      timer = null;
      closeAllQuicksets();
      cb.dataset.suppressClick = '1';
      cb.querySelector('.checkbox-quickset')?.classList.add('show');
      if(navigator.vibrate) navigator.vibrate(12);
    }, 450);
  }, true);
  root.addEventListener('pointermove', e => {
    if(!timer) return;
    if(Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8){ clearTimeout(timer); timer = null; }
  }, true);
  root.addEventListener('pointerup', () => { clearTimeout(timer); timer = null; }, true);
  root.addEventListener('pointercancel', () => { clearTimeout(timer); timer = null; }, true);
  root.addEventListener('click', e => {
    const qsBtn = e.target.closest('[data-qs]');
    if(qsBtn){
      e.stopPropagation();
      const cb = qsBtn.closest('.checkbox');
      if(cb) applyQuicksetState(cb, qsBtn.dataset.qs === 'done', true);
      return;
    }
    const cb = e.target.closest('.checkbox[data-action]');
    if(cb && cb.dataset.suppressClick){
      delete cb.dataset.suppressClick;
      e.stopPropagation();
      return; // the long-press already opened the popover; swallow this tap
    }
    closeAllQuicksets();
  }, true);
}

/* ============ DESKTOP: right-click context menu for task/habit rows ======
   Mouse equivalent of the mobile long-press quickset, plus Edit/Delete
   which that popover has no room for. Mobile has no reliable right-click,
   so this only arms at >=960px. */
function closeRowContextMenu(){ document.getElementById('row-context-menu')?.remove(); }

function showRowContextMenu(x, y, type, id, wrap){
  closeRowContextMenu();
  const menu = document.createElement('div');
  menu.id = 'row-context-menu';
  menu.className = 'row-context-menu';
  menu.innerHTML = `
    <button type="button" data-ctx="done">${ICONS.check}${t('qsDone')}</button>
    <button type="button" data-ctx="undone">${ICONS.close}${t('qsUndone')}</button>
    <button type="button" data-ctx="edit">${ICONS.pencilIcon}${t('editBtn')}</button>
    <button type="button" data-ctx="delete" class="danger">${ICONS.trash}${t('deleteBtn')}</button>
  `;
  document.body.appendChild(menu);
  // Clamp so it never renders off the right/bottom edge of the viewport.
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - h - 8) + 'px';
  menu.addEventListener('click', e => {
    const btn = e.target.closest('[data-ctx]');
    if(!btn) return;
    e.stopPropagation();
    const action = btn.dataset.ctx;
    const cb = wrap.querySelector('.checkbox[data-action]');
    if(action === 'done' && cb) applyQuicksetState(cb, true);
    else if(action === 'undone' && cb) applyQuicksetState(cb, false, true);
    else if(action === 'edit') openPopup(type, wrap, findItem(type, id));
    else if(action === 'delete'){
      if(type === 'task'){ state.tasks = state.tasks.filter(x => x.id !== id); cloudSync(() => Cloud.deleteTask(id)); }
      if(type === 'habit'){ state.habits = state.habits.filter(x => x.id !== id); cloudSync(() => Cloud.deleteHabit(id)); }
      render();
    }
    closeRowContextMenu();
  });
}

function attachDesktopContextMenu(){
  const root = document.getElementById('device');
  root.addEventListener('contextmenu', e => {
    if(window.innerWidth < 960) return;
    const wrap = e.target.closest('.swipe-wrap[data-swipe-type]');
    if(!wrap) return;
    const type = wrap.dataset.swipeType;
    if(type !== 'task' && type !== 'habit') return;
    e.preventDefault();
    showRowContextMenu(e.clientX, e.clientY, type, wrap.dataset.swipeId, wrap);
  });
  document.addEventListener('pointerdown', e => {
    if(!e.target.closest('.row-context-menu')) closeRowContextMenu();
  });
  document.addEventListener('scroll', closeRowContextMenu, true);
}
