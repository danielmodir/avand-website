/* ============ ARTICLES (Profile → مقاله‌ها) ============
   Every published article of the app's language (admin panel → articles),
   filtered by topic and sorted (newest, oldest, title). An article opens
   on the site (/fa/articles/<slug>/) in a new tab, so the app stays where
   it was. The desks show none any more, except the period desk's own. */
const ARTICLE_CATS = ['planning', 'habits', 'calendar', 'health', 'other'];
const articlesView = { cat: 'all', sort: 'new' };
let articlesList = null, articlesLang = '', articlesLoading = false;

function articlesAvailable(){ return !REAL_LOGIN_DISABLED && !!Cloud.articles; }

function loadArticles(){
  if(!articlesAvailable() || articlesLoading) return;
  articlesLoading = true;
  const l = lang();
  Cloud.articles(l).then(list => { articlesList = list || []; articlesLang = l; })
    .catch(() => { articlesList = []; articlesLang = l; })
    .finally(() => { articlesLoading = false; if(state.menuSubView === 'articles') render(); });
}

function renderArticlesPage(){
  if(!articlesAvailable()) return `${subHeader(t('articles'))}<div class="empty-hint">${t('articlesOffline')}</div>`;
  if(articlesList === null || articlesLang !== lang()) loadArticles();
  const all = articlesList || [];
  const present = ARTICLE_CATS.filter(c => all.some(a => (a.category || 'other') === c));
  const chips = ['all'].concat(present).map(c => {
    const n = c === 'all' ? all.length : all.filter(a => (a.category || 'other') === c).length;
    return `<button type="button" class="art-chip ${articlesView.cat === c ? 'on' : ''}" data-action="articles-cat" data-val="${c}">${t(c === 'all' ? 'artCatAll' : 'artCat_' + c)} <span>${dig(n)}</span></button>`;
  }).join('');
  let list = all.filter(a => articlesView.cat === 'all' || (a.category || 'other') === articlesView.cat);
  const by = { new: (a, b) => String(b.published_at).localeCompare(String(a.published_at)),
               old: (a, b) => String(a.published_at).localeCompare(String(b.published_at)),
               title: (a, b) => a.title.localeCompare(b.title, lang()) };
  list = list.slice().sort(by[articlesView.sort] || by.new);
  const cards = list.map(a => `
    <a class="art-card" href="${escapeAttr(a.url)}" target="_blank" rel="noopener">
      ${a.cover ? `<img class="art-cover" src="${escapeAttr(a.cover)}" alt="" loading="lazy" width="1600" height="900">` : ''}
      <span class="art-body">
        <span class="art-meta"><span class="art-tag">${t('artCat_' + (a.category || 'other'))}</span>${a.published_at ? `<span>${formatDateLabel(String(a.published_at).slice(0, 10))}</span>` : ''}</span>
        <span class="art-title">${escapeHtml(a.title)}</span>
        ${a.summary ? `<span class="art-summary">${escapeHtml(a.summary)}</span>` : ''}
      </span>
    </a>`).join('');
  return `
    ${subHeader(t('articles'))}
    <div class="art-tools">
      <div class="art-chips" role="tablist">${chips}</div>
      <select class="settings-select art-sort" id="articles-sort" aria-label="${t('artSort')}">
        <option value="new" ${articlesView.sort === 'new' ? 'selected' : ''}>${t('artSortNew')}</option>
        <option value="old" ${articlesView.sort === 'old' ? 'selected' : ''}>${t('artSortOld')}</option>
        <option value="title" ${articlesView.sort === 'title' ? 'selected' : ''}>${t('artSortTitle')}</option>
      </select>
    </div>
    ${articlesList === null ? `<div class="empty-hint">${t('artLoading')}</div>`
      : cards ? `<div class="art-list">${cards}</div>` : `<div class="empty-hint">${t('artNone')}</div>`}
  `;
}

document.addEventListener('change', e => {
  if(e.target.id === 'articles-sort'){ articlesView.sort = e.target.value; render(); }
});
