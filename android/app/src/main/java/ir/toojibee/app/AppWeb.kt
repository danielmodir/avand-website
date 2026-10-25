package ir.toojibee.app

import android.annotation.SuppressLint
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
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
            mediaPlaybackRequiresUserGesture = true
            userAgentString = "$userAgentString ToojibeeAndroid/${BuildConfig.VERSION_NAME}"
        }
    }

    /** The app's own files from the phone (WebFiles); everything else from the network. */
    fun intercept(request: WebResourceRequest): WebResourceResponse? =
        if (request.method == "GET") WebFiles.response(request.url) else null
}
