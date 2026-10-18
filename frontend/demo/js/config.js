/* Deployment settings for the demo.
   apiBase: where the API lives; empty = no backend (the app runs without
   sign-in and keeps data on the device, see js/core/local-store.js).
   backend: 'php'    — backend-php/, the live host (shared cPanel), served
                       at /api/v1 on the same domain;
            'django' — backend/ (a server with Python), e.g. the local
                       dev server, which rewrites this file on the fly.
   Only the live domain has the PHP API; GitHub Pages and the local static
   server stay without one. */
window.TOOJIBEE_CONFIG = (function () {
  var live = /^(www\.)?toojibee\.ir$/.test(location.hostname);
  return live ? { apiBase: '/api/v1', backend: 'php' } : { apiBase: '', backend: 'django' };
})();
