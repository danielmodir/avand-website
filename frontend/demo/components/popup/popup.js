function typeLabel(type){ return t(type); }

let formPhotos = [];

let formSubtasks = [];

let formWeekdays = new Set();

let formDraft = {};

function findItem(type, id){
  if(type === 'task') return findTaskOrSub(id).item; // tasks and subtasks share the editor
  const key = type === 'task' ? 'tasks' : type === 'habit' ? 'habits' : 'events';
  return state[key].find(x => x.id === id);
}

function resetFormDraft(type, existing){
  formDraft = {
    title: existing ? existing.title : '',
    category: existing ? (existing.category || '') : '',
    description: existing ? (existing.description || '') : '',
    timeMode: existing ? (existing.timeMode || 'single') : 'single',
    // A new item goes on the day picked in the calendar (homeDate), not today.
    date: existing ? existing.date : dateKey(state.homeDate || today),
    endDate: existing ? (existing.endDate || existing.date) : dateKey(state.homeDate || today),
    // 'HH:MM' or '' — the end time only when "end time" was ticked.
    startTime: existing ? (existing.startTime || '') : '',
    endTime: existing ? (existing.endTime || '') : '',
    recurrence: {
      mode: existing ? (existing.recurrence?.mode || null) : (type === 'habit' ? 'interval' : null),
      interval: existing ? (existing.recurrence?.interval || 1) : 1
    },
    notification: {
      type: existing ? (existing.notification?.type || null) : null,
      time: existing ? (existing.notification?.time || '09:00') : '09:00',
      repeatHours: existing ? (existing.notification?.repeatHours || 1) : 1,
      text: existing ? (existing.notification?.text || '') : ''
    }
  };
  formPhotos = existing ? [...(existing.photos||[])] : [];
  formSubtasks = existing ? (existing.subtasks || []).map(s => ({...s})) : [];
  formWeekdays = new Set(existing ? (existing.recurrence?.weekdays||[]) : []);
}

function openPopup(type, originEl, existing){
  state.popupOpen = true; state.popupType = type; state.navExpanded = false;
  state.editingId = existing ? existing.id : null;
  // Set while editing a subtask: same form, minus repeat and subtasks.
  state.editingParentId = (existing && type === 'task') ? (findTaskOrSub(existing.id).parent?.id || null) : null;
  state.popupSubView = null;
  resetFormDraft(type, existing);

  const popup = document.getElementById('add-popup');
  const overlay = document.getElementById('popup-overlay');

  let originStyle = '';
  if(originEl){
    const deviceRect = document.getElementById('device').getBoundingClientRect();
    const originRect = originEl.getBoundingClientRect();
    const ox = originRect.left + originRect.width/2 - deviceRect.left;
    const oy = originRect.top + originRect.height/2 - deviceRect.top;
    originStyle = `${ox}px ${oy}px`;
  } else {
    popup.style.transformOrigin = '50% 90%';
  }

  popup.innerHTML = `
    <div class="popup-topbar">
      <span class="popup-topbar-title">${existing ? typeLabel(type) : t('new' + type[0].toUpperCase() + type.slice(1))}</span>
      <button type="button" class="popup-close" data-action="close-popup" aria-label="${t('closeBtn')}">${ICONS.close}</button>
    </div>
    <div class="popup-body"></div>
    <button class="pop-submit" id="popup-submit" data-action="submit-popup">${existing?t('saveChanges'):t('add') + ' ' + typeLabel(type)}</button>
  `;
  render();
  if(originStyle) popup.style.transformOrigin = originStyle;
  overlay.classList.add('show');
  // Only if it's still open by then (a very quick close, or Back, used to
  // leave a dead popup on screen).
  requestAnimationFrame(() => { if(state.popupOpen) popup.classList.add('show'); });

  renderPopupBody();
  setTimeout(() => { if(!existing) document.getElementById('f-title')?.focus(); }, 200);
}

function closePopup(){
  state.popupOpen = false; state.editingId = null; state.editingParentId = null; state.popupSubView = null;
  document.getElementById('add-popup').classList.remove('show');
  document.getElementById('popup-overlay').classList.remove('show');
}

