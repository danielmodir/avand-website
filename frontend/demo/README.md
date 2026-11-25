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
- Public occasion reminders are opt-in plans in `settings.prefs.occasionReminders`.
  `js/core/occasions.js` gives each calendar rule a stable key and emits
  slots from its current date; `js/core/notify.js` feeds the same slots to
  browser, push and Android schedules. Django stores the plans in the
  existing settings JSON; PHP keeps them in the synced document.
- Events can carry optional `location` and `meetingUrl` text from the
  existing popup. The Django adapter maps them to `location` and
  `meeting_url`; PHP sync keeps the additive event fields as JSON.
- The Habit Tracker pane is rendered in `components/workspace/workspace.js`.
  It reuses `state.habits`, `habitRow()` and the existing detail editor;
  Planning no longer renders habit rows or includes them in its progress card.
  `js/core/habit-goals.js` calculates period goals, streaks and success rates
  from those daily logs in the selected calendar and week-start setting.
- The Finance pane is rendered by `js/core/finance.js` inside the existing
  workspace. `js/core/finance-vault.js` stores only AES-GCM ciphertext in a
  separate per-user key; a web passphrase stays in memory, while the Android
  bridge uses Keystore. Pending account and transaction writes are sealed
  before sending to `/finance/*` and use idempotency keys on retry. The
  general `local-store.js` and `/sync` document do not contain finance data.
- Partials are fetched at runtime, so open the demo over HTTP
  (`npx http-server frontend`), not from `file://`.

## Application themes (2026-11-16)

The six replacement palettes and their twelve schemes are centralized in
`js/core/themes.js`, loaded synchronously in the head before first paint.
Theme palette and light/dark/system appearance are independent; settings
previews and accessible component states live in `css/themes.css`. Shared
spacing/radius tokens come from `../assets/css/tokens.css`. No old palette
stylesheet or accent override should be reintroduced. See
`../../docs/theme-system/README.md` for storage migration, contrast and tests.
