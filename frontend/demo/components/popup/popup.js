function typeLabel(type){ return t(type); }

let formPhotos = [];

let formSubtasks = [];

let formWeekdays = new Set();

let formDraft = {};

/* Set by a group's "+" (components/groups/groups.js) just before opening
   the form, so the new item starts in that group. */
let popupPresetGroup = null;

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
      interval: existing ? (existing.recurrence?.interval || 1) : 1,
      anchor: existing ? (existing.recurrence?.anchor || null) : null,
      cal: existing ? (existing.recurrence?.cal || null) : null,
    },
    notification: {
      type: existing ? (existing.notification?.type || null) : null,
      time: existing ? (existing.notification?.time || '09:00') : '09:00',
      repeatHours: existing ? (existing.notification?.repeatHours || 1) : 1,
      minutesBefore: existing ? (existing.notification?.minutesBefore || 15) : 15,
      leadMinutes: existing ? (existing.notification?.leadMinutes || 1440) : 1440,
      everyMinutes: existing ? (existing.notification?.everyMinutes || 60) : 60,
      text: existing ? (existing.notification?.text || '') : ''
    },
    // Group planning: which group (none = just me) and how it's ticked.
    groupId: existing ? (existing.groupId || '') : (popupPresetGroup || ''),
    doneMode: existing?.doneMode === 'shared' ? 'shared' : 'each',
  };
  popupPresetGroup = null;
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
    <div class="pop-submit-bar"><button class="pop-submit" id="popup-submit" data-action="submit-popup">${existing?t('saveChanges'):t('add') + ' ' + typeLabel(type)}</button></div>
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

/* ---- details of a task, habit or event (tapping one) ----
   Read-only: title, date and time, repeat, description, photos and
   subtasks, with an Edit button that opens the usual form. Same popup,
   same open/close animation and Back behaviour. */
function repeatSummary(rec){
  if(!rec || !rec.mode) return '';
  const n = Math.max(1, rec.interval || 1);
  if(rec.mode === 'weekdays') return t('repeatWeeklyOn').replace('{days}', weekdayOrder().filter(i => (rec.weekdays || []).includes(i)).map(weekdayShort).join(lang() === 'fa' ? '، ' : ', '));
  const every = (one, many) => n === 1 ? t(one) : t(many).replace('{n}', dig(n));
  if(rec.mode === 'interval') return every('repeatEveryDay', 'repeatEveryNDays');
  const p = rec.anchor ? calendarParts(parseDateKey(rec.anchor), rec.cal || primarySystem()) : null;
  if(rec.mode === 'monthly') return `${every('repeatEveryMonth', 'repeatEveryNMonths')}${p ? ' · ' + t('repeatMonthDay').replace('{d}', dig(p.d)) : ''}`;
  if(rec.mode === 'yearly') return `${every('repeatEveryYear', 'repeatEveryNYears')}${p ? ' · ' + dig(p.d) + ' ' + monthNameFor(p.m - 1) : ''}`;
  return '';
}

