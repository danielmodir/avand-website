/* ============ THEMED DROPDOWNS AND TIME PICKER ============
   The browser's own <select> list and time picker look like the operating
   system, not the app. Every <select class="settings-select"> and every
   <input type="time"> inside #device is quietly swapped (a MutationObserver
   below, so nothing that renders them has to change) for a button that
   opens a menu in the app's theme. The real control stays in the DOM,
   hidden, and receives the value plus its usual change / input event, so
   the code reading it works exactly as before.
   tjMenu() is also used directly, e.g. the period-sharing friend picker. */
let tjMenuEl = null, tjMenuOwner = null;

function closeTjMenu(){
  if(tjMenuEl){ tjMenuEl.remove(); tjMenuEl = null; }
  if(tjMenuOwner){ tjMenuOwner.setAttribute('aria-expanded', 'false'); tjMenuOwner = null; }
}

/* Opens a themed menu next to `anchor` (below it, or above when there's
   no room) with `html` inside, and returns the menu element. */
function tjMenu(anchor, html, cls){
  closeTjMenu();
  const device = document.getElementById('device');
  const m = document.createElement('div');
  m.className = 'tj-menu' + (cls ? ' ' + cls : '');
  m.setAttribute('dir', lang() === 'fa' ? 'rtl' : 'ltr');
  m.innerHTML = html;
  device.appendChild(m);
  tjMenuEl = m; tjMenuOwner = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  tjPlaceMenu();
  m.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  return m;
}

function tjPlaceMenu(){
  const m = tjMenuEl, anchor = tjMenuOwner;
  if(!m || !anchor) return;
  const dev = document.getElementById('device').getBoundingClientRect();
  const r = anchor.getBoundingClientRect();
  m.style.minWidth = Math.max(r.width, 150) + 'px';
  const h = m.offsetHeight, w = m.offsetWidth;
  const below = r.bottom + 6;
  const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, r.top - 6 - h);
  let left = lang() === 'fa' ? r.right - w : r.left;
  left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
  m.style.top = (top - dev.top) + 'px';
  m.style.left = (left - dev.left) + 'px';
}

// Closes on a press outside, Esc, resize, or scrolling the page under it.
document.addEventListener('pointerdown', e => {
  if(tjMenuEl && !tjMenuEl.contains(e.target) && !(tjMenuOwner && tjMenuOwner.contains(e.target))) closeTjMenu();
}, true);
document.addEventListener('keydown', e => {
  if(tjMenuEl && e.key === 'Escape'){ e.stopImmediatePropagation(); closeTjMenu(); }
}, true);
document.addEventListener('scroll', e => { if(tjMenuEl && !tjMenuEl.contains(e.target)) closeTjMenu(); }, true);
window.addEventListener('resize', closeTjMenu);

