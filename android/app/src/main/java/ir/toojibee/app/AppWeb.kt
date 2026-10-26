package ir.toojibee.app

import android.annotation.SuppressLint
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView

/** What every WebView of the app shares: the screen's and the hidden page's (PhoneActions). */
object AppWeb {
    @SuppressLint("SetJavaScriptEnabled")
    fun setup(web: WebView) {
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            textZoom = 100 // the layout is the web app's; the phone's font size doesn't stretch it
            setSupportZoom(false)
            allowFileAccess = false
            allowContentAccess = false
            @Suppress("DEPRECATION") allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION") allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW // only https, never http inside an https page
            setGeolocationEnabled(false)
            @Suppress("DEPRECATION") saveFormData = false
            mediaPlaybackRequiresUserGesture = true
            userAgentString = "$userAgentString ToojibeeAndroid/${BuildConfig.VERSION_NAME}"
        }
    }

    /* ---- what the page may hand the bridge (window.ToojibeeAndroid) ----
       Every value from JavaScript is checked before use: a size cap, and for
       the few that are names, one of the known ones. */
    const val MAX_TEXT = 10_000          // a share / copy text, a notification line
    const val MAX_JSON = 2_000_000       // the reminders list, the widgets' data
    fun text(s: String?, max: Int = MAX_TEXT): String = (s ?: "").take(max)
    fun json(s: String?): String? = s?.takeIf { it.length <= MAX_JSON }
    fun lang(s: String?): String = if (s == "en") "en" else "fa"
    fun kind(s: String?): String = if (s == "task" || s == "habit" || s == "event") s else ""
    fun color(s: String?): String? = s?.takeIf { Regex("^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$").matches(it) }

    /** The bridge only answers the app's own page (https://toojibee.ir/demo/…), never another site. */
    @Volatile var trustedPage = false
    fun pageChanged(url: String?) { trustedPage = url != null && WebFiles.isAppPage(android.net.Uri.parse(url)) }

    /** The app's own files from the phone (WebFiles); everything else from the network. */
    fun intercept(request: WebResourceRequest): WebResourceResponse? =
        if (request.method == "GET") WebFiles.response(request.url) else null
}
