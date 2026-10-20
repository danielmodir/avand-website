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

/* ---- <input type="time"> ---- hours and minutes (5-minute steps, plus
   the current value's minute) in two columns; picking updates the input
   at once, the menu stays open until "Done" or a press outside. */
function enhanceTime(inp){
  inp.dataset.tjDone = '1';
  inp.classList.add('tj-native-hidden');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tj-time';
  btn.dir = 'ltr';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  const paint = () => {
    btn.innerHTML = `${ICONS.clockIcon || ''}<span>${inp.value ? dig(inp.value) : '--:--'}</span>`;
    btn.classList.toggle('empty', !inp.value);
    btn.disabled = inp.disabled;
  };
  paint();
  inp.after(btn);
  const set = v => {
    inp.value = v;
    paint();
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const menuHtml = () => {
    const [h, m] = (inp.value || '').split(':');
    const mins = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
    if(m && !mins.includes(m)) { mins.push(m); mins.sort(); }
    const col = (items, cur, kind) => `<div class="tj-time-col" data-kind="${kind}">${items.map(v =>
      `<button type="button" class="tj-option ${v === cur ? 'active' : ''}" data-v="${v}">${dig(v)}</button>`).join('')}</div>`;
    return `<div class="tj-time-head" dir="ltr"><span>${t('hourLabel')}</span><span>${t('minuteLabel')}</span></div>
      <div class="tj-time-cols" dir="ltr">${col(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), h, 'h')}${col(mins, m, 'm')}</div>
      <div class="tj-time-foot">
        <button type="button" class="tj-time-clear" data-act="clear">${t('clearTime')}</button>
        <button type="button" class="tj-time-done" data-act="done">${t('dpDone')}</button>
      </div>`;
  };
  btn.addEventListener('click', () => {
    if(tjMenuOwner === btn){ closeTjMenu(); return; }
    const m = tjMenu(btn, menuHtml(), 'tj-time-menu');
    m.querySelectorAll('.tj-time-col .active').forEach(a => a.scrollIntoView({ block: 'center' }));
    m.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if(act === 'done'){ closeTjMenu(); return; }
      if(act === 'clear'){ set(''); closeTjMenu(); return; }
      const b = e.target.closest('.tj-option');
      if(!b) return;
      const [h, mm] = (inp.value || '').split(':');
      const kind = b.closest('.tj-time-col').dataset.kind;
      set(kind === 'h' ? `${b.dataset.v}:${mm || '00'}` : `${h || '09'}:${b.dataset.v}`);
      const [nh, nm] = inp.value.split(':');
      m.querySelectorAll('.tj-time-col[data-kind="h"] .tj-option').forEach(o => o.classList.toggle('active', o.dataset.v === nh));
      m.querySelectorAll('.tj-time-col[data-kind="m"] .tj-option').forEach(o => o.classList.toggle('active', o.dataset.v === nm));
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
