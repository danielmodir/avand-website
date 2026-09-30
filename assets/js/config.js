/* Single flip point for the two hero CTAs. No page copy changes needed —
   each button already carries both label/url variants as data-attributes
   (see assets/js/buttons.js); this file only says which variant is live.

   webApp.ready:
     false -> "Try web preview" / "امتحان پیش‌نمایش وب", links to /demo/
     true  -> "Open web app" / "باز کردن وب‌اپ", links to webApp.appUrl

   download.ready:
     false -> "Coming soon" / "به‌زودی", button disabled
     true  -> "Download for Android" / "دانلود برای اندروید",
              links to the page's own /download/ page (URL comes from the
              button's data-url-ready attribute, since it differs by
              language — config.js only holds the flag). */
window.AVAND_CONFIG = {
  webApp: {
    ready: false,
    appUrl: '' /* fill in once the real web app has a URL */
  },
  download: {
    ready: false
  }
};
