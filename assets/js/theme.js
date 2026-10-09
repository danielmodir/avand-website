/* Wires the header theme toggle. The initial theme (to avoid a flash of
   the wrong theme) is already set by a small inline script in <head> —
   this file only handles the click and persistence after that. */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('[data-action="toggle-theme"]');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var root = document.documentElement;
      var current = root.getAttribute('data-theme');
      if (!current) {
        current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('toojibee-theme', next); } catch (e) { /* private mode, ignore */ }
      btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
    });
  });
})();
