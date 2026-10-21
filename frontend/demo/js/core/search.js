/* ============ SEARCH (the magnifier in the bottom toolbar) ============
   The toolbar turns into a search field (toolbar.css: .toolbar.searching,
   .search-bar.open): magnifier on the left, × on the right. Typing looks
   through the occasions of the coming year (as shown in Occasions
   settings) and the person's own events; matches open upward above the
   bar, soonest first, each with its date. Picking one goes to that day
   on the calendar and the matching desk. */
let searchWired = false, searchTimer = null;
let searchOccCache = { key: '', list: [] };

/* Persian/Arabic letter forms, diacritics and half-spaces don't matter. */
function searchNorm(s){
  return String(s || '').toLowerCase()
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا')
    .replace(/[ً-ْٰ‌‏]/g, '').replace(/\s+/g, ' ').trim();
}

/* Every occasion of the next 366 days, with its date (cached per day). */
function searchOccasions(){
  if(!pref('occasionsEnabled')) return [];
  const key = [dateKey(today), lang(), pref('occasionsJalali'), pref('occasionsHijri'), pref('occasionsGregorian'), pref('occasionsHolidaysOnly')].join('|');
  if(searchOccCache.key === key) return searchOccCache.list;
  const list = [];
  for(let i = 0; i < 366; i++){
    const d = addDays(today, i);
    const items = visibleOccasionsForDate(d);
    if(items === null) return []; // the dataset is still loading: don't cache an empty index
    items.forEach(o => list.push({ kind: 'occasion', title: o.event_name, date: dateKey(d), holiday: !!o.is_holiday, n: searchNorm(o.event_name) }));
  }
  searchOccCache = { key, list };
  return list;
}

/* A repeating event: its next day from today on; else its own date. */
function searchEventDate(e){
  if(!e.recurrence?.mode) return e.date;
  for(let i = 0; i < 400; i++){ const d = addDays(today, i); if(occursOnDate(e, d)) return dateKey(d); }
  return e.date;
}

function searchFind(q){
  const nq = searchNorm(q);
  if(!nq) return [];
  const todayKey = dateKey(today);
  const occ = searchOccasions().filter(o => o.n.includes(nq));
  const evs = (state.events || []).filter(e => searchNorm(e.title).includes(nq))
    .map(e => ({ kind: 'event', title: e.title, date: searchEventDate(e), id: e.id }));
  // Coming days first (soonest on top), then past events (latest first).
  return [...evs, ...occ].sort((a, b) => {
    const fa = a.date >= todayKey, fb = b.date >= todayKey;
    if(fa !== fb) return fa ? -1 : 1;
    return fa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  }).slice(0, 30);
}

function searchWhen(key){
  const n = daysBetween(today, parseDateKey(key));
  if(n === 0) return t('searchToday');
  if(n === 1) return t('searchTomorrow');
  return (n > 0 ? t('searchInDays') : t('searchDaysAgo')).replace('{n}', dig(Math.abs(n)));
}

function renderSearchResults(){
  const box = document.getElementById('search-results');
  const input = document.getElementById('search-input');
  if(!box || !input) return;
  const q = input.value;
  if(!searchNorm(q)){ box.innerHTML = ''; box.classList.remove('show'); return; }
  const results = searchFind(q);
  box.setAttribute('dir', lang() === 'fa' ? 'rtl' : 'ltr');
  box.innerHTML = results.length ? results.map((r, i) => {
    const d = parseDateKey(r.date);
    return `<button type="button" class="search-result ${r.holiday ? 'holiday' : ''}" role="option" data-i="${i}" data-date="${r.date}" data-kind="${r.kind}">
      <span class="search-kind search-kind-${r.kind}" aria-hidden="true"></span>
      <span class="search-result-main">
        <span class="search-result-title">${escapeHtml(r.title)}</span>
        <span class="search-result-meta">${t(r.kind === 'event' ? 'searchEvent' : 'searchOccasion')} · ${weekdayFull(d.getDay())} ${formatDateLabel(r.date)} · ${searchWhen(r.date)}</span>
      </span>
    </button>`;
  }).join('') : `<div class="search-empty">${t('searchNoResults')}</div>`;
  box.classList.add('show');
}

/* The desk that shows this kind of thing: occasions, or planning for events. */
function searchDeskIndex(kind){
  const keys = [];
  if(pref('occasionsEnabled')) keys.push('occasionsDesktop');
  if(state.settings.planningEnabled && !state.guest) keys.push('planning');
  if(periodViews().length) keys.push('periodDesktop');
  const want = kind === 'event' && keys.includes('planning') ? 'planning' : 'occasionsDesktop';
  return Math.max(0, keys.indexOf(want));
}

function goToSearchResult(key, kind){
  const d = parseDateKey(key);
  closeSearch();
  state.homeDate = d; state.selectedDate = d; state.calCursor = new Date(d);
  state.calFull = false; state.deskFull = false; state.menuPanelOpen = false;
  state.activeDesktopIndex = searchDeskIndex(kind);
  haptic(10);
  render();
}

function wireSearch(){
  if(searchWired) return;
  const input = document.getElementById('search-input');
  const box = document.getElementById('search-results');
  if(!input || !box) return;
  searchWired = true;
  input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderSearchResults, 120); });
  input.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ e.preventDefault(); closeSearch(); }
    else if(e.key === 'Enter'){ e.preventDefault(); box.querySelector('.search-result')?.click(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); [...box.querySelectorAll('.search-result')].pop()?.focus(); }
  });
  box.addEventListener('keydown', e => {
    const items = [...box.querySelectorAll('.search-result')], i = items.indexOf(document.activeElement);
    if(e.key === 'ArrowUp' && i > 0){ e.preventDefault(); items[i - 1].focus(); }
    else if(e.key === 'ArrowDown'){ e.preventDefault(); (items[i + 1] || input).focus(); }
    else if(e.key === 'Escape'){ e.preventDefault(); closeSearch(); }
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('.search-result');
    if(b) goToSearchResult(b.dataset.date, b.dataset.kind);
  });
}

function openSearch(){
  wireSearch();
  state.searchOpen = true; state.navExpanded = false;
  const input = document.getElementById('search-input');
  if(input) input.placeholder = t('searchPlaceholder');
  document.querySelector('#search-bar .search-bar-close')?.setAttribute('aria-label', t('closeSearch'));
  syncSearchDom();
  updateNav();
  setTimeout(() => input?.focus(), 60);
  queueBackSync(); // Back closes the search (js/core/back-nav.js)
}

function closeSearch(){
  if(!state.searchOpen) return;
  state.searchOpen = false;
  clearTimeout(searchTimer);
  const input = document.getElementById('search-input');
  if(input){ input.value = ''; input.blur(); }
  renderSearchResults();
  syncSearchDom();
  queueBackSync();
}

function syncSearchDom(){
  const open = !!state.searchOpen;
  document.getElementById('toolbar')?.classList.toggle('searching', open);
  const bar = document.getElementById('search-bar');
  if(bar){ bar.classList.toggle('open', open); bar.setAttribute('aria-hidden', String(!open)); }
  document.getElementById('toolbar-search-btn')?.setAttribute('aria-expanded', String(open));
}
