# /demo/ — app prototype

Plain HTML/CSS/JS, no build step. `index.html` is only a shell: it links
the stylesheets, holds `<div data-include="...">` placeholders and loads
the scripts in order.

```
demo/
  index.html            shell (head, placeholders, script tags)
  manifest.json
  css/                  shared layers, loaded first
    base.css            fonts, theme variables, reset, .device
    layout.css          pager / pages
    shared.css          section titles, empty hints, toast, misc
    forms.css           fields, switches, selects
    buttons.css         generic buttons
  js/
    core/               no UI of their own
      icons.js  dates.js  i18n.js  calendars.js  occasions.js
      state.js  render.js  util.js  events.js  include.js
    services/api.js     client for the Django API (backend/), same Cloud interface
    config.js           apiBase; empty = offline demo without sign-in
    app.js              entry point: start() loads partials, wires listeners, boots
  components/           one folder per UI piece: .html partial / .css / .js
    banner/  toolbar/  workspace/  calendar/  items/  day-sheet/
    popup/  menu/  period/  auth/  groups/ (group planning desk; data in js/core/groups.js)
```

## Rules

- Scripts are classic (non-module) and share one global scope, so order
  in `index.html` matters only for code that runs at load time. Anything
  that touches component markup belongs inside `start()` in `js/app.js`,
  which runs after `loadComponents()` has injected every partial.
- Static markup goes in `components/<name>/<name>.html`; markup rendered
  from state stays in that component's `.js` file.
- Component CSS loads after `css/`, so a component rule wins a tie with a
  generic one.
- `url()` paths in CSS are relative to the CSS file, not to `index.html`.
- Cache busting: every `<link>`/`<script>` in `index.html` carries
  `?v=<version>` and `js/core/include.js` has the same `ASSET_VERSION`
  for the partials. Bump it (one find-and-replace across both files) with
  each change, or phones keep the old files for up to 10 minutes after a
  GitHub Pages deploy.
- Partials are fetched at runtime, so open the demo over HTTP
  (`npx http-server frontend`), not from `file://`.
