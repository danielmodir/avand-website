/* Start: python -m http.server 8765 --bind 127.0.0.1 --directory frontend
 * Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:8765') && !request.url().startsWith('data:')
      && !request.url().startsWith('blob:')) external.push(request.url());
  });
  try {
    await page.goto('http://127.0.0.1:8765/demo/');
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.querySelector('#app-splash'));
    await page.evaluate(() => {
      endQuickStart();
      state.guest = false; state.menuPanelOpen = true; state.menuSubView = 'settings-calendar';
      Cloud.isConfigured = () => true; Cloud.hasSession = () => true;
      Cloud.googleCalendarStatus = async () => ({ available: true, connected: true });
      googleCalendarUi.status = { available: true, connected: true };
      googleCalendarUi.plan = { version: 7, skipped: [], actions: [{
        local_id: 'local-1', google_id: 'google-1', action: 'confirm_local_delete', etag: '"x"',
        local_event: null, google_event: { title: 'Meeting', date: '2026-11-26', startTime: '09:00', endTime: '10:00', description: 'Details' },
      }] };
      render();
    });
    for (const width of [360, 1280]) for (const language of ['fa', 'en']) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      const result = await page.evaluate(({ language, theme }) => {
        state.settings.language = language; state.settings.theme = theme; applyAppearance(); render();
        const panel = document.querySelector('.gcal-settings');
        return { visible: !!panel, choices: panel?.querySelectorAll('[data-action="gcal-choice"]').length,
          overflow: panel?.scrollWidth > panel?.clientWidth + 1, dir: getComputedStyle(panel).direction };
      }, { language, theme });
      assert.equal(result.visible, true);
      assert.equal(result.choices, 2);
      assert.equal(result.overflow, false, JSON.stringify({ width, language, theme, result }));
      assert.equal(result.dir, 'ltr'); // The app shell is LTR in both languages.
    }
    await page.evaluate(() => {
      window.gcalApplied = null;
      Cloud.googleCalendarPrepare = async () => {};
      Cloud.googleCalendarEnd = () => {};
      Cloud.syncPending = () => false;
      Cloud.googleCalendarPreview = async () => googleCalendarUi.plan;
      Cloud.googleCalendarApply = async (action, version, choice) => { window.gcalApplied = { action, version, choice }; };
      Cloud.googleCalendarRefresh = async () => {};
    });
    await page.locator('[data-action="gcal-choice"][data-choice="keep_google"]').click();
    await page.waitForFunction(() => !!window.gcalApplied);
    const applied = await page.evaluate(() => window.gcalApplied);
    assert.equal(applied.version, 7);
    assert.equal(applied.choice, 'keep_google');
    assert.equal(applied.action.local_id, 'local-1');
    await page.evaluate(() => {
      googleCalendarUi.plan = { version: 8, skipped: [], actions: [{
        local_id: 'new-local', google_id: null, action: 'create_google', etag: null,
        local_event: { title: 'New', date: '2026-11-26' }, google_event: null,
      }] };
      Cloud.googleCalendarApply = async (action, version, choice) => {
        window.gcalAutomatic = { action, version, choice };
        googleCalendarUi.plan.actions = [];
      };
      render();
    });
    await page.locator('[data-action="gcal-sync"]').click();
    await page.waitForFunction(() => !!window.gcalAutomatic && !googleCalendarUi.busy);
    const automatic = await page.evaluate(() => window.gcalAutomatic);
    assert.equal(automatic.action.action, 'create_google');
    assert.equal(automatic.version, 8);
    assert.equal(automatic.choice, undefined);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log('Google Calendar UI: 8 layouts, manual choice and automatic action PASS');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
