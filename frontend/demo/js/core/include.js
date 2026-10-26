/* ============ HTML PARTIALS ============ */
/* Static components (banner, toolbar, day sheet, popups...) live in their
   own components/<name>/<name>.html file. Each <div data-include="...">
   placeholder in index.html is swapped for that file's markup before
   app.js wires any event listeners, so the rest of the code can keep
   using getElementById as if the markup were inline. Same-origin fetch,
   no build step. */
/* Same version as the ?v= on every <link>/<script> in index.html: GitHub
   Pages lets browsers cache files for 10 minutes, so after a deploy a
   phone kept the old CSS/JS. Bump both (one find-and-replace) on every
   frontend change to /demo/. */
const ASSET_VERSION = '2026-10-27.8';

async function loadComponents(){
  const slots = [...document.querySelectorAll('[data-include]')];
  const htmls = await Promise.all(slots.map(el =>
    fetch(el.dataset.include + '?v=' + ASSET_VERSION).then(r => {
      if(!r.ok) throw new Error('Component failed to load: ' + el.dataset.include);
      return r.text();
    })
  ));
  slots.forEach((el, i) => { el.outerHTML = htmls[i]; });
}