function itemDetailsHtml(type, item){
  const rows = [];
  const date = type === 'habit' ? item.startDate : item.date;
  if(date){
    const range = item.timeMode === 'range' && item.endDate && item.endDate !== item.date;
    rows.push([ICONS.calendarIcon, (type === 'habit' ? t('detailsFrom') + ' ' : '') + formatDateLabel(date) + (range ? ' – ' + formatDateLabel(item.endDate) : '')]);
  }
  if(item.startTime) rows.push([ICONS.clockIcon, `<span dir="ltr">${itemTimeLabel(item)}</span>`]);
  const rep = repeatSummary(item.recurrence);
  if(rep) rows.push([ICONS.repeatIcon, rep]);
  const n = item.notification || {};
  if(n.type === 'time') rows.push([ICONS.bellIcon, t('reminderAt') + ' ' + `<span dir="ltr">${dig(n.time)}</span>`]);
  if(n.type === 'repeat') rows.push([ICONS.bellIcon, t('reminderEveryNHours').replace('{n}', dig(n.repeatHours || 1))]);
  if(n.type === 'before') rows.push([ICONS.bellIcon, t('reminderMinutesBefore').replace('{n}', dig(n.minutesBefore || 15))]);
  if(n.type === 'countdown') rows.push([ICONS.bellIcon, t('countdownSummary').replace('{lead}', durationLabel(n.leadMinutes || 1440)).replace('{every}', durationLabel(n.everyMinutes || 60))]);
  const g = item.groupId ? groupById(item.groupId) : null;
  if(g){
    const by = g.members.find(m => String(m.id) === String(item.groupBy));
    rows.push([ICONS.peopleIcon, `<span class="group-tag" style="--group-c:${g.color}">${escapeHtml(g.name)}</span>${by ? ' · ' + escapeHtml(t('groupBy').replace('{name}', by.name)) : ''}`]);
  }
  const subs = (item.subtasks || []).map(s => `<li class="${s.done ? 'done' : ''}">${escapeHtml(subTitle(s))}</li>`).join('');
  return `
    <h2 class="details-title">${escapeHtml(item.title || '')}</h2>
    ${rows.length ? `<div class="details-rows">${rows.map(([icon, text]) => `<div class="details-row">${icon}<span>${text}</span></div>`).join('')}</div>` : ''}
    <div class="section-title">${t('description')}</div>
    ${item.description ? `<p class="details-desc">${escapeHtml(item.description)}</p>` : `<p class="details-desc empty">${t('detailsNoDescription')}</p>`}
    ${(item.photos || []).length ? `<div class="photo-add-row">${item.photos.map(p => `<div class="photo-thumb"><img src="${p}" alt=""></div>`).join('')}</div>` : ''}
    ${subs ? `<div class="section-title">${t('subtasksLabel')}</div><ul class="details-subtasks">${subs}</ul>` : ''}`;
}

function openItemDetails(type, id, originEl){
  const item = findItem(type, id);
  if(!item) return;
  state.popupOpen = true; state.popupType = type; state.navExpanded = false;
  state.editingId = null; state.editingParentId = null; state.popupSubView = null;
  const popup = document.getElementById('add-popup');
  const overlay = document.getElementById('popup-overlay');
  popup.classList.remove('in-subview');
  popup.innerHTML = `
    <div class="popup-topbar">
      <span class="popup-topbar-title">${typeLabel(type)}</span>
      <button type="button" class="popup-close" data-action="close-popup" aria-label="${t('closeBtn')}">${ICONS.close}</button>
    </div>
    <div class="popup-body item-details" dir="${lang() === 'fa' ? 'rtl' : 'ltr'}">${itemDetailsHtml(type, item)}</div>
    ${groupItemEditable(type === 'task' ? (findTaskOrSub(id).parent || item) : item) ? `<div class="pop-submit-bar"><button class="pop-submit" data-action="edit-item" data-type="${type}" data-id="${escapeAttr(id)}">${ICONS.pencilIcon}<span>${t('editBtn')}</span></button></div>` : ''}`;
  if(originEl){
    const dev = document.getElementById('device').getBoundingClientRect(), o = originEl.getBoundingClientRect();
    popup.style.transformOrigin = `${o.left + o.width / 2 - dev.left}px ${o.top + o.height / 2 - dev.top}px`;
  } else popup.style.transformOrigin = '50% 90%';
  render();
  overlay.classList.add('show');
  requestAnimationFrame(() => { if(state.popupOpen) popup.classList.add('show'); });
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
  icons.push({ key:'notification', icon:ICONS.bellIcon, set: !!formDraft.notification.type });
  return `<div class="popup-icon-row">${icons.map(i => `<div class="popup-icon-btn ${i.set?'set':''} ${i.disabled?'disabled':''}" data-action="${i.disabled?'notification-coming-soon':'open-subview'}" data-sub="${i.key}">${i.icon}</div>`).join('')}</div>`;
}

