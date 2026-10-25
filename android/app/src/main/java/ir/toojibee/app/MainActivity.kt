package ir.toojibee.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.LayerDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * The whole app: one WebView showing the web app (frontend/demo) from the
 * phone's own copy (WebFiles), with a small bridge, window.ToojibeeAndroid
 * (frontend/demo/js/core/android.js), for what a WebView can't do itself.
 */
class MainActivity : Activity() {
    companion object {
        const val ACTION_REMINDER = "ir.toojibee.app.REMINDER"
        private const val REQ_FILE = 1
        private const val REQ_NOTIFY = 2
        private const val RELOAD_AFTER_MS = 10 * 60_000L
        /** The open app, if any (PhoneActions applies ticks through it). */
        @Volatile var current: java.lang.ref.WeakReference<MainActivity>? = null
    }

    private lateinit var web: WebView
    private val ui = Handler(Looper.getMainLooper())
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pageReady = false
    private var pageVisible = false
    private var canvas = 0 // the theme's background color (status bar, splash, behind the page)
    private var leftAt = 0L
    private val prefs by lazy { getSharedPreferences("app", Context.MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebFiles.init(this)
        // Splash: the logo on the app's last theme color (the theme's own
        // splash, drawable/splash.xml, covers the moment before this), shown
        // through the WebView until the page paints its first frame.
        val saved = prefs.getString("barColor", null)
        if (saved != null) setBars(saved, prefs.getBoolean("barLight", false))
        canvas = saved?.let { Color.parseColor(it) } ?: getColor(R.color.canvas)
        window.setBackgroundDrawable(LayerDrawable(arrayOf(ColorDrawable(canvas), getDrawable(R.drawable.splash_logo))))

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true) // chrome://inspect
        web = WebView(this)
        web.setBackgroundColor(Color.TRANSPARENT)
        // Smoothness: tiles just outside the screen are drawn ahead, so a
        // scroll or a sliding panel doesn't show blank tiles; and the page's
        // renderer keeps a high priority while the app is on screen.
        web.settings.offscreenPreRaster = true
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
        AppWeb.setup(web)
        web.addJavascriptInterface(Bridge(), "ToojibeeAndroid")
        current = java.lang.ref.WeakReference(this)
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
        setContentView(web)

        if (intent?.action == Widgets.ADD) pendingJs = openAddJs
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(startUrl(intent))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    /** Where to open: an app link, a tapped reminder, or the app's start page. */
    private fun startUrl(intent: Intent?): String {
        val data = intent?.data
        if (data != null && WebFiles.isAppPage(data)) return data.toString()
        if (intent?.action == ACTION_REMINDER) {
            val target = listOf("kind", "id", "date").joinToString("|") { intent.getStringExtra(it) ?: "" }
            return WebFiles.START + "#reminder=" + Uri.encode(target)
        }
        return WebFiles.START
    }

    /** The desk widget's +: today, with the add menu open (once the app has booted). */
    private val openAddJs = "(function go(){if(typeof state==='undefined'||state.booting||!document.getElementById('page-home'))return setTimeout(go,300);" +
        "state.homeDate=new Date(today);state.selectedDate=new Date(today);state.menuPanelOpen=false;state.navExpanded=true;render();})()"
    private var pendingJs: String? = null

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val data = intent.data
        when {
            intent.action == Widgets.ADD -> if (pageReady) web.evaluateJavascript(openAddJs, null) else pendingJs = openAddJs
            data != null && WebFiles.isAppPage(data) -> web.loadUrl(data.toString())
            intent.action == ACTION_REMINDER && pageReady -> {
                val d = JSONObject()
                listOf("kind", "id", "date").forEach { d.put(it, intent.getStringExtra(it) ?: "") }
                web.evaluateJavascript("typeof openReminderTarget==='function'&&openReminderTarget($d)", null)
            }
            intent.action == ACTION_REMINDER -> web.loadUrl(startUrl(intent))
        }
    }

    override fun onResume() {
        super.onResume()
        Reminders.appOnScreen = true
        web.onResume()
        web.resumeTimers()
        // A newer copy of the app's files came in while it was away a while: start it fresh.
        if (leftAt > 0 && System.currentTimeMillis() - leftAt > RELOAD_AFTER_MS && WebFiles.updateWaiting()) {
            WebFiles.activate()
            web.loadUrl(WebFiles.START)
        }
        leftAt = 0
        WebFiles.checkForUpdate()
    }

    override fun onPause() {
        super.onPause()
        Reminders.appOnScreen = false
        // Reminders due so far were the web app's (it checks every 30 s).
        Reminders.markHandled(this, System.currentTimeMillis() - 30_000)
        Reminders.scheduleNext(this)
        leftAt = System.currentTimeMillis()
        web.onPause()
        // Let the page save first ('visibilitychange'), then stop its timers.
        ui.postDelayed({ if (!Reminders.appOnScreen) web.pauseTimers() }, 2000)
    }

    override fun onDestroy() {
        if (current?.get() === this) current = null
        web.destroy()
        super.onDestroy()
    }

