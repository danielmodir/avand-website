/* Google's "G" mark, official 4-color version — kept separate from ICONS
   (which are single-color currentColor icons) since brand marks aren't
   themeable. */
const GOOGLE_G_ICON = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.17 8.8 3.46l6.55-6.55C35.1 2.68 29.9.5 24 .5 14.86.5 7 5.73 3.2 13.4l7.65 5.94C12.7 13.5 17.9 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.15-3.15-.42-4.64H24v9.03h12.6c-.55 2.9-2.2 5.35-4.68 7l7.4 5.75C43.85 37.4 46.5 31.5 46.5 24.5z"/><path fill="#FBBC05" d="M10.85 19.34a14.5 14.5 0 0 0 0 9.32l-7.65 5.94a24 24 0 0 1 0-21.2z"/><path fill="#34A853" d="M24 47.5c6.48 0 11.9-2.13 15.87-5.8l-7.4-5.75c-2.06 1.4-4.7 2.2-8.47 2.2-6.1 0-11.3-4-13.15-9.4l-7.65 5.94C7 42.27 14.86 47.5 24 47.5z"/><path fill="none" d="M.5.5h47v47H.5z"/></svg>';

const ICONS = {
  book: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 2h11a3 3 0 0 1 3 3v15a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm0 15a1 1 0 0 0 0 2h12v-2H6zm2-11v2h8V6H8zm0 4v2h6v-2H8z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v.4l-10 6.3L2 6.4V6a2 2 0 0 1 2-2zm-2 4.8 10 6.3 10-6.3V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/></svg>',
  clockIcon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.6 3.4 2-1 1.7-4.4-2.6V6.5h2z"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2l-3.5-3.5L4 14.2 9 19.2 20 8.2l-1.5-1.5z"/></svg>',
  searchIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 7h12l-1 14H7L6 7zm3-4h6l1 2h4v2H2V5h4l1-2z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.7l-1.41-1.41L9.17 12 2.89 5.71 4.3 4.29 10.59 10.6l6.29-6.3z"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 18l-6-6 6-6 1.5 1.5L12.5 12l4.5 4.5z"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 6l6 6-6 6L7 16.5 11.5 12 7 7.5z"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 15.5l-6-6 1.41-1.41L12 12.67l4.59-4.58L18 9.5z"/></svg>',
  star: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
  calendarIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10z"/></svg>',
  repeatIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 2l4 4-4 4V7H8a5 5 0 0 0-5 5c0 1 .25 1.9.7 2.7l-1.47 1.47A6.97 6.97 0 0 1 1 12a7 7 0 0 1 7-7h9V2zM7 22l-4-4 4-4v3h9a5 5 0 0 0 5-5c0-1-.25-1.9-.7-2.7l1.47-1.47A6.97 6.97 0 0 1 23 12a7 7 0 0 1-7 7H7v3z"/></svg>',
  bellIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 0-2 2v.3A6 6 0 0 0 6 10v4l-2 3v1h16v-1l-2-3v-4a6 6 0 0 0-4-5.7V4a2 2 0 0 0-2-2zm0 20a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22z"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 7.5v9a4.5 4.5 0 0 1-9 0V6a3 3 0 0 1 6 0v9.5a1.5 1.5 0 0 1-3 0V8H9v7.5a3 3 0 0 0 6 0V6a4.5 4.5 0 0 0-9 0v10.5a6 6 0 0 0 12 0v-9h-1z"/></svg>',
  arrowBack: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l4.88-4.88L11.3 4.7 3.7 12.3l7.6 7.6 1.41-1.42L7.83 13H20z"/></svg>',
  chevronRightSmall: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 6l6 6-6 6L7 16.5 11.5 12 7 7.5z"/></svg>',
  shareIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.1a3 3 0 0 0-2.1.9l-6.2-3.6c.06-.26.1-.53.1-.8s-.04-.54-.1-.8l6.1-3.56c.6.55 1.38.86 2.2.86a3 3 0 1 0-3-3c0 .27.04.53.1.79L8.9 10.4A3 3 0 1 0 7 16c.83 0 1.6-.32 2.2-.86l6.2 3.62c-.06.24-.1.5-.1.74a2.9 2.9 0 1 0 2.9-3.4z"/></svg>',
  infoIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  gearIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.3 2.4a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.3-2.4a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
  linkIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12a5 5 0 0 1 5-5h3v2h-3a3 3 0 0 0 0 6h3v2h-3a5 5 0 0 1-5-5zm7-1h6v2h-6v-2zm3.1-4h3a5 5 0 0 1 0 10h-3v-2h3a3 3 0 0 0 0-6h-3V7z"/></svg>',
  messageIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z"/></svg>',
  mailIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1.4 2 7.6 6 7.6-6H4.4z"/></svg>',
  peopleIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v2h16v-2c0-3.3-4.7-5-8-5zm9-6a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm0 2c-.9 0-1.9.14-2.8.4 1.7 1.1 2.8 2.6 2.8 4.6v2h6v-2c0-2.8-3.6-5-6-5z"/></svg>',
  storeIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16l1.5 5a2.5 2.5 0 0 1-4 2 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4-2L4 4zm1 8.9c.7.3 1.4.4 2 .4.9 0 1.7-.2 2.5-.6a5.6 5.6 0 0 0 5 0 5.6 5.6 0 0 0 5 0c.6.4 1.4.6 2.5.6.6 0 1.3-.1 2-.4V20H5v-7.1z"/></svg>',
  manageIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2a1 1 0 0 0-1 1v1H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V3a1 1 0 0 0-1-1H9zm0 2h6v2H9V4zM6 8h12v12H6V8zm2 3v2h8v-2H8zm0 4v2h5v-2H8z"/></svg>',
  dropIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s7 8.1 7 12.5A7 7 0 0 1 5 14.5C5 10.1 12 2 12 2z"/></svg>',
  wifiOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3.5-2.3M12 20h.01M15.5 10.2A10 10 0 0 1 19 12.5"/></svg>',
  pencilIcon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  copyIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
};
