/* ============ SHARE CARDS ============
   A square picture (1080 px) for a habit's streak, the day's summary, a
   countdown or birthday, and the day's occasions: the app's own colours
   (palette and day/night from the CSS variables), its font, the brand mark
   and the site's address. Shared as an image through the share sheet: the
   browser's (Web Share with files), the Android app's bridge (shareImage,
   APK 1.4+), else saved as a .png. */

/* Days in a row the habit was done (today counts once it's ticked). */
function habitStreak(h){
  let s = 0;
  for(let k = 0; k < 400; k++){
    const day = addDays(today, -k);
    if(dateKey(day) < h.startDate) break;
    if(!habitOccursOnDate(h, day)) continue;
    if(h.completedDates.includes(dateKey(day))) s++;
    else if(k > 0) break;
  }
  return s;
}

/* What goes on the card: { big, title, lines }. */
function shareCardContent(kind, id){
  if(kind === 'habit'){
    const h = state.habits.find(x => x.id === id); if(!h) return null;
    const n = habitStreak(h);
    return { big: dig(n), title: h.title, lines: [t('cardStreak').replace('{n}', dig(n))] };
  }
  if(kind === 'event'){
    const e = state.events.find(x => x.id === id); if(!e) return null;
    const n = eventDaysLeft(e);
    return { big: n == null ? '🎉' : n === 0 ? '🎉' : dig(n), title: e.title, lines: [n == null || n === 0 ? t('today') : t('daysLeft').replace('{n}', dig(n)), formatDateLabel(e.kind === 'birthday' ? dateKey(addDays(today, n || 0)) : e.date)] };
  }
  if(kind === 'day'){
    const d = state.homeDate || today, occ = (visibleOccasionsForDate(d) || []).map(o => o.event_name).slice(0, 3);
    return { big: displayDayNum(d), title: dayLabel(d), lines: [dayAllCalendarsLine(d)].concat(occ) };
  }
  if(kind === 'summary'){
    const k = dateKey(today), it = itemsForDate(today);
    const tasks = it.tasks.filter(x => taskStatusOn(x, k) === 'done').length, habits = it.habits.filter(h => h.completedDates.includes(k)).length;
    return { big: dig(tasks + habits), title: t('cardMyDay'), lines: [t('cardDone').replace('{t}', dig(tasks)).replace('{h}', dig(habits)), dayLabel(today)] };
  }
  return null;
}

let brandMark = null;
function loadBrandMark(){
  if(brandMark) return brandMark;
  brandMark = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = '../assets/icons/icon-192.png?v=tj5'; }); // the round icon: the mark on its circle
  return brandMark;
}

async function drawShareCard(c){
  const S = 1080, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue(n).trim();
  const font = (w, px) => `${w} ${px}px "Baloo Bhaijaan 2", Tahoma, sans-serif`;
  try{ await document.fonts.load(font(800, 100)); await document.fonts.load(font(500, 40)); }catch(e){}
  const fa = lang() === 'fa';
  g.direction = fa ? 'rtl' : 'ltr'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = v('--bg') || '#1A1708'; g.fillRect(0, 0, S, S);
  // The card, rounded, with a band of the primary colour at the top.
  const r = 56, x = 70, y = 70, w = S - 140, h = S - 140;
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  g.fillStyle = v('--card') || '#2E2910'; g.fill();
  g.save(); g.clip(); g.fillStyle = v('--primary') || '#EB7D00'; g.fillRect(x, y, w, 18); g.restore();
  const mark = await loadBrandMark();
  if(mark) g.drawImage(mark, S / 2 - 60, 140, 120, 120);
  g.fillStyle = v('--text-muted') || '#999'; g.font = font(600, 36); g.fillText(t('appName'), S / 2, 300);
  g.fillStyle = v('--primary-text') || v('--primary'); g.font = font(800, String(c.big).length > 6 ? 120 : 220); g.fillText(c.big, S / 2, 480);
  g.fillStyle = v('--text') || '#fff'; g.font = font(800, 64);
  const fit = (s, px) => { let txt = String(s || ''); g.font = font(px === 64 ? 800 : 500, px); while(txt.length > 3 && g.measureText(txt).width > w - 100) txt = txt.slice(0, -2) + '…'; return txt; };
  g.fillText(fit(c.title, 64), S / 2, 660);
  g.fillStyle = v('--text-muted') || '#aaa';
  (c.lines || []).slice(0, 3).forEach((l, i) => g.fillText(fit(l, 40), S / 2, 750 + i * 58));
  g.fillStyle = v('--primary-text') || v('--primary'); g.font = font(700, 38); g.direction = 'ltr'; g.fillText('toojibee.ir', S / 2, y + h - 60);
  return cv;
}

async function shareCard(kind, id){
  const c = shareCardContent(kind, id);
  if(!c) return;
  const cv = await drawShareCard(c);
  const name = `toojibee-${kind}.png`;
  trackEvent('share'); // opt-in anonymous count (js/core/stats.js)
  if(androidApp && typeof androidApp.shareImage === 'function'){ androidApp.shareImage(name, cv.toDataURL('image/png').split(',')[1]); return; }
  cv.toBlob(blob => {
    if(!blob) return;
    const file = new File([blob], name, { type: 'image/png' });
    if(navigator.canShare && navigator.canShare({ files: [file] })){ navigator.share({ files: [file], text: 'https://toojibee.ir/' }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

function shareCardBtn(kind, id, label){
  return `<button type="button" class="btn btn-outline btn-small share-card-btn" data-action="share-card" data-kind="${kind}" data-id="${escapeAttr(id || '')}">${ICONS.shareIcon}<span>${t(label || 'cardShare')}</span></button>`;
}
