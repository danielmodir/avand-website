/* ============ INSIDE THE ANDROID APP ============
   The Android app (android/ in the repo) is this same web app in a
   WebView, with a small bridge, window.ToojibeeAndroid. Outside the app
   the bridge doesn't exist and nothing here does anything.
   The bridge gives what a WebView lacks and the app uses:
   - reminders as phone notifications, even with the app closed and
     offline (js/core/notify.js hands it the list of upcoming reminders);
   - navigator.share (the phone's share sheet) and copying to the
     clipboard;
   - the status/navigation bar colors, following the theme
     (applyAppearance in js/core/util.js). */
const androidApp = window.ToojibeeAndroid || null;

if(androidApp){
  if(!navigator.share){
    try{
      Object.defineProperty(navigator, 'share', { configurable: true, value: d => {
        d = d || {};
        androidApp.share(String(d.title || ''), [d.text, d.url].filter(Boolean).join('\n'));
        return Promise.resolve();
      } });
    }catch(e){ /* no share button then */ }
  }
  try{
    const clip = navigator.clipboard || {};
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: Object.assign(Object.create(clip), {
      writeText: text => { androidApp.copy(String(text)); return Promise.resolve(); },
    }) });
  }catch(e){ /* the WebView's own clipboard then */ }
}