const TJ_CHEVRON = '<svg class="tj-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/* ---- <select class="settings-select"> ---- */
function enhanceSelect(sel){
  sel.dataset.tjDone = '1';
  sel.classList.add('tj-native-hidden');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tj-select';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if(sel.style.width) btn.style.width = sel.style.width;
  const paint = () => {
    const o = sel.options[sel.selectedIndex];
    btn.innerHTML = `<span class="tj-select-label">${escapeHtml(o ? o.text : '')}</span>${TJ_CHEVRON}`;
    btn.disabled = sel.disabled;
  };
  paint();
  sel.after(btn);
  sel.addEventListener('change', paint);
  btn.addEventListener('click', () => {
    if(tjMenuOwner === btn){ closeTjMenu(); return; }
    const m = tjMenu(btn, `<div role="listbox">${[...sel.options].map((o, i) => `
      <button type="button" class="tj-option ${i === sel.selectedIndex ? 'active' : ''}" role="option" aria-selected="${i === sel.selectedIndex}" data-i="${i}" ${o.disabled ? 'disabled' : ''}>${escapeHtml(o.text)}</button>`).join('')}</div>`);
    m.addEventListener('click', e => {
      const b = e.target.closest('.tj-option');
      if(!b || b.disabled) return;
      closeTjMenu();
      if(sel.selectedIndex === Number(b.dataset.i)) return;
      sel.selectedIndex = Number(b.dataset.i);
      paint();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

/* ---- <input type="time"> ---- hours and minutes (every minute) in two
   columns that loop (after 23 comes 00 again, after 59 comes 00); picking
   updates the input at once, the menu stays open until "Done" or a press
   outside.
   A reminder's input with data-base="<date key>" data-span="N" works on
   real moments instead: the hours run from now (never earlier) on through
   midnight into the next N days, each day labelled, and the picked day
   lands in data-date (the popup turns that into the reminder's day). */
const tjTwo = n => String(n).padStart(2, '0');
function tjDayLabel(key){
  const now = new Date();
  if(key === dateKey(now)) return t('searchToday');
  if(key === dateKey(addDays(now, 1))) return t('searchTomorrow');
  return formatDateLabel(key);
}
const tjAt = (key, hm) => new Date(key + 'T' + hm + ':00').getTime();

function enhanceTime(inp){
  inp.dataset.tjDone = '1';
  inp.classList.add('tj-native-hidden');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tj-time';
  btn.dir = 'ltr';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  const span = () => inp.dataset.base ? Math.max(0, Number(inp.dataset.span) || 0) : -1;
  // The days a reminder can be on: from the item's day (or today, if that's
  // gone) for span more days.
  const spanDays = () => {
    const todayKey = dateKey(new Date());
    const first = inp.dataset.base > todayKey ? inp.dataset.base : todayKey;
    return Array.from({ length: span() + 1 }, (_, i) => dateKey(addDays(parseDateKey(first), i)));
  };
  // A reminder time that has already passed moves to the next minute.
  const clampSpan = () => {
    if(span() < 0) return;
    const days = spanDays();
    if(!days.includes(inp.dataset.date)) inp.dataset.date = days[0];
    if(!inp.value || tjAt(inp.dataset.date, inp.value) <= Date.now()){
      const next = new Date(Date.now() + 60000);
      inp.dataset.date = dateKey(next);
      inp.value = tjTwo(next.getHours()) + ':' + tjTwo(next.getMinutes());
    }
  };
  const paint = () => {
    const day = span() >= 0 && inp.dataset.date && inp.dataset.date !== inp.dataset.base ? ` · ${tjDayLabel(inp.dataset.date)}` : '';
    btn.innerHTML = `${ICONS.clockIcon || ''}<span>${inp.value ? dig(inp.value) + day : '--:--'}</span>`;
    btn.classList.toggle('empty', !inp.value);
    btn.disabled = inp.disabled;
  };
  paint();
  inp.after(btn);
  // A reminder time that already passed: moved on, and the form told so
  // (its listeners are wired by now: this runs from the MutationObserver).
  if(span() >= 0){
    const before = inp.value + inp.dataset.date;
    clampSpan(); paint();
    if(inp.value + inp.dataset.date !== before) inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const set = (v, day) => {
    inp.value = v;
    if(day) inp.dataset.date = day;
    clampSpan();
    paint();
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const opt = (v, active, extra = '', off = false) =>
    `<button type="button" class="tj-option ${active ? 'active' : ''}" data-v="${v}" ${extra} ${off ? 'disabled' : ''}>${dig(v)}</button>`;
  // Three copies of a looping column: scrolling past either end jumps a copy.
  const loopCol = (count, cur, kind, off = () => false) => {
    const one = Array.from({ length: count }, (_, i) => opt(tjTwo(i), tjTwo(i) === cur, '', off(i))).join('');
    return `<div class="tj-time-col" data-kind="${kind}" data-loop="1">${one}${one}${one}</div>`;
  };
  const menuHtml = () => {
    const [h, m] = (inp.value || '').split(':');
    let hours, minutes;
    if(span() >= 0){
      const now = Date.now(), cur = inp.dataset.date;
      hours = `<div class="tj-time-col" data-kind="h">${spanDays().map(key => {
        const hs = Array.from({ length: 24 }, (_, i) => i).filter(i => tjAt(key, tjTwo(i) + ':59') > now);
        return hs.length ? `<div class="tj-time-day">${escapeHtml(tjDayLabel(key))}</div>`
          + hs.map(i => opt(tjTwo(i), key === cur && tjTwo(i) === h, `data-d="${key}"`)).join('') : '';
      }).join('')}</div>`;
      minutes = loopCol(60, m, 'm', i => tjAt(cur, h + ':' + tjTwo(i)) <= now);
    } else {
      hours = loopCol(24, h, 'h');
      minutes = loopCol(60, m, 'm');
    }
    return `<div class="tj-time-head" dir="ltr"><span>${t('hourLabel')}</span><span>${t('minuteLabel')}</span></div>
      <div class="tj-time-cols" dir="ltr">${hours}${minutes}</div>
      <div class="tj-time-foot">
        ${span() >= 0 ? '' : `<button type="button" class="tj-time-clear" data-act="clear">${t('clearTime')}</button>`}
        <button type="button" class="tj-time-done" data-act="done">${t('dpDone')}</button>
      </div>`;
  };
  const wireLoops = m => m.querySelectorAll('.tj-time-col[data-loop]').forEach(col => col.addEventListener('scroll', () => {
    const third = col.scrollHeight / 3;
    if(col.scrollTop < third * 0.5) col.scrollTop += third;
    else if(col.scrollTop > third * 1.5) col.scrollTop -= third;
  }, { passive: true }));
  // Redraws the menu in place (minutes that passed depend on the hour),
  // keeping each column where it was scrolled.
  const draw = (m, center) => {
    const keep = {};
    m.querySelectorAll('.tj-time-col').forEach(c => { keep[c.dataset.kind] = c.scrollTop; });
    m.innerHTML = menuHtml();
    wireLoops(m);
    m.querySelectorAll('.tj-time-col').forEach(c => {
      if(!center && keep[c.dataset.kind] != null){ c.scrollTop = keep[c.dataset.kind]; return; }
      const actives = c.querySelectorAll('.active');
      const a = actives[c.dataset.loop ? 1 : 0] || c.querySelector('.tj-option:not([disabled])');
      if(a) c.scrollTop = a.offsetTop - c.offsetTop - (c.clientHeight - a.offsetHeight) / 2;
      else if(c.dataset.loop) c.scrollTop = c.scrollHeight / 3;
    });
  };
  btn.addEventListener('click', () => {
    if(tjMenuOwner === btn){ closeTjMenu(); return; }
    clampSpan(); paint();
    const m = tjMenu(btn, '', 'tj-time-menu');
    draw(m, true);
    tjPlaceMenu();
    m.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if(act === 'done'){ closeTjMenu(); return; }
      if(act === 'clear'){ set(''); closeTjMenu(); return; }
      const b = e.target.closest('.tj-option');
      if(!b || b.disabled) return;
      const [h, mm] = (inp.value || '').split(':');
      const kind = b.closest('.tj-time-col').dataset.kind;
      set(kind === 'h' ? `${b.dataset.v}:${mm || '00'}` : `${h || '09'}:${b.dataset.v}`, b.dataset.d);
      draw(m, false);
    });
  });
}

function enhanceControls(root){
  if(!root) return;
  root.querySelectorAll('select.settings-select:not([data-tj-done])').forEach(enhanceSelect);
  root.querySelectorAll('input[type="time"]:not([data-tj-done])').forEach(enhanceTime);
}

// Runs before the browser paints, so the native control never flashes.
new MutationObserver(() => enhanceControls(document.getElementById('device')))
  .observe(document.getElementById('device'), { childList: true, subtree: true });
