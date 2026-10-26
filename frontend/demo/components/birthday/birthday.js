/* ============ BIRTHDAY GREETING ============
   On the person's birthday a themed card with a little confetti, once a
   year on this device. The day is counted in the calendar they use as
   their main one: the Solar Hijri date for Persian calendars (how
   birthdays are kept in Iran), else the Gregorian one. 30 Esfand (or 29
   February) falls back to the year's last day of that month when the year
   doesn't have it. Needs only the birth date already in the profile. */
const BDAY_KEY = 'toojibee-birthday-shown';

function isBirthdayToday(dob){ return isBirthdayOn(dob, new Date()); }

/* Also used by the calendars: the person's own birthday is bold with a
   little cake (birthdayMarkHtml below). */
function isBirthdayOn(dob, day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return false;
  const [by, bm, bd] = dob.split('-').map(Number);
  const now = new Date(day);
  if(now < new Date(by, bm - 1, bd)) return false; // not born yet
  if(typeof isJalali === 'function' && isJalali()){
    const b = toJalali(by, bm, bd), t2 = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    if(b.jm !== t2.jm) return false;
    if(b.jd === t2.jd) return true;
    // Born on 30 Esfand: the 29th in a year without a 30th.
    if(b.jm === 12 && b.jd === 30 && t2.jd === 29){
      const next = toJalali(...(() => { const d = new Date(now); d.setDate(d.getDate() + 1); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; })());
      return next.jm === 1;
    }
    return false;
  }
  if(bm !== now.getMonth() + 1) return false;
  if(bd === now.getDate()) return true;
  return bm === 2 && bd === 29 && now.getDate() === 28 && new Date(now.getFullYear(), 1, 29).getMonth() !== 1;
}

/* Memoized per render: the calendars ask for every visible day. */
let bdayMemo = { dob: null, map: {} };
function isOwnBirthday(day){
  const dob = !state.guest && state.profile ? state.profile.dob : '';
  if(!dob) return false;
  if(bdayMemo.dob !== dob + '|' + (typeof isJalali === 'function' && isJalali())) bdayMemo = { dob: dob + '|' + (typeof isJalali === 'function' && isJalali()), map: {} };
  const k = dateKey(day);
  if(!(k in bdayMemo.map)) bdayMemo.map[k] = isBirthdayOn(dob, day);
  return bdayMemo.map[k];
}
const BDAY_CAKE_SVG = '<svg class="bday-cake" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c.9 1 1.4 1.9 1.4 2.6a1.4 1.4 0 0 1-2.8 0C10.6 3.9 11.1 3 12 2zm-.8 4.6h1.6V9h-1.6zM5 10h14a2 2 0 0 1 2 2v2.2c-.9.6-1.6.6-2.5 0-1.1-.8-2.4-.8-3.5 0-.9.6-1.6.6-2.5 0-1.1-.8-2.4-.8-3.5 0-.9.6-1.6.6-2.5 0-.6-.4-1.2-.6-1.5-.6V12a2 2 0 0 1 2-2zm-2 6.5c.3 0 .6.1 1 .4 1.4 1 3 1 4.5 0 .6-.4 1.4-.4 2 0 1.4 1 3 1 4.5 0 .6-.4 1.4-.4 2 0 .9.6 1.9.8 3 .5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
/* A birthday event (its kind, or «تولد» in its title) also gets the cake on its day. */
function isBirthdayEvent(e){ return e.kind === 'birthday' || /تولد|birthday/i.test(e.title || ''); }
function birthdayMarkHtml(day){ return isOwnBirthday(day) || state.events.some(e => isBirthdayEvent(e) && occursOnDate(e, day)) ? BDAY_CAKE_SVG : ''; }
/* The small icon before an event's title: a cake for a birthday, a book for a class. */
function eventIconHtml(e){
  if(isBirthdayEvent(e)) return `<span class="event-icon" aria-hidden="true">${BDAY_CAKE_SVG}</span>`;
  if(/کلاس|class/i.test(e.title || '')) return `<span class="event-icon" aria-hidden="true">${ICONS.book}</span>`;
  return '';
}

function birthdayAge(dob){
  const [by] = dob.split('-').map(Number);
  const now = new Date();
  if(typeof isJalali === 'function' && isJalali()){
    const [y, m, d] = dob.split('-').map(Number);
    return toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()).jy - toJalali(y, m, d).jy;
  }
  return now.getFullYear() - by;
}

function maybeShowBirthday(){
  const dob = state.profile && state.profile.dob;
  if(state.guest || !isBirthdayToday(dob)) return;
  const stamp = dateKey(today).slice(0, 4) + '|' + (state.profile.userId || '');
  try{ if(localStorage.getItem(BDAY_KEY) === stamp) return; localStorage.setItem(BDAY_KEY, stamp); }catch(e){ /* no storage: may show again */ }
  showBirthdayCard();
}

function showBirthdayCard(){
  document.getElementById('bday-overlay')?.remove();
  const name = state.profile.username || state.profile.name || '';
  const age = birthdayAge(state.profile.dob);
  const el = document.createElement('div');
  el.id = 'bday-overlay';
  el.className = 'bday-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t('bdayTitle'));
  const pieces = Array.from({ length: 36 }, (_, i) =>
    `<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * 0.18}s;--r:${(i * 53) % 360}deg;--c:${i % 3}"></i>`).join('');
  el.innerHTML = `
    <div class="bday-confetti" aria-hidden="true">${pieces}</div>
    <div class="bday-card" dir="${lang() === 'fa' ? 'rtl' : 'ltr'}">
      <div class="bday-cake" aria-hidden="true">🎂</div>
      <div class="bday-title">${escapeHtml(t('bdayTitle'))}${name ? `، <span dir="auto">${escapeHtml(name)}</span>` : ''}!</div>
      <div class="bday-text">${escapeHtml(t('bdayText').replace('{age}', age > 0 && age < 130 ? dig(age) : ''))}</div>
      <button type="button" class="btn btn-primary bday-btn">${t('bdayThanks')}</button>
    </div>`;
  document.getElementById('device').appendChild(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  el.querySelector('.bday-btn').addEventListener('click', close);
  el.addEventListener('click', e => { if(e.target === el) close(); });
}