    /** Ticks from a notification or a widget (PhoneActions): the page applies them now. */
    fun applyPhoneActions() {
        if (!pageReady) return // the page applies them itself once it has booted (startReminders)
        web.resumeTimers()
        web.evaluateJavascript("typeof applyPhoneActions==='function'&&applyPhoneActions()", null)
        // In the background, the timers stop again once the save has had time to go out.
        if (!Reminders.appOnScreen) ui.postDelayed({ if (!Reminders.appOnScreen) web.pauseTimers() }, 8000)
    }

    @Deprecated("Still the way to handle Back on Android 7–12")
    override fun onBackPressed() {
        // js/core/back-nav.js mirrors the app's open layers as history entries.
        if (web.canGoBack()) web.goBack() else @Suppress("DEPRECATION") super.onBackPressed()
    }

    private fun setBars(color: String, light: Boolean) {
        val c = try { Color.parseColor(color) } catch (e: IllegalArgumentException) { return }
        canvas = c
        window.statusBarColor = c
        window.navigationBarColor = c
        if (pageVisible) { window.setBackgroundDrawable(ColorDrawable(c)); web.setBackgroundColor(c) }
        var flags = window.decorView.systemUiVisibility
        flags = if (light) flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR else flags and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
        if (Build.VERSION.SDK_INT >= 26) {
            flags = if (light) flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR else flags and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
        }
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = flags
    }

    private fun openOutside(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (e: ActivityNotFoundException) { /* nothing can open it */ }
    }

    private inner class Client : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = AppWeb.intercept(request)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (WebFiles.isAppPage(request.url)) return false
            openOutside(request.url) // the website's other pages, mail, phone, other sites
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            pageReady = true
            pendingJs?.let { web.evaluateJavascript(it, null); pendingJs = null }
        }

        // The page's first frame is on screen: the splash goes, and the
        // WebView takes the theme color (no see-through while it reloads).
        override fun onPageCommitVisible(view: WebView, url: String) {
            if (pageVisible) return
            pageVisible = true
            window.setBackgroundDrawable(ColorDrawable(canvas))
            web.setBackgroundColor(canvas)
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            recreate()
            return true
        }
    }

    private inner class Chrome : WebChromeClient() {
        // <input type="file"> (profile photo, attachments)
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try {
                startActivityForResult(params.createIntent(), REQ_FILE); true
            } catch (e: ActivityNotFoundException) {
                fileCallback = null; false
            }
        }
    }

    @Deprecated("Activity's own result callback; no AndroidX here")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
        } else @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == REQ_NOTIFY) answerPermission()
    }

    private fun notifyPermission(): String {
        val enabled = getSystemService(android.app.NotificationManager::class.java).areNotificationsEnabled()
        if (Build.VERSION.SDK_INT < 33) return if (enabled) "granted" else "denied"
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return if (enabled) "granted" else "denied"
        // Android asks twice at most; after that only Settings can allow it.
        val asked = prefs.getBoolean("notifyAsked", false)
        return if (asked && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) "denied" else "default"
    }

    private fun answerPermission() {
        web.evaluateJavascript("window.toojibeePermission&&window.toojibeePermission('${notifyPermission()}')", null)
    }

    /** window.ToojibeeAndroid — called from the page's JavaScript thread. */
    private inner class Bridge {
        @JavascriptInterface fun permission(): String = notifyPermission()

        @JavascriptInterface fun requestPermission() = ui.post {
            if (Build.VERSION.SDK_INT >= 33 && notifyPermission() == "default") {
                prefs.edit().putBoolean("notifyAsked", true).apply()
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
            } else answerPermission()
        }.let { }

        @JavascriptInterface fun schedule(json: String) = Reminders.save(this@MainActivity, json)

        @JavascriptInterface fun takeShown(): String = Reminders.takeShown(this@MainActivity)

        @JavascriptInterface fun show(title: String, body: String, tag: String, kind: String, id: String, date: String) =
            Reminders.show(this@MainActivity, title, body, tag, kind, id, date)

        @JavascriptInterface fun share(title: String, text: String) = ui.post {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text)
            try { startActivity(Intent.createChooser(send, getString(R.string.share_title))) } catch (e: ActivityNotFoundException) { }
        }.let { }

        @JavascriptInterface fun copy(text: String) = ui.post {
            // The web app shows its own "copied" toast.
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Toojibee", text))
        }.let { }

        @JavascriptInterface fun setBars(color: String, light: Boolean) = ui.post {
            prefs.edit().putString("barColor", color).putBoolean("barLight", light).apply()
            this@MainActivity.setBars(color, light)
        }.let { }

        // APK 1.1: the notification buttons' language, and ticks made outside the app.
        @JavascriptInterface fun setLang(lang: String) = Reminders.setLang(this@MainActivity, lang)
        @JavascriptInterface fun takeActions(): String = PhoneActions.take(this@MainActivity)
        @JavascriptInterface fun actionsApplied() {}
        @JavascriptInterface fun setWidgets(json: String) = Widgets.save(this@MainActivity, json)
    }
}
