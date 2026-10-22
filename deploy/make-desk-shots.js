/* Captures the landing page's per-section app screenshots
   (frontend/assets/img/desk-<section>-<lang>-<theme>.webp) from the app
   itself, in both languages and both themes, with headless Chrome over
   the DevTools protocol (Node 22+, no packages).

   1. Serve frontend/ on port 8080 (the "avand-site" launch config).
   2. node deploy/make-desk-shots.js
   3. python -I deploy/webp.py  (PNG -> WebP, see the end of this file)

   The app runs offline (no apiBase on localhost) with a few example items
   added in memory for the picture; nothing is saved anywhere. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE = 'http://127.0.0.1:8080/demo/';
const OUT = path.join(__dirname, '..', 'dist', 'desk-shots');
const W = 375, H = 700, PORT = 9333;
const SECTIONS = (process.argv[2] || 'calendar,occasions,planning,period,friends').split(',');

/* Runs in the page: example content in the page's language, then the view. */
function setup(section, theme) {
  state.settings.theme = theme; applyAppearance();
  state.profile.gender = 'female'; // the period desk is offered to women
  const fa = lang() === 'fa';
  const d = n => dateKey(addDays(today, n));
  const rec = { mode: null, interval: 1, weekdays: [] };
  const task = (title, extra) => Object.assign({ id: uid(), title, category: '', description: '', photos: [], pinned: false, done: false, skipped: false,
    subtasks: [], timeMode: 'single', date: d(0), endDate: null, recurrence: rec, notification: { type: null } }, extra);
  state.tasks = [
    task(fa ? 'مرور جزوه‌ی ریاضی' : 'Review math notes', { pinned: true, notification: { type: 'time', time: '18:00', repeatHours: 2, text: '' } }),
    task(fa ? 'خرید میوه و نون' : 'Buy fruit and bread', { done: true }),
    task(fa ? 'تماس با مامان' : 'Call mom'),
    task(fa ? 'جلسه‌ی پروژه' : 'Project meeting', { date: d(2) }),
  ];
  state.habits = [
    { id: uid(), title: fa ? '۳۰ دقیقه کتاب خوندن' : 'Read for 30 minutes', recurrence: { mode: 'interval', interval: 1, weekdays: [] },
      notification: { type: 'time', time: '21:00', repeatHours: 1, text: '' }, startDate: d(-10), completedDates: [d(-1), d(-2)] },
    { id: uid(), title: fa ? 'پیاده‌روی صبح' : 'Morning walk', recurrence: { mode: 'interval', interval: 1, weekdays: [] },
      notification: { type: null }, startDate: d(-20), completedDates: [d(0)] },
  ];
  state.events = [
    { id: uid(), title: fa ? 'کلاس زبان' : 'English class', timeMode: 'single', date: d(0), endDate: null, startTime: '19:30', endTime: '21:00',
      recurrence: rec, notification: { type: 'time', time: '19:00', repeatHours: 1, text: '' } },
    { id: uid(), title: fa ? 'سفر آخر هفته' : 'Weekend trip', timeMode: 'range', date: d(4), endDate: d(6), recurrence: rec, notification: { type: null } },
  ];
  state.period = Object.assign({}, state.period, { enabled: true, step: 'done', lastStart: d(-9), cycleLength: 28, periodLength: 5, calendarReminder: true });
  state.connections = [
    { id: 'c1', name: fa ? 'سارا' : 'Sara', status: 'accepted', userId: 'TJ-4K7M2Q9X', phone: '' },
    { id: 'c2', name: fa ? 'علی' : 'Ali', status: 'accepted', userId: 'TJ-8P3R6W1Z', phone: '' },
  ];
  state.menuPanelOpen = false; state.menuSubView = null;
  // Planning and period full-screen; calendar and occasions with the month above.
  if (section === 'planning' || section === 'period') state.deskFull = true;
  // Occasions: the nearest day that has a few.
  if (section === 'occasions') {
    let best = today, most = -1;
    for (let n = 0; n < 60; n++) {
      const day = addDays(today, n), k = visibleOccasionsForDate(day).length;
      if (k > most) { best = day; most = k; }
    }
    state.homeDate = best; state.calCursor = new Date(best);
  }
  render();
  const desk = key => {
    const dots = [...document.querySelectorAll('#desktop-dots span')];
    const i = dots.findIndex(s => s.dataset.key === key);
    if (i >= 0) goToDesktopIndex(i);
  };
  if (section === 'occasions') desk('occasionsDesktop');
  if (section === 'planning' || section === 'calendar') desk('planning');
  if (section === 'period') desk('periodDesktop');
  if (section === 'friends') { state.menuPanelOpen = true; state.menuSubView = 'friends'; render(); }
  window.scrollTo(0, 0);
  return [...document.querySelectorAll('#desktop-dots span')].map(s => s.dataset.key).join(',');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-shots-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch (e) { /* not up yet */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let seq = 0; const waiting = {};
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && waiting[m.id]) { waiting[m.id](m); delete waiting[m.id]; } });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; waiting[id] = m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: SITE }); await sleep(1500);

  for (const lng of ['fa', 'en']) {
    for (const theme of ['light', 'dark']) {
      await evaluate(`localStorage.clear(); localStorage.setItem('toojibee-theme','${theme}'); localStorage.setItem('toojibee-lang','${lng}'); localStorage.setItem('toojibee-tour-done-v1','1'); localStorage.setItem('toojibee-bday-shown','9999'); 1`);
      for (const section of SECTIONS) {
        await send('Page.navigate', { url: SITE }); await sleep(2500);
        await evaluate(`document.getElementById('bday-overlay')?.remove(); document.getElementById('tour-root')?.remove(); 1`);
        const desks = await evaluate(`(${setup.toString()})(${JSON.stringify(section)}, '${theme}')`);
        await sleep(900);
        await evaluate(`document.getElementById('app-toast')?.remove(); document.getElementById('back-today-btn')?.remove(); 1`);
        await evaluate(`document.fonts.ready.then(() => 1)`);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const file = path.join(OUT, `desk-${section}-${lng}-${theme}.png`);
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
        console.log(file, desks);
      }
    }
  }
  ws.close(); chrome.kill();
}

main().catch(e => { console.error(e); process.exit(1); });
