/* ============ FEATURE FLAGS ============
   One place to switch parts of the app on or off. An unfinished part is
   hidden (no menu row, no button) instead of showing a dead end such as a
   locked card or "coming soon". Flip a value here and redeploy.
   'auto' = shown only when there's something real behind it. */
const FEATURES = {
  store: false,        // Profile → Store: every card in it is locked or "upgrade" (no payments by design)
  articles: 'auto',    // Profile → Articles: only with a backend that serves them (Cloud.articles)
  notices: 'auto',     // Profile → Messages: only once there's an account with messages (noticesAvailable)
  aiConnect: false,    // Profile → Connect to AI: greyed out, last, "coming soon" (owner, 2026-10-26); true = the working page again
  prayer: true,        // prayer times on the Occasions desk, the date widget and adhan reminders (js/core/prayer.js)
  periodMinAge: 0,    // the period desk only from this age (birth date on the account); 0 = no extra limit (sign-up is 9+)
};

/* Old enough for the period desk (FEATURES.periodMinAge; an unknown birth date passes). */
function periodAgeOk(){
  const min = Number(FEATURES.periodMinAge) || 0, dob = state.profile && state.profile.dob;
  if(!min || !dob) return true;
  return dob <= dateYearsAgo(min);
}

function featureOn(name){
  const v = FEATURES[name];
  if(v !== 'auto') return !!v;
  if(name === 'articles') return typeof Cloud !== 'undefined' && typeof Cloud.articles === 'function';
  if(name === 'notices') return typeof noticesAvailable === 'function' && noticesAvailable();
  return false;
}
