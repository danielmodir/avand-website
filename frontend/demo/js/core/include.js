/* ============ HTML PARTIALS ============ */
/* Static components (banner, toolbar, day sheet, popups...) live in their
   own components/<name>/<name>.html file. Each <div data-include="...">
   placeholder in index.html is swapped for that file's markup before
   app.js wires any event listeners, so the rest of the code can keep
   using getElementById as if the markup were inline. Same-origin fetch,
   no build step. */
async function loadComponents(){
  const slots = [...document.querySelectorAll('[data-include]')];
  const htmls = await Promise.all(slots.map(el =>
    fetch(el.dataset.include).then(r => {
      if(!r.ok) throw new Error('Component failed to load: ' + el.dataset.include);
      return r.text();
    })
  ));
  slots.forEach((el, i) => { el.outerHTML = htmls[i]; });
}
