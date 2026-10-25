/* Wires the two hero CTAs to window.AVAND_CONFIG (assets/js/config.js).
   Both label variants live on the element as data-attributes so all copy
   stays in the HTML — this script only picks which variant is active. */
(function () {
  var cfg = window.AVAND_CONFIG || { webApp: {}, download: {} };

  /* Signed in to the web app (it leaves a small note in this origin's
     localStorage, see updateNav() in demo/components/menu/menu.js): the
     header's "Log in" becomes the avatar, and links into the app skip the
     sign-in screen. Signed out, [data-app-link] links open sign-in. No
     request is made either way. */
  function signedInNote() {
    try {
      var me = JSON.parse(localStorage.getItem('toojibee-me') || 'null');
      // The sign-in lives in sessionStorage in a browser (ends with the tab).
      return me && (sessionStorage.getItem('toojibee_session') || localStorage.getItem('toojibee_session')) ? me : null;
    } catch (e) { return null; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var me = signedInNote();
    var login = document.querySelector('.header-login');
    if (login && me) {
      var a = document.createElement('a');
      a.className = 'header-profile';
      a.href = login.dataset.appUrl || login.getAttribute('href').replace(/#.*$/, '');
      a.setAttribute('aria-label', login.dataset.labelProfile || 'Profile');
      a.title = me.n || a.getAttribute('aria-label');
      if (me.p && /^(data:image\/|\/|https:\/\/toojibee\.ir\/)/.test(me.p)) a.style.backgroundImage = 'url("' + me.p.replace(/"/g, '') + '")';
      else a.textContent = me.i || '';
      login.replaceWith(a);
    }
    var links = document.querySelectorAll('[data-app-link]');
    for (var i = 0; i < links.length; i++) {
      links[i].href = links[i].getAttribute('href').replace(/#.*$/, '') + (me ? '' : '#login');
    }

    var webBtn = document.querySelector('[data-cta="webapp"]');
    if (webBtn) {
      var webLabel = webBtn.querySelector('.btn-label');
      var webReady = !!cfg.webApp.ready;
      var webText = webReady ? webBtn.dataset.labelReady : webBtn.dataset.labelPreview;
      if (webLabel) { webLabel.textContent = webText; } else { webBtn.textContent = webText; }
      webBtn.href = webReady ? (cfg.webApp.appUrl || webBtn.dataset.urlPreview) : webBtn.dataset.urlPreview;
    }

    var dlBtn = document.querySelector('[data-cta="download"]');
    if (dlBtn) {
      var dlLabel = dlBtn.querySelector('.btn-label');
      var dlReady = !!cfg.download.ready;
      var setDlText = function (text) {
        if (dlLabel) { dlLabel.textContent = text; } else { dlBtn.textContent = text; }
      };
      if (dlReady) {
        setDlText(dlBtn.dataset.labelReady);
        dlBtn.href = dlBtn.dataset.urlReady;
        dlBtn.removeAttribute('aria-disabled');
        dlBtn.classList.remove('btn-disabled');
      } else {
        setDlText(dlBtn.dataset.labelComingsoon);
        dlBtn.setAttribute('aria-disabled', 'true');
        dlBtn.classList.add('btn-disabled');
        dlBtn.removeAttribute('href');
      }
    }
  });
})();