/* ---- main form body (per type) ---- */
function popupIconRow(type){
  const icons = [];
  if(type !== 'habit') icons.push({ key:'calendar', icon:ICONS.calendarIcon, set: formDraft.timeMode==='range' || formDraft.date !== dateKey(today) || !!formDraft.startTime || !!formDraft.endTime });
  if(!state.editingParentId) icons.push({ key:'repeat', icon:ICONS.repeatIcon, set: !!formDraft.recurrence.mode });
  icons.push({ key:'notification', icon:ICONS.bellIcon, set: !!formDraft.notification.type, disabled:true });
  return `<div class="popup-icon-row">${icons.map(i => `<div class="popup-icon-btn ${i.set?'set':''} ${i.disabled?'disabled':''}" data-action="${i.disabled?'notification-coming-soon':'open-subview'}" data-sub="${i.key}">${i.icon}</div>`).join('')}</div>`;
}

function descriptionBlock(){
  return `
    <div class="field desc-wrap">
      <textarea id="f-description" placeholder="${t('description')}">${escapeHtml(formDraft.description||'')}</textarea>
      <div class="desc-clip-btn ${formPhotos.length?'has-files':''}" id="desc-clip-btn">${ICONS.paperclip}</div>
      <input type="file" id="f-photo-input" accept="image/*" multiple style="display:none;">
    </div>
    ${formPhotos.length ? `<div class="photo-add-row" style="margin-top:8px;">${formPhotos.map((p,i) => `<div class="photo-thumb"><img src="${p}"><button type="button" class="rm" data-rmphoto="${i}">×</button></div>`).join('')}</div>` : ''}
  `;
}

function subtasksBlock(){
  return `
    <div class="field">
      <div class="subtasks-list" id="subtasks-list">${subtasksListHtml()}</div>
      ${formSubtasks.length < 3 ? `<button type="button" class="add-ghost-btn${formSubtasks.length > 0 ? ' plus-only' : ''}" id="add-subtask-btn">${formSubtasks.length === 0 ? t('addSubtask') : '+'}</button>` : ''}
    </div>`;
}

function subtasksListHtml(){
  return formSubtasks.map((s,i) => `<div class="subtask-edit-row">
    <input type="text" value="${escapeAttr(subTitle(s))}" data-subidx="${i}" placeholder="${t('subtaskTitle')}">
    <button type="button" class="remove-x" data-rmsubtask="${i}">×</button>
  </div>`).join('');
}

function formBody(type){
  const parts = [popupIconRow(type)];
  if(type === 'task'){
    parts.push(descriptionBlock());
  }
  return parts.join('');
}

/* ---- subviews ---- */
function renderPopupSubView(){
  const sub = state.popupSubView;
  const type = state.popupType;
  let title = '', content = '';
  if(sub === 'repeat'){ title = t('repeatTitle'); content = repeatSubviewHtml(type); }
  else if(sub === 'notification'){ title = t('reminderTitle'); content = notificationSubviewHtml(); }
  return `
    <div class="popup-subview-header">
      <div class="popup-back" data-action="close-subview">${ICONS.arrowBack}</div>
      <div class="popup-subview-title">${title}</div>
    </div>
    ${content}
  `;
}

function repeatSubviewHtml(type){
  const mode = formDraft.recurrence.mode;
  const options = type === 'habit' ? ['interval','weekdays'] : ['none','interval','weekdays'];
  const labelMap = { none:t('noRepeat'), interval:t('everyNDays'), weekdays:t('specificDays') };
  return `
    <select class="settings-select" id="rec-mode-select" style="width:100%;">
      ${options.map(o => `<option value="${o}" ${(mode===o || (o==='none' && !mode)) ? 'selected':''}>${labelMap[o]}</option>`).join('')}
    </select>
    <div id="rec-interval-panel" class="${mode==='interval'?'':'hidden'}" style="margin-top:10px;">
      <input type="number" id="f-interval" min="1" max="7" value="${formDraft.recurrence.interval}" placeholder="${t('repeatEveryDays')}">
    </div>
    <div id="rec-weekdays-panel" class="${mode==='weekdays'?'':'hidden'}" style="margin-top:10px;">
      <div class="weekday-picker">${weekdayOrder().map(i => `<button type="button" data-wd="${i}" class="${formWeekdays.has(i)?'active':''}">${weekdayShort(i)}</button>`).join('')}</div>
    </div>
  `;
}

