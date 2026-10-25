/* The pictures the phone shows in its widget list (android:previewImage in
   android/app/src/main/res/xml/widget_*.xml): each widget drawn as a page
   in the app's colors (night mode, Persian) with example content, captured
   by headless Chrome, then made WebP.

   1. node deploy/make-widget-previews.js
   2. python -I deploy/webp-widgets.py
      -> android/app/src/main/res/drawable-nodpi/widget_preview_*.webp

   Redo both after a change to a widget's look (Widgets.kt, its layouts). */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'widget-previews');
fs.mkdirSync(OUT, { recursive: true });

// Widgets.kt's Look defaults (the app's Toojibee night palette).
const C = { card: '#2E2910', text: '#F5F0D2', muted: 'rgba(235,227,167,.66)', faded: 'rgba(235,227,167,.33)',
  primary: '#EB7D00', onPrimary: '#2E2910', holiday: '#F0937A', habit: '#4CC38A', event: '#D9B65C', danger: '#E5484D',
  row: 'rgba(255,255,255,.08)' };
const font = path.join(ROOT, 'frontend/assets/fonts/baloo-bhaijaan-2').replace(/\\/g, '/');
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{ font-family:B; src:url("file:///${font}/BalooBhaijaan2-Arabic-VF.woff2") format("woff2"); font-weight:400 800; }
@font-face{ font-family:B; src:url("file:///${font}/BalooBhaijaan2-Latin-VF.woff2") format("woff2"); font-weight:400 800; unicode-range:U+0000-00FF; }
html,body{ margin:0; background:transparent; }
body{ width:${w}px; height:${h}px; font-family:B, Tahoma, sans-serif; color:${C.text}; }
.w{ box-sizing:border-box; width:100%; height:100%; background:${C.card}; border-radius:24px; padding:14px; overflow:hidden; }
.muted{ color:${C.muted}; }
</style></head><body><div class="w" dir="rtl">${body}</div></body></html>`;

const pages = {};

pages.date = page(320, 160, `
  <div style="display:flex; gap:14px; align-items:center; height:100%">
    <div style="font-size:72px; font-weight:800; color:${C.primary}; line-height:1">${fa(4)}</div>
    <div>
      <div style="font-size:22px; font-weight:700">دوشنبه</div>
      <div class="muted" style="font-size:15px">آبان ${fa(1405)}</div>
      <div class="muted" style="font-size:13px; margin-top:4px"><bdi dir="ltr">26 October 2026</bdi></div>
    </div>
  </div>`);

// Aban 1405 begins on a Friday; Saturday-first weeks, today = the 4th.
const wds = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const cell = (n, opts = {}) => `<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; height:100%">
  ${opts.today ? `<div style="position:absolute; width:36px; height:36px; border-radius:50%; background:${C.primary}"></div>` : ''}
  <div style="position:relative; font-weight:700; font-size:15px; color:${opts.today ? C.onPrimary : opts.out ? C.faded : opts.holiday ? C.holiday : C.text}">${fa(n)}</div>
  <div style="position:relative; font-size:8px; color:${opts.today ? C.onPrimary : opts.out ? C.faded : C.muted}">${opts.sub || ''}</div></div>`;
const weekRow = days => `<div style="display:flex; flex:1">${days.map(d => cell(d.n, d)).join('')}</div>`;
const monthDays = [];
for (let i = 0; i < 6; i++) monthDays.push({ n: 25 + i, out: true });
for (let n = 1; n <= 30; n++) monthDays.push({ n, today: n === 4, holiday: (n + 5) % 7 === 6, sub: String(((n + 21) % 31) + 1) });
for (let n = 1; monthDays.length < 42; n++) monthDays.push({ n, out: true });
const head = title => `<div style="display:flex; align-items:center; height:34px">
  <div style="width:30px; text-align:center; font-size:20px"><span dir="ltr">›</span></div><div style="flex:1; text-align:center; font-weight:700; font-size:16px">${title}</div>
  <div style="width:30px; text-align:center; font-size:20px"><span dir="ltr">‹</span></div></div>`;
const weekdays = `<div style="display:flex; height:22px">${wds.map(w => `<div style="flex:1; text-align:center; font-size:12px" class="muted">${w}</div>`).join('')}</div>`;
pages.month = page(320, 330, `<div style="display:flex; flex-direction:column; height:100%">${head('آبان ' + fa(1405))}${weekdays}
  <div style="flex:1; display:flex; flex-direction:column">${[0, 1, 2, 3, 4, 5].map(r => weekRow(monthDays.slice(r * 7, r * 7 + 7))).join('')}</div></div>`);

const box = (kind, state) => {
  const r = kind === 'habit' ? '6px' : '50%', col = kind === 'habit' ? C.habit : C.primary;
  if (state === 'done') return `<div style="width:20px; height:20px; border-radius:${r}; background:${col}; color:${C.onPrimary}; font-size:14px; display:flex; align-items:center; justify-content:center">✓</div>`;
  return `<div style="box-sizing:border-box; width:20px; height:20px; border-radius:${r}; border:2px solid ${C.muted}"></div>`;
};
const section = (label, n) => `<div style="display:flex; align-items:center; gap:6px; height:24px; font-weight:700; font-size:13px">${label}
  <span style="background:rgba(235,125,0,.16); color:${C.primary}; border-radius:9px; padding:0 7px; font-size:11px">${fa(n)}</span></div>`;
const row = (kind, title, time, state, pinned) => `<div style="display:flex; align-items:center; gap:8px; background:${C.row}; border-radius:12px; padding:6px 10px; margin-bottom:4px; min-height:30px">
  ${box(kind, state)}<div style="flex:1"><div style="font-size:14px; ${state === 'done' ? `text-decoration:line-through; color:${C.muted}` : ''}">${title}</div>
  ${time ? `<div class="muted" style="font-size:11px" dir="ltr">${time}</div>` : ''}</div>${pinned ? `<div style="color:${C.primary}">★</div>` : ''}</div>`;
pages.desk = page(320, 390, `
  <div style="display:flex; align-items:center; height:34px"><div style="flex:1; font-weight:700; font-size:15px">برنامه‌ریزی · دوشنبه ${fa(4)}</div>
    <div style="width:30px; height:30px; border-radius:50%; background:${C.primary}; color:${C.onPrimary}; font-size:22px; display:flex; align-items:center; justify-content:center">+</div></div>
  ${section('رویدادها', 1)}
  <div style="display:flex; align-items:center; gap:8px; background:${C.row}; border-radius:12px; padding:8px 10px; margin-bottom:4px">
    <div style="width:4px; height:18px; border-radius:2px; background:${C.event}"></div><b style="color:${C.primary}; font-size:12px">${fa('18:00')}</b><div style="font-size:14px">کلاس زبان</div></div>
  ${section('کارها', 3)}
  ${row('task', 'مرور جزوه‌ی ریاضی', fa('10:00 – 12:00'), '', true)}${row('task', 'خرید میوه و نون', '', 'done')}${row('task', 'تماس با مامان', '', '')}
  ${section('عادت‌ها', 1)}${row('habit', 'ورزش صبحگاهی', '', '')}`);

// The period ring (Widgets.kt ring()): flow, fertile, PMS arcs on a 28-day cycle, today's dot.
const arc = (start, len, color) => {
  const a0 = (start / 28) * 2 * Math.PI - Math.PI / 2 + 0.06, a1 = ((start + len) / 28) * 2 * Math.PI - Math.PI / 2 - 0.06;
  const p = a => `${(70 + 58 * Math.cos(a)).toFixed(1)} ${(70 + 58 * Math.sin(a)).toFixed(1)}`;
  return `<path d="M ${p(a0)} A 58 58 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`;
};
const dotA = (16.5 / 28) * 2 * Math.PI - Math.PI / 2;
pages.period = page(170, 170, `<div style="position:relative; width:100%; height:100%">
  <svg viewBox="0 0 140 140" style="position:absolute; inset:0; width:100%; height:100%">
    ${arc(0, 5, '#E5484D')}${arc(5, 5, 'rgba(235,227,167,.18)')}${arc(10, 6, '#99C2FF')}${arc(16, 7, 'rgba(235,227,167,.18)')}${arc(23, 5, '#FFDF82')}
    <circle cx="${(70 + 58 * Math.cos(dotA)).toFixed(1)}" cy="${(70 + 58 * Math.sin(dotA)).toFixed(1)}" r="4.5" fill="${C.text}"/></svg>
  <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center">
    <div style="font-size:15px; font-weight:800">${fa(12)} روز</div><div class="muted" style="font-size:10px">تا پریود بعدی</div></div></div>`);

const sizes = { date: [320, 160], month: [320, 330], desk: [320, 390], period: [170, 170] };
for (const [name, html] of Object.entries(pages)) {
  const file = path.join(OUT, `widget-${name}.html`);
  fs.writeFileSync(file, html);
  const [w, h] = sizes[name];
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--default-background-color=00000000', '--force-device-scale-factor=2', '--virtual-time-budget=4000', `--window-size=${w},${h}`,
    `--screenshot=${path.join(OUT, `widget-${name}.png`)}`, 'file:///' + file.replace(/\\/g, '/')], { stdio: 'ignore' });
  console.log('wrote', `widget-${name}.png`);
}
