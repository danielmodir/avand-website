/* ============ OLDER ENGINES: aspect-ratio ============
   Phones whose WebView/Chrome hasn't been updated since 2020 (Chrome < 88)
   ignore aspect-ratio, so day cells, the banner and the period wheel lose
   their height. deploy/css-compat.js gives the live CSS bundle fallbacks
   for everything else; aspect-ratio has none in CSS, so here, in those
   engines only, the stylesheets' aspect-ratio rules are read once and the
   matching boxes get a height from their width after every change.
   A rule with aspect-ratio:auto wins for the boxes it matches (as in the
   stylesheets: those boxes set their own height). Current browsers return
   at the first line and never run any of this. */
(function(){
  if(!window.CSS || CSS.supports('aspect-ratio', '1') || !window.fetch) return;
  let rules = [], queued = false;

  function parse(text){
    const out = [];
    // @media blocks: their rules apply only while the query matches.
    const media = /@media([^{]+)\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g;
    const plain = text.replace(media, (m, q, body) => { collect(body, q.trim(), out); return ''; });
    collect(plain, '', out);
    return out;
  }
  function collect(text, query, out){
    const re = /([^{}]+)\{([^{}]*aspect-ratio\s*:\s*([^;}]+)[^{}]*)\}/g;
    let m;
    while((m = re.exec(text))){
      const v = m[3].trim();
      const ratio = v === 'auto' ? 0 : v.split('/').reduce((a, b) => parseFloat(a) / parseFloat(b));
      if(v === 'auto' || ratio > 0) out.push({ selector: m[1].trim(), query, ratio });
    }
  }

  function apply(){
    queued = false;
    const auto = new Set(), sized = new Map();
    rules.forEach(r => {
      if(r.query && !matchMedia(r.query).matches) return;
      let els;
      try{ els = document.querySelectorAll(r.selector); }catch(e){ return; }
      els.forEach(el => { if(r.ratio) sized.set(el, r.ratio); else auto.add(el); });
    });
    sized.forEach((ratio, el) => {
      if(auto.has(el)) { if(el.dataset.arH){ el.style.height = ''; delete el.dataset.arH; } return; }
      const w = el.getBoundingClientRect().width;
      if(!w) return;
      const h = (w / ratio).toFixed(1) + 'px';
      if(el.style.height !== h){ el.style.height = h; el.dataset.arH = '1'; }
    });
  }
  function queue(){ if(!queued){ queued = true; requestAnimationFrame(apply); } }

  window.addEventListener('load', () => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    Promise.all(links.map(l => fetch(l.href).then(r => r.text()).catch(() => '')))
      .then(texts => {
        rules = parse(texts.join('\n').replace(/\/\*[\s\S]*?\*\//g, ''));
        if(!rules.length) return;
        new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        window.addEventListener('resize', queue);
        queue();
      });
  });
})();
