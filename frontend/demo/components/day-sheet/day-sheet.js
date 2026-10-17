function renderDaySheet(){
  const sheet = document.getElementById('day-sheet');
  /* Mobile no longer has a separate Calendar page to peek from — the
     merged widget's own month grid updates state.homeDate directly (see
     'pick-home-day'), so the day-sheet modal is desktop-only now, for
     the standalone #page-calendar column. */
  const show = state.daySheetOpen && window.innerWidth >= 960;
  sheet.classList.toggle('show', show);
  if(!show) return;
  const d = state.daySheetDate;
  const {tasks, habits, events} = itemsForDate(d);
  const title = document.getElementById('day-sheet-title');
  title.textContent = dayLabel(d);
  title.setAttribute('dir', lang() === 'fa' ? 'rtl' : 'ltr');
  sheet.querySelector('[data-action="close-day-sheet"]').setAttribute('aria-label', t('close'));
  // Empty sections are hidden, so a free day said nothing at all.
  document.getElementById('day-sheet-body').innerHTML = (tasks.length || habits.length || events.length)
    ? renderItemSections(tasks, habits, events, d)
    : `<div class="empty-hint">${t('nothingPlanned')}</div>`;
  attachSwipeToDelete(document.getElementById('day-sheet-body'));
}

function attachDaySheetDrag(){
  const sheet = document.getElementById('day-sheet');
  const handle = sheet.querySelector('.sheet-handle');
  const header = sheet.querySelector('.sheet-header');
  [handle, header].forEach(el => {
    if(!el) return;
    let startY = null, dragging = false;
    el.addEventListener('pointerdown', e => {
      if(e.target.closest('[data-action]')) return; // the × button is a click, not a drag
      startY = e.clientY; dragging = true; sheet.style.transition = 'none';
      // Keep getting moves/up after the pointer leaves the small handle,
      // or a mouse drag that ended outside it left the sheet stuck mid-drag.
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
    });
    el.addEventListener('pointermove', e => {
      if(!dragging) return;
      const dy = startY - e.clientY;
      if(dy > 0) sheet.style.transform = `translateY(${-Math.min(dy, 220)}px)`;
    });
    const end = (e) => {
      if(!dragging) return;
      dragging = false;
      sheet.style.transition = 'transform .25s ease';
      const dy = startY - (e.clientY ?? startY);
      sheet.style.transform = '';
      if(dy > 70){
        state.homeDate = new Date(state.daySheetDate);
        state.daySheetOpen = false;
        render();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { dragging = false; sheet.style.transition = 'transform .25s ease'; sheet.style.transform = ''; });
  });
  // Escape closes it, like the sign-in popup.
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && state.daySheetOpen && !state.authOpen){ state.daySheetOpen = false; render(); }
  });
}
