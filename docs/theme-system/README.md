# Application theme system

The owner approved six replacement palettes on 2026-11-16. Marketing colors remain independent.

## Structure and state

- `frontend/demo/js/core/themes.js`: all six original swatch arrays, twelve explicit foundation palettes, 46 semantic tokens, supplemental colors, data inks and legacy component aliases. No runtime imports or dependencies.
- `frontend/demo/css/themes.css`: semantic states, visible focus and responsive selector. Shared spacing/radii come from `frontend/assets/css/tokens.css`.
- `util.js`, `events.js`, `state.js`, `app.js`, `index.html`: synchronous startup, live application, Android bars and interactions.
- `components/menu/menu.js` and `i18n.js`: Persian/English dual-mode cards and independent appearance.
- Django migration `0011_six_theme_palettes` expands palette IDs to 24 characters and migrates old IDs; API client now saves System explicitly. PHP already persists the settings document without a palette enum.

Store `selectedThemeId` and `selectedAppearanceMode` independently in localStorage before first paint. Account transport retains the existing `settings.palette` / `settings.theme` fields. Old palette IDs map to Sustainable Tangerine, preserving valid light/dark settings. System follows matchMedia changes and Android status/navigation bars use the resolved background. Root variables update without resetting application state. Legacy accent preferences are ignored and removed from client state; old API compatibility fields may still accept legacy clients.

## Supplementary color rationale

Foundation colors are exact requested HEX values. Hover/pressed move the action color slightly away from its foreground (9% and 17%) so text contrast improves; they do not invert the palette. Input borders mix surface and main text at 74% to remain visible on all three surfaces. Dividers use 22%; disabled text uses 45% and is exempt from text contrast criteria. Muted text deliberately shares the supplied secondary text color. Primary text aliases fall back to the main text color when a supplied action color would fall below 4.5:1 as text on a variant surface. The supplied action HEX itself is unchanged.

Independent feedback pairs: Light success #23603B, warning #795006, error #A52626, info #185878; Dark success #97D5AA, warning #F2CF80, error #FFB4AB, info #9CD1EC. White #FFFFFF or near-black #141414 is chosen for the larger contrast ratio on each colored fill. Period data inks are Light pink #A52665 / Dark pink #FFB4D0, warning and info; text labels and shapes continue to distinguish phases. Shadows use #302A20 in light and #000000 in dark at restrained opacity; scrims use #141414. No decorative glow.

Every supplemental HEX, semantic role and computed ratio is recorded per configuration in [token-audit.json](token-audit.json).

## Contrast results

All twelve configurations pass automated checks: normal text >=4.5, all three primary action states >=4.5, status/fill pairs >=4.5, essential input borders/focus >=3. Values below are the minimum ratios among each category. They establish token pair accessibility, not a blanket certification of every existing screen.

| Palette | Mode | Normal text | Actions | Borders/focus |
|---|---|---:|---:|---:|
| sustainable-tangerine | light | 5.74 | 5.42 | 4.42 |
| sustainable-tangerine | dark | 8.25 | 6.54 | 4.98 |
| emerald-nature | light | 5.14 | 7.86 | 3.89 |
| emerald-nature | dark | 7.55 | 8.28 | 5.29 |
| ocean-contrast | light | 5.39 | 9.00 | 5.88 |
| ocean-contrast | dark | 7.82 | 7.48 | 5.85 |
| earthy-harmony | light | 5.17 | 9.53 | 3.97 |
| earthy-harmony | dark | 5.74 | 7.72 | 4.48 |
| organic-apricot | light | 4.69 | 5.08 | 3.46 |
| organic-apricot | dark | 5.97 | 8.18 | 5.01 |
| midnight-luxe | light | 6.21 | 4.97 | 4.08 |
| midnight-luxe | dark | 7.66 | 8.53 | 6.28 |

## Verification

`node --test tests/themes.test.js`: five passing tests cover complete12 token sets, exact original palettes, state and feedback contrast, data inks, migrations, storage denial and system listening. Django targeted settings tests: seven pass. Chromium: all 48 configurations (12 × Persian/English × 360/1280) passed selector geometry, overflow and RTL checks; actual clicks, persistence/reload, OS dark/light changes and toolbar override passed. Zero page errors and zero external network requests. Eight reference screenshots were generated; representative screenshots were visually inspected for representative light/dark and mobile/desktop layouts.

Android bars integration uses the existing bridge; no APK or physical Android device test was performed. The app remains noindex. No production deployment performed.

The full Node suite passed 28 tests before another concurrent historical-event test was added. Latest root verification: 28/29 passed; the newly added tests/past-events.test.js reminder test fails because its VM context lacks navigator. The five dedicated theme tests still pass. This unrelated concurrent test was not modified by the theme work.
An additional real Chromium check passed all twelve task-dialog/day-sheet states and preserved the live input draft during appearance application. These checks confirm rendering and state preservation; exhaustive accessibility certification and native device coverage remain outside this run.

Broader Django core verification: 28/29 passed; the existing GoogleRedirectFlowTests.test_start_callback_exchange expects a redirect for a localhost frontend URL that current server validation rejects (400 vs302). This is unrelated to palette settings. The targeted seven settings tests pass. Existing unrelated model drift in EmailOutbox was excluded from the theme migration.

Repeat browser verification with a static server serving frontend on 127.0.0.1:8765, an installed Playwright module supplied through PLAYWRIGHT_MODULE, and `node tests/theme-ui.cjs`. No Playwright dependency is added to the published frontend. Eight screenshots are generated in the system temporary toojibee-theme-qa folder. Representative reviewed outputs are available in this chat's visualization directory.
