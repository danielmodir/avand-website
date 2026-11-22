// One flat vector drawing for every Toojibee logo. The geometry follows the
// owner's 2026-11-16 reference; edit the mark here, then run this file.
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'frontend', 'assets', 'icons');

// Artwork coordinates come from the supplied 1254 px square. No enclosing
// badge: every output has transparent space around the mark.
const box = '270 270 710 690';
function mark(ink, gap) {
  return `<rect x="328" y="316" width="596" height="78" rx="39" fill="${ink}"/>
  <rect x="326" y="426" width="462" height="78" rx="39" fill="${ink}"/>
  <path d="M422 486V647C422 764 512 847 630 852C749 857 868 767 868 646V485" fill="none" stroke="${ink}" stroke-width="118" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M422 532V590M422 646Q423 675 430 703M456 756Q473 783 502 803M555 831Q580 844 615 850M669 849Q701 844 731 832M787 803Q818 779 835 750M859 700Q868 672 868 631M868 503V572" fill="none" stroke="${gap}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function symbol(ink, road) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${mark(ink, road)}</svg>\n`;
}
const site = { forest:'#2C5745', cream:'#EBE3A7', orange:'#EB7D00', olive:'#2E2910' };
const files = {
  'logo.svg': symbol(site.forest, site.orange),
  'favicon.svg': symbol(site.orange, site.olive),
  'logo-header.svg': symbol(site.forest, site.orange),
  'logo-header-dark.svg': symbol(site.cream, site.orange),
  'logo-mark.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${mark(site.olive, site.orange)}</svg>\n`,
  'og-image.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${site.olive}"/><svg x="115" y="190" width="250" height="250" viewBox="${box}">${mark(site.cream,site.orange)}</svg><text x="430" y="290" font-family="Tahoma, Arial, sans-serif" font-size="84" font-weight="800" fill="${site.orange}">Toojibee</text><text x="430" y="370" font-family="Tahoma, Arial, sans-serif" font-size="40" fill="${site.cream}">توجیبی · تقویم و برنامه‌ریزی روزانه</text></svg>\n`,
};
// The splash uses the palette's primary on its canvas; the banner uses
// on-primary ink over its filled primary surface.
require('../frontend/demo/js/core/themes.js');
for (const palette of globalThis.AppThemes.palettes) {
  for (const mode of ['light', 'dark']) {
    const t = globalThis.AppThemes.tokens(palette.id, mode);
    files[`logo-${palette.id}-${mode}.svg`] = symbol(t.primary, t.background);
    files[`logo-${palette.id}-${mode}-banner.svg`] = symbol(t.onPrimary, t.primary);
  }
}
files['logo-navy.svg'] = files['logo-sustainable-tangerine-light-banner.svg'];
fs.mkdirSync(out, { recursive:true });
for (const [name, svg] of Object.entries(files)) fs.writeFileSync(path.join(out, name), svg);
console.log(`wrote ${Object.keys(files).length} SVGs`);
module.exports = { mark, box };