function notificationSubviewHtml(){
  const n = formDraft.notification;
  return `
    <div class="toggle-pair" id="notif-mode-toggle">
      <button type="button" data-notif="none" class="${!n.type?'active':''}">${t('noReminder')}</button>
      <button type="button" data-notif="time" class="${n.type==='time'?'active':''}">${t('atATime')}</button>
      <button type="button" data-notif="repeat" class="${n.type==='repeat'?'active':''}">${t('repeating')}</button>
    </div>
    <div id="notif-time-panel" class="${n.type==='time'?'':'hidden'}" style="margin-top:10px;">
      <input type="time" id="f-notif-time" value="${n.time}">
    </div>
    <div id="notif-repeat-panel" class="${n.type==='repeat'?'':'hidden'}" style="margin-top:10px;">
      <input type="number" id="f-notif-hours" min="1" max="12" value="${n.repeatHours}" placeholder="${t('everyNHours')}">
    </div>
    <div style="margin-top:10px;">
      <input type="text" id="f-notif-text" placeholder="${t('customReminderText')}" value="${escapeAttr(n.text)}">
    </div>
  `;
}

/* ---- master body renderer + wiring ---- */
function renderPopupBody(){
  const body = document.querySelector('#add-popup .popup-body');
  if(!body) return;
  if(state.popupSubView){
    body.innerHTML = renderPopupSubView();
    wireSubviewInteractivity();
    return;
  }
  body.innerHTML = `
    <div class="float-field"><input type="text" id="f-title" placeholder=" " value="${escapeAttr(formDraft.title)}" autocomplete="off"><label>${t('titleLabel')}</label></div>
    ${state.popupType === 'task' && !state.editingParentId ? subtasksBlock() : ''}
    ${formBody(state.popupType)}
  `;
  wireMainFormInteractivity();
  const titleInput = document.getElementById('f-title');
  const submitBtn = document.getElementById('popup-submit');
  submitBtn.classList.toggle('visible', titleInput.value.trim().length > 0);
  titleInput.addEventListener('input', () => {
    formDraft.title = titleInput.value;
    submitBtn.classList.toggle('visible', titleInput.value.trim().length > 0);
  });
}

function wireMainFormInteractivity(){
  document.getElementById('f-description')?.addEventListener('input', e => { formDraft.description = e.target.value; });
  document.getElementById('desc-clip-btn')?.addEventListener('click', () => document.getElementById('f-photo-input').click());
  document.getElementById('f-photo-input')?.addEventListener('change', (e) => {
    const picked = Array.from(e.target.files).slice(0, 3 - formPhotos.length);
    const oversized = picked.some(f => f.size > MAX_UPLOAD_BYTES);
    const files = picked.filter(f => f.size <= MAX_UPLOAD_BYTES);
    if(oversized) showToast(t('fileTooLarge'));
    let remaining = files.length;
    if(remaining === 0) return;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => { formPhotos.push(reader.result); remaining--; if(remaining===0) renderPopupBody(); };
      reader.readAsDataURL(file);
    });
  });
  document.querySelectorAll('[data-rmphoto]').forEach(b => b.addEventListener('click', () => { formPhotos.splice(Number(b.dataset.rmphoto),1); renderPopupBody(); }));
  document.getElementById('add-subtask-btn')?.addEventListener('click', () => { if(formSubtasks.length>=3) return; formSubtasks.push(newSubtask({ date: formDraft.date }, '')); renderPopupBody(); });
  document.querySelectorAll('[data-rmsubtask]').forEach(b => b.addEventListener('click', () => { formSubtasks.splice(Number(b.dataset.rmsubtask),1); renderPopupBody(); }));
  document.querySelectorAll('[data-subidx]').forEach(inp => inp.addEventListener('input', e => { const s = formSubtasks[Number(e.target.dataset.subidx)]; s.title = s.text = e.target.value; }));
}

function wireSubviewInteractivity(){
  const sub = state.popupSubView;
  if(sub === 'repeat'){
    document.getElementById('rec-mode-select')?.addEventListener('change', e => {
      formDraft.recurrence.mode = e.target.value === 'none' ? null : e.target.value;
      renderPopupBody();
    });
    document.getElementById('f-interval')?.addEventListener('input', e => { formDraft.recurrence.interval = Number(e.target.value||1); });
    document.querySelectorAll('.weekday-picker button').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.wd);
      if(formWeekdays.has(i)){ formWeekdays.delete(i); b.classList.remove('active'); } else { formWeekdays.add(i); b.classList.add('active'); }
    }));
  } else if(sub === 'notification'){
    document.querySelectorAll('#notif-mode-toggle button').forEach(b => b.addEventListener('click', () => {
      formDraft.notification.type = b.dataset.notif === 'none' ? null : b.dataset.notif;
      renderPopupBody();
    }));
    document.getElementById('f-notif-time')?.addEventListener('input', e => { formDraft.notification.time = e.target.value; });
    document.getElementById('f-notif-hours')?.addEventListener('input', e => { formDraft.notification.repeatHours = Number(e.target.value||1); });
    document.getElementById('f-notif-text')?.addEventListener('input', e => { formDraft.notification.text = e.target.value; });
  }
}

