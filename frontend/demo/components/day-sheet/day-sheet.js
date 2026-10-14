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
  document.getElementById('day-sheet-title').textContent = dayLabel(d);
  document.getElementById('day-sheet-body').innerHTML = renderItemSections(tasks, habits, events, d);
  attachSwipeToDelete(document.getElementById('day-sheet-body'));
}

function attachDaySheetDrag(){
  const sheet = document.getElementById('day-sheet');
  const handle = sheet.querySelector('.sheet-handle');
  const header = sheet.querySelector('.sheet-header');
  [handle, header].forEach(el => {
    if(!el) return;
    let startY = null, dragging = false;
    el.addEventListener('pointerdown', e => { startY = e.clientY; dragging = true; sheet.style.transition = 'none'; });
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
}
