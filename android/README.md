# Toojibee for Android

The Android app is the web app (`frontend/demo/`) in a WebView, plus a thin
native layer (Kotlin, no AndroidX / Firebase / other libraries, ~1 MB APK).
Package `ir.toojibee.app`, Android 7.0+ (API 24).

Same look, animations and behaviour as the web app, because it *is* the web
app. The native side only adds what a WebView can't do:

| What | Where |
|---|---|
| The app's files from the phone (opens offline, instantly) | `WebFiles.kt` |
| Updates of those files without a new APK (only changed files) | `WebFiles.kt` + `demo/app-files.json` |
| Reminders as phone notifications, offline, app closed, after a restart | `Reminders.kt` + `js/core/notify.js` |
| Back button, share sheet, clipboard, status bar colors, file picker | `MainActivity.kt` + `js/core/android.js` |

## How it fits together

- The page is loaded from `https://toojibee.ir/demo/`, but every file listed
  in `demo/app-files.json` is answered from the phone (`shouldInterceptRequest`).
  Everything else — the API at `/api/v1`, uploaded pictures — goes to the
  network as on the website. Same origin, so `js/config.js`, sign-in and the
  account are exactly the website's.
- Account data offline: `js/services/api-php.js` keeps the last copy on the
  device and sends changes made offline once the connection is back (this
  works the same on the website).
- `deploy/build-site-zip.ps1` writes `demo/app-files.json` (path → SHA-256,
  first 16 hex) for every site deploy. An installed app fetches it when it
  comes to the front (at most hourly, ETag → usually an empty 304), downloads
  only the files whose hash changed, and switches to them the next time the
  page loads (cold start, or back after 10+ minutes away).
  `minApp` in that file is the oldest `versionCode` the files work with:
  raise it when the web app starts relying on a new bridge method.
- `window.ToojibeeAndroid` (the bridge) exists only inside the app;
  `js/core/android.js` and the `androidApp` checks in `notify.js` / `util.js`
  do nothing on the website.

## Building

Needs the Android SDK (platform 34, build-tools 34) and a JDK 17–20.

```
powershell -ExecutionPolicy Bypass -File deploy\build-android.ps1
```

builds the site package (so the APK carries exactly what the live site
serves), copies the app files into `app/src/main/assets/web/`, and runs Gradle.
Without `android/keystore.properties` it makes a **debug** APK (testing only);
with it, a signed, shrunk **release** APK. Output: `dist/toojibee-<version>.apk`
with its size and SHA-256. Flags: `-Debug`, `-SkipSite` (reuse `dist/stage`),
`-Offline` (Gradle from its local cache).

### The release key

Created once, by the repo owner, with `deploy\make-keystore.ps1` (asks for the
password; nobody else sees it). It writes `android/toojibee-release.jks` and
`android/keystore.properties`, both git-ignored. **Back up both and the
password**: an update signed with any other key won't install over the app.

### A new version

Bump `versionCode` (+1) and `versionName` in `app/build.gradle.kts` only when
the native side changed; web-only changes reach installed apps by themselves
after the site deploy.

To publish an APK: copy `dist/toojibee-<version>.apk` to
`frontend/download/`, point both download pages (`frontend/fa|en/download/`)
at it and update their version, build date, size and SHA-256 line, then
deploy the site. The same APK goes to Bazaar / Myket (uploaded by the repo
owner with their developer account).