function descriptionBlock(withPhotos = true){
  return `
    <div class="field desc-wrap">
      <textarea id="f-description" placeholder="${t('description')}">${escapeHtml(formDraft.description||'')}</textarea>
      ${withPhotos ? `<div class="desc-clip-btn ${formPhotos.length?'has-files':''}" id="desc-clip-btn">${ICONS.paperclip}</div>
      <input type="file" id="f-photo-input" accept="image/*" multiple style="display:none;">` : ''}
    </div>
    ${withPhotos && formPhotos.length ? `<div class="photo-add-row" style="margin-top:8px;">${formPhotos.map((p,i) => `<div class="photo-thumb"><img src="${p}"><button type="button" class="rm" data-rmphoto="${i}">×</button></div>`).join('')}</div>` : ''}
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
  if(type === 'task') parts.push(descriptionBlock());
  if(type === 'event') parts.push(descriptionBlock(false)); // events: a description, no photos
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

/* ---- repeat: daily (every N days), weekly (days of the week), monthly
   (a day of the month, every N months), yearly (a day of the year, every
   N years). Edited as a draft: only "Confirm" puts it on the item. ---- */
const REPEAT_MODES = ['interval', 'weekdays', 'monthly', 'yearly'];
const REPEAT_MAX = { interval: 30, monthly: 12, yearly: 10 };
let repeatDraft = null;

function startRepeatDraft(){
  const r = formDraft.recurrence;
  repeatDraft = {
    mode: REPEAT_MODES.includes(r.mode) ? r.mode : 'interval', // a new repeat starts as daily
    interval: Math.max(1, Number(r.interval) || 1),
    weekdays: new Set(formWeekdays),
    anchor: r.anchor || formDraft.date || dateKey(state.homeDate || today),
  };
}

/* "۱۵ام هر ماه" / "۲۵ مهر هر سال" for the picked day, in the main calendar. */
function repeatDayLabel(){
  const d = parseDateKey(repeatDraft.anchor);
  const p = calendarParts(d, primarySystem());
  if(repeatDraft.mode === 'monthly') return t('repeatMonthDay').replace('{d}', dig(p.d));
  return t('repeatYearDay').replace('{d}', `${dig(p.d)} ${monthNameFor(p.m - 1)}`);
}

function repeatSubviewHtml(type){
  const r = repeatDraft || (startRepeatDraft(), repeatDraft);
  const label = { interval: t('repeatDaily'), weekdays: t('repeatWeekly'), monthly: t('repeatMonthly'), yearly: t('repeatYearly') };
  const unit = { interval: t('repeatUnitDays'), monthly: t('repeatUnitMonths'), yearly: t('repeatUnitYears') };
  const hasRepeat = !!formDraft.recurrence.mode;
  return `
    <select class="settings-select" id="rec-mode-select" style="width:100%;">
      ${REPEAT_MODES.map(o => `<option value="${o}" ${r.mode === o ? 'selected' : ''}>${label[o]}</option>`).join('')}
    </select>
    ${r.mode === 'weekdays' ? `
      <div class="rec-block">
        <div class="weekday-picker">${weekdayOrder().map(i => `<button type="button" data-wd="${i}" class="${r.weekdays.has(i)?'active':''}">${weekdayShort(i)}</button>`).join('')}</div>
      </div>` : ''}
    ${r.mode === 'monthly' || r.mode === 'yearly' ? `
      <div class="rec-block">
        <button type="button" class="dob-field-btn rec-day-btn" id="rec-day-btn">${ICONS.calendarIcon}<span>${repeatDayLabel()}</span></button>
        <div class="profile-hint">${t(r.mode === 'monthly' ? 'repeatMonthlyHint' : 'repeatYearlyHint')}</div>
      </div>` : ''}
    ${r.mode !== 'weekdays' ? `
      <div class="rec-block rec-every">
        <span>${t('repeatEvery')}</span>
        <div class="rec-stepper" dir="ltr">
          <button type="button" data-step="-1" aria-label="−" ${r.interval <= 1 ? 'disabled' : ''}>−</button>
          <b>${dig(r.interval)}</b>
          <button type="button" data-step="1" aria-label="+" ${r.interval >= REPEAT_MAX[r.mode] ? 'disabled' : ''}>+</button>
        </div>
        <span>${unit[r.mode]}</span>
      </div>` : ''}
    <button type="button" class="btn btn-primary rec-confirm" id="rec-confirm">${t('dpDone')}</button>
    ${hasRepeat && type !== 'habit' ? `<button type="button" class="btn btn-outline rec-remove" id="rec-remove">${t('noRepeat')}</button>` : ''}
  `;
}

/* ---- reminder: at a time, every N hours from the start (until it's
   done), or N minutes before an event starts. A draft until "Confirm",
   like the repeat page. Delivered by js/core/notify.js. ---- */
const REMINDER_BEFORE_CHOICES = [5, 10, 15, 30, 60, 120, 1440];
/* "Over and over until it starts": from a day and time before the start
   (saved as minutes before it, so a repeating item gets it every time),
   every N minutes, up to the start. At most 7 days ahead. */
const COUNTDOWN_EVERY = [15, 30, 60, 120, 180, 360, 720, 1440];
const COUNTDOWN_MAX_LEAD = 10080;
function countdownStart(n){
  if(!formDraft.date || !formDraft.startTime) return null;
  const s = new Date(formDraft.date + 'T' + formDraft.startTime + ':00');
  return new Date(s.getTime() - n.leadMinutes * 60000);
}
function durationLabel(m){
  return m % 1440 === 0 ? t('durDays').replace('{n}', dig(m / 1440)) : m % 60 === 0 ? t('durHours').replace('{n}', dig(m / 60)) : t('durMinutes').replace('{n}', dig(m));
}
let reminderDraft = null;

function startReminderDraft(){
  const n = formDraft.notification;
  reminderDraft = {
    type: n.type || 'time', time: n.time || formDraft.startTime || '09:00',
    repeatHours: Math.min(12, Math.max(1, Number(n.repeatHours) || 1)),
    minutesBefore: n.minutesBefore || 15, text: n.text || '',
    leadMinutes: Math.min(COUNTDOWN_MAX_LEAD, Math.max(15, Number(n.leadMinutes) || 1440)),
    everyMinutes: COUNTDOWN_EVERY.includes(Number(n.everyMinutes)) ? Number(n.everyMinutes) : 60,
  };
}

function notificationSubviewHtml(){
  const n = reminderDraft || (startReminderDraft(), reminderDraft);
  const isEvent = state.popupType === 'event';
  const types = ['time', 'repeat'].concat(isEvent ? ['before'] : []).concat(state.popupType !== 'habit' ? ['countdown'] : []);
  const label = { time: t('atATime'), repeat: t('repeating'), before: t('reminderBefore'), countdown: t('reminderCountdown') };
  const beforeLabel = m => m % 1440 === 0 ? t('reminderDaysBefore').replace('{n}', dig(m / 1440))
    : m % 60 === 0 ? t('reminderHoursBefore').replace('{n}', dig(m / 60)) : t('reminderMinutesBefore').replace('{n}', dig(m));
  const permission = !('Notification' in window) ? 'unsupported' : Notification.permission;
  return `
    <select class="settings-select" id="notif-type-select" style="width:100%;">
      ${types.map(o => `<option value="${o}" ${n.type === o ? 'selected' : ''}>${label[o]}</option>`).join('')}
    </select>
    ${n.type === 'time' ? `<div class="rec-block rec-every"><span>${t('reminderAt')}</span><input type="time" id="f-notif-time" value="${n.time}"></div>` : ''}
    ${n.type === 'repeat' ? `
      <div class="rec-block rec-every">
        <span>${t('repeatEvery')}</span>
        <div class="rec-stepper" dir="ltr">
          <button type="button" data-hstep="-1" ${n.repeatHours <= 1 ? 'disabled' : ''}>−</button><b>${dig(n.repeatHours)}</b><button type="button" data-hstep="1" ${n.repeatHours >= 12 ? 'disabled' : ''}>+</button>
        </div>
        <span>${t('reminderHoursUnit')}</span>
      </div>
      <div class="profile-hint">${t('reminderRepeatHint').replace('{t}', `<span dir="ltr">${dig(formDraft.startTime || n.time)}</span>`)}</div>` : ''}
    ${n.type === 'before' ? (formDraft.startTime ? `
      <div class="rec-block"><select class="settings-select" id="notif-before-select" style="width:100%;">
        ${REMINDER_BEFORE_CHOICES.map(m => `<option value="${m}" ${n.minutesBefore === m ? 'selected' : ''}>${beforeLabel(m)}</option>`).join('')}
      </select></div>` : `<div class="profile-hint rec-block">${t('reminderNeedsStart')}</div>`) : ''}
    ${n.type === 'countdown' ? (formDraft.startTime ? (() => {
      const from = countdownStart(n);
      const times = Math.floor(n.leadMinutes / n.everyMinutes) + 1;
      return `
      <div class="rec-block"><span class="field-label">${t('countdownFrom')}</span>
        <button type="button" class="dob-field-btn rec-day-btn" id="countdown-from">${ICONS.calendarIcon}<span>${formatDateLabel(dateKey(from))} · <span dir="ltr">${dig(String(from.getHours()).padStart(2, '0') + ':' + String(from.getMinutes()).padStart(2, '0'))}</span></span></button></div>
      <div class="rec-block"><span class="field-label">${t('countdownEvery')}</span>
        <select class="settings-select" id="countdown-every" style="width:100%;">
          ${COUNTDOWN_EVERY.filter(m => m <= n.leadMinutes).map(m => `<option value="${m}" ${n.everyMinutes === m ? 'selected' : ''}>${durationLabel(m)}</option>`).join('')}
        </select></div>
      <div class="profile-hint">${t('countdownHint').replace('{lead}', durationLabel(n.leadMinutes)).replace('{every}', durationLabel(n.everyMinutes)).replace('{n}', dig(times))}</div>`;
    })() : `<div class="profile-hint rec-block">${t('reminderNeedsStart')}</div>`) : ''}
    <div class="field rec-block"><input type="text" id="f-notif-text" placeholder="${t('customReminderText')}" value="${escapeAttr(n.text)}" maxlength="200"></div>
    ${permission !== 'granted' ? `<div class="profile-hint">${t(permission === 'denied' ? 'notifBlockedHint' : permission === 'unsupported' ? 'notifUnsupportedHint' : 'notifAskHint')}</div>` : ''}
    <button type="button" class="btn btn-primary rec-confirm" id="notif-confirm">${t('dpDone')}</button>
    ${formDraft.notification.type ? `<button type="button" class="btn btn-outline rec-remove" id="notif-remove">${t('noReminder')}</button>` : ''}
  `;
}

/* ---- master body renderer + wiring ---- */
function renderPopupBody(){
  const body = document.querySelector('#add-popup .popup-body');
  if(!body) return;
  // A subpage (repeat, reminder) has its own Confirm: the form's Save hides meanwhile.
  document.getElementById('add-popup')?.classList.toggle('in-subview', !!state.popupSubView);
  if(state.popupSubView){
    body.innerHTML = renderPopupSubView();
    wireSubviewInteractivity();
    return;
  }
  body.innerHTML = `
    <div class="float-field"><input type="text" id="f-title" placeholder=" " value="${escapeAttr(formDraft.title)}" autocomplete="off"><label>${t('titleLabel')}</label></div>
    ${state.popupType === 'task' && !state.editingParentId ? subtasksBlock() : ''}
    ${formBody(state.popupType)}
    ${groupFieldHtml()}
  `;
  wireMainFormInteractivity();
  // The Save button always sits at the bottom; it only works with a title.
  const titleInput = document.getElementById('f-title');
  const submitBtn = document.getElementById('popup-submit');
  const paint = () => submitBtn.classList.toggle('needs-title', !titleInput.value.trim());
  paint();
  titleInput.addEventListener('input', () => { formDraft.title = titleInput.value; paint(); });
}

/* The group drop-down (only with groups, never for a subtask) and, for a
   task or habit in a group, how it's ticked. */
function groupFieldHtml(){
  if(state.editingParentId || !groupsAvailable() || !state.groups.length) return '';
  const g = formDraft.groupId ? groupById(formDraft.groupId) : null;
  return `
    <div class="field group-field"${g ? ` style="--group-c:${g.color}"` : ''}>
      <label class="field-label" for="f-group">${t('groupField')}</label>
      <div class="group-select-wrap">${g ? '<span class="group-dot" aria-hidden="true"></span>' : ''}
        <select class="settings-select" id="f-group" style="width:100%;">
          <option value="">${t('groupNone')}</option>
          ${state.groups.map(x => `<option value="${escapeAttr(x.id)}" ${x.id === formDraft.groupId ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
        </select>
      </div>
      ${g && state.popupType !== 'event' ? `
        <label class="field-label" for="f-done-mode" style="margin-top:10px;">${t('groupDoneMode')}</label>
        <select class="settings-select" id="f-done-mode" style="width:100%;">
          <option value="each" ${formDraft.doneMode !== 'shared' ? 'selected' : ''}>${t('groupDoneEach')}</option>
          <option value="shared" ${formDraft.doneMode === 'shared' ? 'selected' : ''}>${t('groupDoneShared')}</option>
        </select>` : ''}
    </div>`;
}

function wireMainFormInteractivity(){
  document.getElementById('f-group')?.addEventListener('change', e => { formDraft.groupId = e.target.value; renderPopupBody(); });
  document.getElementById('f-done-mode')?.addEventListener('change', e => { formDraft.doneMode = e.target.value === 'shared' ? 'shared' : 'each'; });
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
    const r = repeatDraft;
    document.getElementById('rec-mode-select')?.addEventListener('change', e => {
      r.mode = e.target.value;
      r.interval = Math.min(r.interval, REPEAT_MAX[r.mode] || r.interval);
      renderPopupBody();
    });
    document.querySelectorAll('.rec-stepper [data-step]').forEach(b => b.addEventListener('click', () => {
      r.interval = Math.min(REPEAT_MAX[r.mode] || 1, Math.max(1, r.interval + Number(b.dataset.step)));
      renderPopupBody();
    }));
    document.querySelectorAll('.weekday-picker button').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.wd);
      if(r.weekdays.has(i)) r.weekdays.delete(i); else r.weekdays.add(i);
      b.classList.toggle('active', r.weekdays.has(i));
    }));
    // Monthly: which day of the month; yearly: which day of the year.
    document.getElementById('rec-day-btn')?.addEventListener('click', () => openDatePicker({
      title: t(r.mode === 'monthly' ? 'repeatPickDayMonth' : 'repeatPickDayYear'),
      value: r.anchor, min: dateKey(stepYear(today, -1)), max: dateKey(stepYear(today, 5)),
      onPick: v => { r.anchor = v; renderPopupBody(); },
    }));
    document.getElementById('rec-confirm')?.addEventListener('click', () => {
      if(r.mode === 'weekdays' && !r.weekdays.size){ showToast(t('weekdaysRequired')); return; }
      formDraft.recurrence = {
        mode: r.mode, interval: r.mode === 'weekdays' ? 1 : r.interval,
        anchor: r.mode === 'monthly' || r.mode === 'yearly' ? r.anchor : null,
        cal: r.mode === 'monthly' || r.mode === 'yearly' ? primarySystem() : null,
      };
      formWeekdays = new Set(r.weekdays);
      repeatDraft = null; state.popupSubView = null;
      renderPopupBody();
    });
    document.getElementById('rec-remove')?.addEventListener('click', () => {
      formDraft.recurrence = { mode: null, interval: 1, anchor: null, cal: null };
      formWeekdays = new Set();
      repeatDraft = null; state.popupSubView = null;
      renderPopupBody();
    });
  } else if(sub === 'notification'){
    const n = reminderDraft;
    document.getElementById('notif-type-select')?.addEventListener('change', e => { n.type = e.target.value; renderPopupBody(); });
    document.getElementById('f-notif-time')?.addEventListener('input', e => { n.time = e.target.value; });
    document.querySelectorAll('[data-hstep]').forEach(b => b.addEventListener('click', () => {
      n.repeatHours = Math.min(12, Math.max(1, n.repeatHours + Number(b.dataset.hstep))); renderPopupBody();
    }));
    document.getElementById('notif-before-select')?.addEventListener('change', e => { n.minutesBefore = Number(e.target.value); });
    document.getElementById('countdown-every')?.addEventListener('change', e => { n.everyMinutes = Number(e.target.value); renderPopupBody(); });
    document.getElementById('countdown-from')?.addEventListener('click', () => {
      // Pick the day and time to start from: up to 7 days before the start.
      const start = new Date(formDraft.date + 'T' + formDraft.startTime + ':00');
      const from = countdownStart(n);
      openDatePicker({
        title: t('countdownFrom'), value: dateKey(from), max: formDraft.date, min: dateKey(addDays(parseDateKey(formDraft.date), -7)),
        time: { start: String(from.getHours()).padStart(2, '0') + ':' + String(from.getMinutes()).padStart(2, '0') },
        onPick: (v, _end, picked) => {
          const at = new Date(v + 'T' + ((picked && picked.start) || '09:00') + ':00');
          const lead = Math.round((start - at) / 60000);
          if(lead < 15){ showToast(t('countdownTooLate')); return; }
          if(lead > COUNTDOWN_MAX_LEAD){ showToast(t('countdownTooEarly')); return; }
          n.leadMinutes = lead;
          if(n.everyMinutes > lead) n.everyMinutes = COUNTDOWN_EVERY.filter(m => m <= lead).pop() || 15;
          renderPopupBody();
        },
      });
    });
    document.getElementById('f-notif-text')?.addEventListener('input', e => { n.text = e.target.value; });
    document.getElementById('notif-confirm')?.addEventListener('click', () => {
      if(n.type === 'time' && !n.time){ showToast(t('reminderTimeRequired')); return; }
      if((n.type === 'before' || n.type === 'countdown') && !formDraft.startTime){ showToast(t('reminderNeedsStart')); return; }
      formDraft.notification = { type: n.type, time: n.time || '09:00', repeatHours: n.repeatHours, minutesBefore: n.minutesBefore,
        leadMinutes: n.leadMinutes, everyMinutes: n.everyMinutes, text: n.text.trim() };
      reminderDraft = null; state.popupSubView = null;
      askNotificationPermission(); // the first reminder asks the browser once (js/core/notify.js)
      renderPopupBody();
    });
    document.getElementById('notif-remove')?.addEventListener('click', () => {
      formDraft.notification = Object.assign({}, formDraft.notification, { type: null });
      reminderDraft = null; state.popupSubView = null;
      renderPopupBody();
    });
  }
}

