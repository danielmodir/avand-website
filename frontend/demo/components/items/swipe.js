function attachSwipeToDelete(container){
  if(!container) return;
  container.querySelectorAll('.swipe-wrap').forEach(wrap => {
    const fg = wrap.querySelector('.item-card');
    if(!fg) return;
    let startX=null, startY=null, dx=0, dragging=false, decided=false, isHorizontal=false;
    fg.addEventListener('pointerdown', e => {
      startX = e.clientX; startY = e.clientY; dx = 0; dragging = true; decided = false; isHorizontal = false;
      fg.style.transition = 'none';
      /* No stopPropagation() here (unconditional, like before) — that
         swallowed every pointerdown starting on a card, including the
         ones meant for #page-home's own pull-to-expand-calendar gesture
         (initHomeScrollExpand), which listens on the page itself and
         never saw them. Only stop it once a drag is confirmed
         horizontal, below. */
    });
    const bg = wrap.querySelector('.swipe-delete-bg');
    fg.addEventListener('pointermove', e => {
      if(!dragging) return;
      const ddx = e.clientX - startX;
      const ddy = e.clientY - startY;
      if(!decided && (Math.abs(ddx) > 6 || Math.abs(ddy) > 6)){
        decided = true;
        isHorizontal = Math.abs(ddx) > Math.abs(ddy);
      }
      if(!isHorizontal) return;
      e.stopPropagation();
      dx = ddx;
      fg.style.transform = `translateX(${dx}px)`;
      /* Swiping toward screen-left previews "mark done" (green check);
         toward screen-right previews delete (red trash) — only swaps
         once the drag has a real direction, so a tiny jitter at
         pointerdown doesn't flash the wrong one. */
      if(bg && Math.abs(dx) > 4){
        bg.classList.toggle('swipe-bg-done', dx < 0);
        bg.innerHTML = dx < 0 ? ICONS.check : ICONS.trash;
      }
    });
    const end = () => {
      if(!dragging) return;
      dragging = false;
      fg.style.transition = 'transform .22s ease';
      const type = wrap.dataset.swipeType, id = wrap.dataset.swipeId;
      if(isHorizontal && Math.abs(dx) > 60){
        if(dx < 0){
          /* Swipe left: toggle done in place, same as tapping the
             checkbox — the row snaps back, it doesn't disappear. */
          fg.style.transform = 'translateX(0)';
          const cb = wrap.querySelector('.checkbox[data-action]');
          if(cb) applyQuicksetState(cb, !cb.classList.contains('checked'));
        } else {
          /* Swipe right: delete, sliding the rest of the way off. */
          fg.style.transform = 'translateX(100%)';
          fg.style.opacity = '0';
          setTimeout(() => {
            if(type === 'task'){ state.tasks = state.tasks.filter(x=>x.id!==id); cloudSync(() => Cloud.deleteTask(id)); }
            if(type === 'habit'){ state.habits = state.habits.filter(x=>x.id!==id); cloudSync(() => Cloud.deleteHabit(id)); }
            render();
          }, 190);
        }
      } else {
        fg.style.transform = 'translateX(0)';
      }
      if(bg){ bg.classList.remove('swipe-bg-done'); bg.innerHTML = ICONS.trash; }
    };
    fg.addEventListener('pointerup', end);
    fg.addEventListener('pointercancel', end);
  });
  container.querySelectorAll('.events-scroll, .articles-scroll').forEach(el => {
    el.addEventListener('pointerdown', e => e.stopPropagation());
  });
}
