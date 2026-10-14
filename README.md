# Toojibee

Bilingual (fa/en) landing site and app prototype for Toojibee, a
time-based personal-development app.

```
frontend/     published site (GitHub Pages deploys only this folder)
  index.html  robots.txt  sitemap.xml
  fa/  en/    landing pages (RTL / LTR)
  assets/     css, js, fonts, icons, data shared by the landing pages
  demo/       app prototype: css/, js/, components/ — see demo/README.md
backend/      Express + MySQL REST API (not deployed yet)
database/     MySQL schema: migrations/, seeds/, schema.sql
docs/         product docs, SPEC.md, DEPLOY.md
.github/      Pages deploy workflow
```

## Run locally

```
npx http-server frontend -p 8080 -c-1
```

Then open http://localhost:8080/ (the demo is at /demo/). The demo loads
its HTML partials with fetch, so it has to be served over HTTP, not
opened as a file.

For the API, see `backend/README.md` and `database/README.md`.

## Deploy

Every push to `master` publishes `frontend/` through
`.github/workflows/pages.yml`. Hosting, domains and caching are in
`docs/DEPLOY.md`.
