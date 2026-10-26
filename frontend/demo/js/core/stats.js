/* ============ ANONYMOUS USAGE COUNTS (opt-in) ============
   Only when the person switched on Settings → "Help improve Toojibee"
   (pref statsOptIn, off by default): an event name goes to our own server
   (backend-php/lib/stats.php), which keeps only how many times each event
   happened per day. No account, device id or content; nothing about the
   period. One-time events are sent once per device (a local flag).
   Events: onboarding_done, first_task, first_habit, return_d1/d7/d30,
   share, invite_accepted. (Widgets placed aren't counted: the phone adds them, not the page.) */
const STATS_ONCE_KEY = 'toojibee-stats-once';
const STATS_FIRST_KEY = 'toojibee-first-use';

function statsOn(){
  return pref('statsOptIn') && typeof TOOJIBEE_CONFIG !== 'undefined' && TOOJIBEE_CONFIG.backend === 'php' && !!TOOJIBEE_CONFIG.apiBase;
}

function trackEvent(event, once){
  if(!statsOn()) return;
  if(once){
    let sent = {};
    try{ sent = JSON.parse(localStorage.getItem(STATS_ONCE_KEY) || '{}'); }catch(e){}
    if(sent[event]) return;
    sent[event] = 1;
    try{ localStorage.setItem(STATS_ONCE_KEY, JSON.stringify(sent)); }catch(e){}
  }
  try{
    fetch(TOOJIBEE_CONFIG.apiBase.replace(/\/$/, '') + '/stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }), keepalive: true, credentials: 'omit',
    }).catch(() => {});
  }catch(e){}
}

/* Coming back 1, 7 and 30 days after this device was first used (each once). */
function trackReturn(){
  let first = null;
  try{ first = localStorage.getItem(STATS_FIRST_KEY); if(!first){ first = dateKey(today); localStorage.setItem(STATS_FIRST_KEY, first); } }catch(e){ return; }
  const days = daysBetween(parseDateKey(first), today);
  if(days >= 30) trackEvent('return_d30', true);
  else if(days >= 7) trackEvent('return_d7', true);
  else if(days >= 1) trackEvent('return_d1', true);
}
