#!/usr/bin/env node
/* Older-browser fallbacks for the live CSS bundle (deploy/build-site-zip.ps1).

   Android phones whose WebView/Chrome hasn't been updated (common where
   Google Play updates don't arrive) run engines from 2020 that drop whole
   declarations they don't understand — `inset:0` alone collapses the app's
   main pager to half the screen. For each such declaration this puts an
   older equivalent right BEFORE it; a current browser applies the original,
   which comes last, so nothing changes there. Sources stay as written.

     inset:A B C D        -> top/right/bottom/left first   (Chrome < 87)
     ...dvh               -> the same with vh first         (Chrome < 108)
     color-mix(in srgb, A p%, B) -> the side with the larger share
                                    (Chrome < 111: a plain color, not the mix)

   aspect-ratio (Chrome < 88) has no CSS fallback; js/core/compat.js
   sizes those few boxes itself in old engines.

     node deploy/css-compat.js <file.css>   (rewrites the file in place) */
'use strict';
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('usage: node css-compat.js <file.css>'); process.exit(1); }
let css = fs.readFileSync(file, 'utf8');

/* Split on a separator at parenthesis depth 0. */
function splitTop(s, sep) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (cur.trim() || sep !== ' ') out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* color-mix(in srgb, A p%, B [q%]) -> A or B, whichever has the larger share. */
function colorMixFallback(value) {
  let guard = 0;
  while (value.includes('color-mix(') && guard++ < 20) {
    const start = value.indexOf('color-mix(');
    let depth = 0, end = -1;
    for (let i = start + 9; i < value.length; i++) {
      if (value[i] === '(') depth++;
      if (value[i] === ')' && --depth === 0) { end = i; break; }
    }
    if (end < 0) return null;
    const args = splitTop(value.slice(start + 10, end), ',');
    if (args.length !== 3) return null;
    const parse = a => {
      const parts = splitTop(a, ' ');
      const pct = parts.find(p => /^[\d.]+%$/.test(p));
      return { color: parts.filter(p => p !== pct).join(' '), pct: pct ? parseFloat(pct) : null };
    };
    const a = parse(args[1]), b = parse(args[2]);
    const pa = a.pct != null ? a.pct : (b.pct != null ? 100 - b.pct : 50);
    value = value.slice(0, start) + (pa >= 50 ? a.color : b.color) + value.slice(end + 1);
  }
  return value;
}

function insetLonghands(value) {
  const imp = /\s*!important\s*$/.test(value) ? ' !important' : '';
  const v = splitTop(value.replace(/\s*!important\s*$/, ''), ' ');
  if (!v.length || v.length > 4) return null;
  const [t, r = t, b = t, l = r] = v;
  return `top:${t}${imp};right:${r}${imp};bottom:${b}${imp};left:${l}${imp}`;
}

let added = 0;
// A declaration: after "{" or ";", up to the next ";" or "}" (values here never contain those).
css = css.replace(/([{;])(\s*)([a-zA-Z-]+)\s*:([^;{}]+)/g, (m, before, ws, prop, value) => {
  if (prop.startsWith('--')) return m; // custom properties are resolved where they're used
  const extra = [];
  let v = value;
  if (prop === 'inset') { const l = insetLonghands(v); if (l) extra.push(l); }
  if (/\d(dvh|svh|lvh)\b/.test(v)) extra.push(`${prop}:${v.replace(/(\d)(dvh|svh|lvh)\b/g, '$1vh')}`);
  if (v.includes('color-mix(')) {
    const f = colorMixFallback(v.replace(/(\d)(dvh|svh|lvh)\b/g, '$1vh'));
    if (f) extra.push(`${prop}:${f}`);
  }
  if (!extra.length) return m;
  added += extra.length;
  return `${before}${ws}${extra.join(';')};${prop}:${value}`;
});

fs.writeFileSync(file, css);
console.log(`css-compat: ${added} fallbacks added to ${file}`);
