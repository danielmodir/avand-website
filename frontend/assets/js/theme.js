/* Wires the header theme toggle. The initial theme (to avoid a flash of
   the wrong theme) is already set by a small inline script in <head> —
   this file only handles the click and persistence after that.
   The switch is one movement: the new theme opens as a circle from the
   button (View Transitions API), or one short fade of the whole page where
   that isn't supported; instant with "reduce motion". Same as the app's
   switchThemeAnimated (demo/js/core/util.js). */
(function () {
  function animate(x, y, apply) {
    var root = document.documentElement;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var run = function () { root.classList.add('theme-switching'); apply(); };
    var done = function () { setTimeout(function () { root.classList.remove('theme-switching'); }, 30); };
    if (reduce) { run(); done(); return; }
    if (document.startViewTransition) {
      var vt = document.startViewTransition(run);
      vt.ready.then(function () {
        var r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(function () {});
      vt.finished.then(done, done);
      return;
    }
    var veil = document.createElement('div');
    veil.className = 'theme-veil';
    veil.style.background = getComputedStyle(document.body).backgroundColor;
    document.body.appendChild(veil);
    run();
    requestAnimationFrame(function () { requestAnimationFrame(function () { veil.classList.add('out'); }); });
    setTimeout(function () { veil.remove(); done(); }, 480);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('[data-action="toggle-theme"]');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      var root = document.documentElement;
      var current = root.getAttribute('data-theme');
      if (!current) {
        current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      var next = current === 'dark' ? 'light' : 'dark';
      var r = btn.getBoundingClientRect();
      animate(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2, function () {
        root.setAttribute('data-theme', next);
      });
      try { localStorage.setItem('toojibee-theme', next); } catch (err) { /* private mode, ignore */ }
      btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
    });
  });
})();
