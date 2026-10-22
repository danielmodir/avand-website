/* ============ BIRTHDAY GREETING ============
   On the person's birthday a themed card with a little confetti, once a
   year on this device. The day is counted in the calendar they use as
   their main one: the Solar Hijri date for Persian calendars (how
   birthdays are kept in Iran), else the Gregorian one. 30 Esfand (or 29
   February) falls back to the year's last day of that month when the year
   doesn't have it. Needs only the birth date already in the profile. */
const BDAY_KEY = 'toojibee-birthday-shown';

function isBirthdayToday(dob){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return false;
  const [by, bm, bd] = dob.split('-').map(Number);
  const now = new Date();
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
