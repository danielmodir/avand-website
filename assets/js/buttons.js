/* Wires the two hero CTAs to window.AVAND_CONFIG (assets/js/config.js).
   Both label variants live on the element as data-attributes so all copy
   stays in the HTML — this script only picks which variant is active. */
(function () {
  var cfg = window.AVAND_CONFIG || { webApp: {}, download: {} };

  document.addEventListener('DOMContentLoaded', function () {
    var webBtn = document.querySelector('[data-cta="webapp"]');
    if (webBtn) {
      var webReady = !!cfg.webApp.ready;
      webBtn.textContent = webReady ? webBtn.dataset.labelReady : webBtn.dataset.labelPreview;
      webBtn.href = webReady ? (cfg.webApp.appUrl || webBtn.dataset.urlPreview) : webBtn.dataset.urlPreview;
    }

    var dlBtn = document.querySelector('[data-cta="download"]');
    if (dlBtn) {
      var dlReady = !!cfg.download.ready;
      if (dlReady) {
        dlBtn.textContent = dlBtn.dataset.labelReady;
        dlBtn.href = dlBtn.dataset.urlReady;
        dlBtn.removeAttribute('aria-disabled');
        dlBtn.classList.remove('btn-disabled');
      } else {
        dlBtn.textContent = dlBtn.dataset.labelComingsoon;
        dlBtn.setAttribute('aria-disabled', 'true');
        dlBtn.classList.add('btn-disabled');
        dlBtn.removeAttribute('href');
      }
    }
  });
})();
