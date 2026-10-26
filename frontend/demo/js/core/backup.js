/* ============ IMPORT / EXPORT (Settings → Backup & transfer) ============
   - .ics: tasks, habits and events for any calendar app (Google, Apple,
     Outlook…). Never the period. Monthly/yearly repeats are written as
     Gregorian repeats (other apps don't know the Solar Hijri calendar).
   - JSON backup: the person's own tasks, habits and events, and the period
     only when they tick it (with a warning: it's sensitive).
   Importing either one shows a preview first (how many are new, how many
   are already here) and skips duplicates (same id, or same kind + title +
   day). Group items are never exported. Tests: tests/backup.test.js. */

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUnesc = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const icsDate = k => String(k || '').replace(/-/g, '');
const icsKey = v => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
const nextKey = k => { const d = new Date(k + 'T00:00:00'); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function icsRule(r){
  if(!r || !r.mode) return '';
  const n = Math.max(1, Number(r.interval) || 1);
  if(r.mode === 'interval') return `FREQ=DAILY;INTERVAL=${n}`;
  if(r.mode === 'weekdays') return `FREQ=WEEKLY;BYDAY=${(r.weekdays || []).map(i => ICS_DAYS[i]).filter(Boolean).join(',')}`;
  if(r.mode === 'monthly') return `FREQ=MONTHLY;INTERVAL=${n}`;
  if(r.mode === 'yearly') return `FREQ=YEARLY;INTERVAL=${n}`;
  return '';
}

/* data: { tasks, habits, events } → the text of a .ics file. */
function buildIcs(data, stamp){
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Toojibee//toojibee.ir//FA', 'CALSCALE:GREGORIAN'];
  const now = stamp || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const add = (kind, it, date, endDate) => {
    if(!it || !it.title || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
    const timed = !!it.startTime;
    out.push('BEGIN:VEVENT', `UID:${it.id}@toojibee.ir`, `DTSTAMP:${now}`, `SUMMARY:${icsEsc(it.title)}`, `X-TOOJIBEE-KIND:${kind}${it.kind ? '-' + it.kind : ''}`);
    if(timed){
      out.push(`DTSTART:${icsDate(date)}T${it.startTime.replace(':', '')}00`);
      if(it.endTime) out.push(`DTEND:${icsDate(endDate || date)}T${it.endTime.replace(':', '')}00`);
    } else {
      out.push(`DTSTART;VALUE=DATE:${icsDate(date)}`, `DTEND;VALUE=DATE:${icsDate(nextKey(endDate || date))}`);
    }
    if(it.description) out.push(`DESCRIPTION:${icsEsc(it.description)}`);
    const rule = icsRule(it.recurrence);
    if(rule) out.push(`RRULE:${rule}`);
    out.push('END:VEVENT');
  };
  (data.events || []).forEach(e => add('event', e, e.date, e.timeMode === 'range' ? e.endDate : null));
  (data.tasks || []).forEach(x => add('task', x, x.date, x.timeMode === 'range' ? x.endDate : null));
  (data.habits || []).forEach(h => add('habit', h, h.startDate, null));
  out.push('END:VCALENDAR');
  // Lines longer than 74 characters are folded (RFC 5545).
  return out.map(l => l.length <= 74 ? l : l.match(/.{1,73}/g).join('\r\n ')).join('\r\n') + '\r\n';
}

/* A .ics file → { tasks, habits, events } in the app's shape (new ids). */
function parseIcs(text, makeId){
  const lines = String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = { tasks: [], habits: [], events: [] };
  let cur = null;
  for(const line of lines){
    if(line === 'BEGIN:VEVENT'){ cur = {}; continue; }
    if(line === 'END:VEVENT'){ if(cur) pushIcsItem(cur, out, makeId); cur = null; continue; }
    if(!cur) continue;
    const i = line.indexOf(':');
    if(i < 0) continue;
    const name = line.slice(0, i).split(';')[0].toUpperCase();
    if(!(name in cur)) cur[name] = line.slice(i + 1);
  }
  return out;
}

function pushIcsItem(p, out, makeId){
  const start = (p.DTSTART || '').trim(), m = /^(\d{8})(?:T(\d{2})(\d{2}))?/.exec(start);
  const title = icsUnesc(p.SUMMARY || '').trim().slice(0, 300);
  if(!m || !title) return;
  let date = icsKey(m[1]), startTime = m[2] ? `${m[2]}:${m[3]}` : null;
  if(m[2] && /Z$/.test(start)){ // UTC: shown in this phone's time
    const d = new Date(Date.UTC(+m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8), +m[2], +m[3]));
    date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    startTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const e = /^(\d{8})(?:T(\d{2})(\d{2}))?/.exec((p.DTEND || '').trim());
  let endDate = null, endTime = null;
  if(e){
    endDate = icsKey(e[1]);
    if(!e[2]){ const d = new Date(endDate + 'T00:00:00'); d.setDate(d.getDate() - 1); endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    else if(startTime && !/Z$/.test(p.DTEND)) endTime = `${e[2]}:${e[3]}`;
    if(endDate <= date) endDate = null;
  }
  const rr = {}; (p.RRULE || '').split(';').forEach(kv => { const [k, v] = kv.split('='); if(k) rr[k.toUpperCase()] = v || ''; });
  const n = Math.min(99, Math.max(1, parseInt(rr.INTERVAL, 10) || 1));
  const recurrence = { mode: null, interval: 1, weekdays: [], anchor: null, cal: null };
  if(rr.FREQ === 'DAILY') Object.assign(recurrence, { mode: 'interval', interval: n });
  else if(rr.FREQ === 'WEEKLY') Object.assign(recurrence, { mode: 'weekdays', weekdays: (rr.BYDAY ? rr.BYDAY.split(',').map(d => ICS_DAYS.indexOf(d.replace(/^[-+\d]+/, ''))).filter(i => i >= 0) : [new Date(date + 'T00:00:00').getDay()]) });
  else if(rr.FREQ === 'MONTHLY' || rr.FREQ === 'YEARLY') Object.assign(recurrence, { mode: rr.FREQ === 'MONTHLY' ? 'monthly' : 'yearly', interval: n, anchor: date, cal: 'gregorian' });
  if(recurrence.mode) endDate = null;
  const [kind, sub] = String(p['X-TOOJIBEE-KIND'] || 'event').split('-');
  const id = makeId(), description = icsUnesc(p.DESCRIPTION || '').slice(0, 5000);
  const notification = { type: null };
  const times = { startTime, endTime: startTime ? endTime : null, timeMode: endDate ? 'range' : 'single', date, endDate };
  if(kind === 'habit'){
    out.habits.push({ id, title, recurrence: recurrence.mode ? recurrence : { mode: 'interval', interval: 1, weekdays: [], anchor: null, cal: null }, notification, startDate: date, completedDates: [], skippedDates: [], tracker: null, progress: {} });
  } else if(kind === 'task'){
    out.tasks.push(Object.assign({ id, title, category: '', description, photos: [], pinned: false, done: false, skipped: false, statusByDate: {}, subtasks: [], recurrence, notification }, times));
  } else {
    out.events.push(Object.assign({ id, title, description, kind: sub === 'birthday' || sub === 'countdown' ? sub : '', recurrence, notification }, times));
  }
}

/* A JSON backup → { tasks, habits, events, period } or null when it isn't one. */
function parseBackup(text){
  let d; try{ d = JSON.parse(text); }catch(e){ return null; }
  if(!d || d.app !== 'Toojibee' || d.kind !== 'backup') return null;
  const ok = x => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.title === 'string' && x.title.trim() && !x.groupId;
  const list = k => (Array.isArray(d[k]) ? d[k] : []).filter(ok).map(x => Object.assign({}, x, { title: x.title.slice(0, 300) }));
  return { tasks: list('tasks'), habits: list('habits'), events: list('events'), period: d.period && typeof d.period === 'object' ? d.period : null };
}

/* What importing `incoming` into `have` would add: duplicates (same id, or
   same kind + title + day) are left out. */
function planImport(have, incoming){
  const sig = (k, x) => `${k}|${x.title.trim()}|${k === 'habits' ? x.startDate : x.date}`;
  const plan = { tasks: [], habits: [], events: [], dup: 0 };
  ['tasks', 'habits', 'events'].forEach(k => {
    const ids = new Set((have[k] || []).map(x => x.id)), sigs = new Set((have[k] || []).map(x => sig(k, x)));
    (incoming[k] || []).forEach(x => {
      if(ids.has(x.id) || sigs.has(sig(k, x))){ plan.dup++; return; }
      ids.add(x.id); sigs.add(sig(k, x)); plan[k].push(x);
    });
  });
  return plan;
}

if(typeof module !== 'undefined') module.exports = { buildIcs, parseIcs, parseBackup, planImport };

/* ---- the page (components/menu: sub 'settings-backup') ---- */
let backupPlan = null; // the import waiting for "Import"
let backupWithPeriod = false;

function ownData(){
  const own = x => !x.groupId;
  return { tasks: state.tasks.filter(own), habits: state.habits.filter(own), events: state.events.filter(own) };
}

function saveTextFile(name, text, type){
  if(androidApp){
    // APK 1.4+: the system's Save screen. Older ones can only share text, which is cut at 10,000 characters.
    if(typeof androidApp.saveFile === 'function') androidApp.saveFile(name, type, text);
    else if(text.length < 10000) androidApp.share(name, text);
    else showToast(t('exportNeedsUpdate'));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportIcs(){ saveTextFile(`toojibee-${dateKey(today)}.ics`, buildIcs(ownData()), 'text/calendar'); }
function exportBackup(){
  if(backupWithPeriod && !confirm(t('backupPeriodWarn'))) return;
  const data = Object.assign({ app: 'Toojibee', kind: 'backup', v: 1, exported: new Date().toISOString() }, ownData(), backupWithPeriod ? { period: state.period } : {});
  saveTextFile(`toojibee-backup-${dateKey(today)}.json`, JSON.stringify(data, null, 2), 'application/json');
}

function readImportFile(file){
  if(!file) return;
  if(file.size > 5 * 1024 * 1024){ showToast(t('fileTooLarge')); return; }
  file.text().then(text => {
    const incoming = /\.ics$/i.test(file.name) || /BEGIN:VCALENDAR/.test(text.slice(0, 200)) ? parseIcs(text, uid) : parseBackup(text);
    if(!incoming){ showToast(t('importBadFile')); return; }
    backupPlan = planImport(ownData(), incoming);
    backupPlan.period = incoming.period || null;
    render();
  }).catch(() => showToast(t('importBadFile')));
}

function applyImport(withPeriod){
  const p = backupPlan; if(!p) return;
  [['tasks', Cloud.saveTask], ['habits', Cloud.saveHabit], ['events', Cloud.saveEvent]].forEach(([k, save]) => p[k].forEach(x => {
    state[k].push(x); cloudSync(() => save(x));
  }));
  if(withPeriod && p.period){ state.period = Object.assign({}, state.period, p.period); savePeriodSetup(); }
  const n = p.tasks.length + p.habits.length + p.events.length;
  backupPlan = null;
  render();
  showToast(t('importDone').replace('{n}', dig(n)));
}

function renderBackupPage(){
  const p = backupPlan;
  const preview = p ? `<div class="dt-result">
      <b>${t('importPreview')}</b>
      <div>${t('tasks')}: ${dig(p.tasks.length)} · ${t('habits')}: ${dig(p.habits.length)} · ${t('events')}: ${dig(p.events.length)}</div>
      ${p.dup ? `<div class="sub">${t('importDupes').replace('{n}', dig(p.dup))}</div>` : ''}
      ${p.tasks.concat(p.habits, p.events).slice(0, 5).map(x => `<div class="sub">• ${escapeHtml(x.title)}</div>`).join('')}
      ${p.period ? `<label class="backup-check"><input type="checkbox" id="import-period"> ${t('importPeriod')}</label>` : ''}
      <div class="dt-row" style="margin:10px 0 0;">
        <button type="button" class="btn btn-primary btn-small" data-action="backup-import-apply" ${p.tasks.length + p.habits.length + p.events.length || p.period ? '' : 'disabled'}>${t('importConfirm')}</button>
        <button type="button" class="btn btn-outline btn-small" data-action="backup-import-cancel">${t('cancelRequest')}</button>
      </div></div>` : '';
  return `
    ${subHeader(t('backupTitle'))}
    <div class="section-title">${t('exportTitle')}</div>
    <div class="settings-row"><div><div class="lbl">${t('exportIcs')}</div><div class="sub">${t('exportIcsSub')}</div></div>
      <button type="button" class="btn btn-outline btn-small" data-action="backup-export-ics">${t('exportBtn')}</button></div>
    <div class="settings-row"><div><div class="lbl">${t('exportJson')}</div><div class="sub">${t('exportJsonSub')}</div></div>
      <button type="button" class="btn btn-outline btn-small" data-action="backup-export-json">${t('exportBtn')}</button></div>
    ${state.period && state.period.enabled ? `<label class="backup-check"><input type="checkbox" id="backup-with-period" ${backupWithPeriod ? 'checked' : ''}> ${t('backupWithPeriod')}</label>` : ''}
    <div class="section-title">${t('importTitle')}</div>
    <div class="settings-row"><div><div class="lbl">${t('importFile')}</div><div class="sub">${t('importFileSub')}</div></div>
      <button type="button" class="btn btn-outline btn-small" data-action="backup-import-pick">${t('importBtn')}</button></div>
    <input type="file" id="backup-file" accept=".ics,.json,text/calendar,application/json" hidden>
    ${preview}`;
}

function wireBackupPage(){
  document.getElementById('backup-with-period')?.addEventListener('change', e => { backupWithPeriod = e.target.checked; });
  document.getElementById('backup-file')?.addEventListener('change', e => { readImportFile(e.target.files[0]); e.target.value = ''; });
}