function submitPopup(){
  const title = (formDraft.title||'').trim();
  // The title is required: say so and put the cursor there.
  if(!title){ showToast(t('titleRequired')); haptic(20); document.getElementById('f-title')?.focus(); return; }
  if(state.popupSubView) return; // finish (or leave) the repeat / reminder page first
  const type = state.popupType;
  const rec = formDraft.recurrence;
  const recurrence = { mode: rec.mode, interval: rec.interval, weekdays: Array.from(formWeekdays), anchor: rec.anchor || null, cal: rec.cal || null };
  // Repeat settings that would hide the item or make no sense: say so
  // instead of saving something that never shows up.
  if(recurrence.mode === 'weekdays' && !recurrence.weekdays.length){ showToast(t('weekdaysRequired')); return; }
  if(REPEAT_MAX[recurrence.mode]){
    const n = Math.round(Number(recurrence.interval));
    if(!(n >= 1 && n <= REPEAT_MAX[recurrence.mode])){ showToast(t('intervalRange')); return; }
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
      if(parent.groupId) groupSaveItem('task', parent); else cloudSync(() => Cloud.saveTask(parent));
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
      description: (formDraft.description||'').trim(),
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
const CLOUD_DELETE_BY_ARRKEY = { tasks: Cloud.deleteTask, habits: Cloud.deleteHabit, events: Cloud.deleteEvent };

/* Saves to the person's own data, or to a group (js/core/groups.js); an
   item moved between the two (or between groups) leaves the old place. */
function upsert(arrKey, obj){
  const arr = state[arrKey];
  const idx = arr.findIndex(x => x.id === obj.id);
  const prev = idx >= 0 ? arr[idx] : null;
  const kind = { tasks: 'task', habits: 'habit', events: 'event' }[arrKey];
  const gid = formDraft.groupId && groupById(formDraft.groupId) ? formDraft.groupId : null;
  if(gid){
    Object.assign(obj, {
      groupId: gid, doneMode: kind === 'event' ? 'each' : formDraft.doneMode, pinned: false,
      groupMine: prev && prev.groupId ? prev.groupMine : true,
      groupMarks: prev && prev.groupId === gid ? prev.groupMarks : [],
    });
    projectGroupMarks(obj, kind);
  }
  if(idx >= 0) arr[idx] = obj; else arr.push(obj);
  const left = prev && prev.groupId && prev.groupId !== gid ? prev : null;
  if(prev && !prev.groupId && gid) cloudSync(() => CLOUD_DELETE_BY_ARRKEY[arrKey](prev.id));
  if(left) groupCloud(() => Cloud.deleteGroupItem(left.groupId, left.id).then(() => gid ? Cloud.saveGroupItem(gid, kind, groupItemData(obj), obj.doneMode) : null));
  else if(gid) groupSaveItem(kind, obj);
  if(!gid) cloudSync(() => CLOUD_SAVE_BY_ARRKEY[arrKey](obj));
}