function submitPopup(){
  const title = (formDraft.title||'').trim();
  if(!title) return;
  const type = state.popupType;
  const recurrence = { mode: formDraft.recurrence.mode, interval: formDraft.recurrence.interval, weekdays: Array.from(formWeekdays) };
  // Repeat settings that would hide the item or make no sense: say so
  // instead of saving something that never shows up.
  if(recurrence.mode === 'weekdays' && !recurrence.weekdays.length){ showToast(t('weekdaysRequired')); return; }
  if(recurrence.mode === 'interval'){
    const n = Math.round(Number(recurrence.interval));
    if(!(n >= 1 && n <= 7)){ showToast(t('intervalRange')); return; }
    recurrence.interval = n;
  }
  if(type !== 'habit' && recurrence.mode && formDraft.timeMode === 'range' && formDraft.endDate !== formDraft.date){ showToast(t('rangeNoRepeat')); return; }
  // A new task or event can't be put on a day that has already passed.
  if(!state.editingId && (type === 'task' || type === 'event') && formDraft.date < dateKey(today)){ showToast(t('pastDateNotAllowed')); haptic(20); return; }
  const notification = { ...formDraft.notification };
  const times = { startTime: formDraft.startTime || null, endTime: formDraft.endTime || null };
  if(type === 'task' && state.editingParentId){
    // Editing a subtask: update it inside its parent and save the parent.
    const parent = state.tasks.find(x => x.id === state.editingParentId);
    const sub = parent?.subtasks.find(s => s.id === state.editingId);
    if(sub){
      Object.assign(sub, {
        title, text: title,
        description: (formDraft.description||'').trim(),
        photos: [...formPhotos],
        timeMode: formDraft.timeMode,
        date: formDraft.date,
        endDate: formDraft.timeMode==='range' ? formDraft.endDate : null,
        ...times,
        notification
      });
      cloudSync(() => Cloud.saveTask(parent));
    }
  } else if(type === 'task'){
    const existing = state.editingId ? findItem('task', state.editingId) : null;
    const obj = {
      id: state.editingId || uid(),
      title,
      category: (formDraft.category||'').trim(),
      description: (formDraft.description||'').trim(),
      photos: [...formPhotos],
      pinned: existing ? existing.pinned : false,
      done: existing ? existing.done : false,
      skipped: existing ? !!existing.skipped : false,
      statusByDate: existing ? { ...(existing.statusByDate || {}) } : {},
      subtasks: formSubtasks.filter(s => subTitle(s).trim()).slice(0,3).map(s => normalizeSubtask(s, { date: formDraft.date })),
      timeMode: formDraft.timeMode,
      date: formDraft.date,
      endDate: formDraft.timeMode==='range' ? formDraft.endDate : null,
      ...times,
      recurrence, notification
    };
    // A new, unticked subtask makes a finished parent unfinished again.
    if(obj.subtasks.length && !obj.recurrence.mode){ obj.done = obj.subtasks.every(s => s.done); if(obj.done) obj.skipped = false; }
    upsert('tasks', obj);
  } else if(type === 'habit'){
    const obj = {
      id: state.editingId || uid(),
      title,
      recurrence, notification,
      // A new habit starts on the day picked in the calendar.
      startDate: state.editingId ? findItem('habit', state.editingId).startDate : dateKey(state.homeDate || today),
      completedDates: state.editingId ? findItem('habit', state.editingId).completedDates : []
    };
    upsert('habits', obj);
  } else if(type === 'event'){
    const obj = {
      id: state.editingId || uid(),
      title,
      timeMode: formDraft.timeMode,
      date: formDraft.date,
      endDate: formDraft.timeMode==='range' ? formDraft.endDate : null,
      ...times,
      recurrence, notification
    };
    upsert('events', obj);
  }
  closePopup();
  render();
}

const CLOUD_SAVE_BY_ARRKEY = { tasks: Cloud.saveTask, habits: Cloud.saveHabit, events: Cloud.saveEvent };

function upsert(arrKey, obj){
  const arr = state[arrKey];
  const idx = arr.findIndex(x => x.id === obj.id);
  if(idx >= 0) arr[idx] = obj; else arr.push(obj);
  cloudSync(() => CLOUD_SAVE_BY_ARRKEY[arrKey](obj));
}
