/* ============ FEATURE FLAGS ============
   One place to switch parts of the app on or off. An unfinished part is
   hidden (no menu row, no button) instead of showing a dead end such as a
   locked card or "coming soon". Flip a value here and redeploy.
   'auto' = shown only when there's something real behind it. */
const FEATURES = {
  store: false,        // Profile → Store: every card in it is locked or "upgrade" (no payments by design)
  articles: 'auto',    // Profile → Articles: only with a backend that serves them (Cloud.articles)
  notices: 'auto',     // Profile → Messages: only once there's an account with messages (noticesAvailable)
};

function featureOn(name){
  const v = FEATURES[name];
  if(v !== 'auto') return !!v;
  if(name === 'articles') return typeof Cloud !== 'undefined' && typeof Cloud.articles === 'function';
  if(name === 'notices') return typeof noticesAvailable === 'function' && noticesAvailable();
  return false;
}
