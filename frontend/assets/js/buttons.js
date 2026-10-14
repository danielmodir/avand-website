/* Wires the two hero CTAs to window.AVAND_CONFIG (assets/js/config.js).
   Both label variants live on the element as data-attributes so all copy
   stays in the HTML — this script only picks which variant is active. */
(function () {
  var cfg = window.AVAND_CONFIG || { webApp: {}, download: {} };

  document.addEventListener('DOMContentLoaded', function () {
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
