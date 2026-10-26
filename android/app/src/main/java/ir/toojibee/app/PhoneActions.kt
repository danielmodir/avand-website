package ir.toojibee.app

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject

/**
 * Ticks made outside the app — «انجام شد» on a reminder, a tick on the
 * planning widget — wait in a small queue until the web app applies them
 * (applyPhoneActions in frontend/demo/js/core/android.js), with the same
 * code as a tap in the app, and sends them to the server.
 *
 * Right away: if the app is open (even in the background) its page is
 * asked to apply them; otherwise a hidden copy of the page is started for
 * a few seconds and closed as soon as it's done. If that can't finish
 * (no account, no time), the queue is simply applied the next time the app
 * opens.
 */
object PhoneActions {
    private fun prefs(c: Context) = c.getSharedPreferences("actions", Context.MODE_PRIVATE)

    /** One tick; a later one for the same item and day replaces it. */
    @Synchronized fun add(c: Context, kind: String, id: String, date: String, done: Boolean) {
        val list = JSONArray(prefs(c).getString("queue", "[]"))
        val out = JSONArray()
        for (i in 0 until list.length()) {
            val a = list.getJSONObject(i)
            if (!(a.optString("kind") == kind && a.optString("id") == id && a.optString("date") == date)) out.put(a)
        }
        out.put(JSONObject().put("kind", kind).put("id", id).put("date", date).put("done", done))
        prefs(c).edit().putString("queue", out.toString()).apply()
    }

    @Synchronized fun take(c: Context): String {
        val q = prefs(c).getString("queue", "[]")!!
        prefs(c).edit().remove("queue").apply()
        return q
    }

    @Synchronized fun pending(c: Context) = prefs(c).getString("queue", "[]") != "[]"

    /** Apply the queue now: in the open app, or in a hidden page run as a
     *  job (a notification's broadcast must be done within seconds; a job
     *  may take the time the page needs to boot). */
    fun run(c: Context, done: BroadcastReceiver.PendingResult?) {
        Handler(Looper.getMainLooper()).post {
            val app = MainActivity.current?.get()
            if (app != null) app.applyPhoneActions()
            else {
                val job = JobInfo.Builder(JOB_ID, ComponentName(c, ActionJob::class.java))
                    .setOverrideDeadline(0).build()
                c.getSystemService(JobScheduler::class.java).schedule(job)
            }
            done?.finish()
        }
    }
    private const val JOB_ID = 41
}

/** Runs the hidden page for the queue (PhoneActions.run). */
class ActionJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        HiddenPage.open(applicationContext) { jobFinished(params, false) }
        return true
    }
    // Stopped early by the system: what's left waits for the next app open.
    override fun onStopJob(params: JobParameters): Boolean { HiddenPage.stop(); return false }
}

/**
 * The web app without a screen, for a few seconds: it boots from the
 * phone's files and the account's copy on the device, applies the queue,
 * syncs, and says so (actionsApplied) — then it's closed.
 */
object HiddenPage {
    private const val MAX_MS = 60_000L // a slow phone on a slow network still gets there
    private val ui = Handler(Looper.getMainLooper())
    private var web: WebView? = null
    private val waiting = mutableListOf<() -> Unit>()
    private val timeout = Runnable { close() }

    fun open(c: Context, done: () -> Unit) {
        waiting.add(done)
        if (web != null) return // already running: it takes the whole queue
        WebFiles.init(c)
        val w = WebView(c)
        AppWeb.setup(w)
        w.addJavascriptInterface(Bridge(c), "ToojibeeAndroid")
        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = AppWeb.intercept(request)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true // stays on the page
        }
        web = w
        w.loadUrl(WebFiles.START)
        ui.postDelayed(timeout, MAX_MS)
    }

    private fun close() {
        ui.removeCallbacks(timeout)
        web?.destroy()
        web = null
        val done = waiting.toList()
        waiting.clear()
        done.forEach { it() }
    }

    /** The job was stopped: close without reporting back. */
    fun stop() { waiting.clear(); close() }

    /** The parts of window.ToojibeeAndroid a page without a screen needs; the rest do nothing. */
    private class Bridge(private val c: Context) {
        @JavascriptInterface fun permission(): String =
            if (c.getSystemService(NotificationManager::class.java).areNotificationsEnabled()) "granted" else "denied"
        @JavascriptInterface fun requestPermission() {}
        // This page never leaves the app's start page (shouldOverrideUrlLoading = true);
        // its values are still size-capped like the screen's bridge (AppWeb).
        @JavascriptInterface fun schedule(json: String?) { AppWeb.json(json)?.let { Reminders.save(c, it) } }
        @JavascriptInterface fun takeShown(): String = Reminders.takeShown(c)
        @JavascriptInterface fun show(title: String?, body: String?, tag: String?, kind: String?, id: String?, date: String?) {} // the phone's alarms show them
        @JavascriptInterface fun share(title: String?, text: String?) {}
        @JavascriptInterface fun copy(text: String?) {}
        @JavascriptInterface fun setBars(color: String?, light: Boolean) {}
        @JavascriptInterface fun setLang(lang: String?) = Reminders.setLang(c, AppWeb.lang(lang))
        @JavascriptInterface fun takeActions(): String = PhoneActions.take(c)
        @JavascriptInterface fun setWidgets(json: String?) { AppWeb.json(json)?.let { try { Widgets.save(c, it) } catch (e: Exception) { /* not valid JSON: ignored */ } } }
        @JavascriptInterface fun actionsApplied() {
            ui.post {
                // A tick that came in meanwhile goes through the same page.
                if (PhoneActions.pending(c)) web?.evaluateJavascript("applyPhoneActions()", null) else close()
            }
        }
    }
}

/** The buttons on a reminder's notification. */
class ActionReceiver : BroadcastReceiver() {
    companion object {
        const val DONE = "ir.toojibee.app.DONE"
        const val LATER = "ir.toojibee.app.LATER"
        const val SHOW = "ir.toojibee.app.SHOW_AGAIN"
        const val LATER_MS = 15 * 60_000L
    }

    override fun onReceive(c: Context, intent: Intent) {
        val tag = intent.getStringExtra("tag") ?: ""
        val kind = intent.getStringExtra("kind") ?: ""
        val id = intent.getStringExtra("id") ?: ""
        val date = intent.getStringExtra("date") ?: ""
        when (intent.action) {
            DONE -> {
                c.getSystemService(NotificationManager::class.java).cancel(tag, 1)
                PhoneActions.add(c, kind, id, date, true)
                PhoneActions.run(c, goAsync())
            }
            LATER -> {
                c.getSystemService(NotificationManager::class.java).cancel(tag, 1)
                val again = Intent(c, ActionReceiver::class.java).setAction(SHOW).putExtras(intent)
                val pi = PendingIntent.getBroadcast(c, tag.hashCode(), again, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                val am = c.getSystemService(AlarmManager::class.java)
                val at = System.currentTimeMillis() + LATER_MS
                if (android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
            SHOW -> Reminders.show(c, intent.getStringExtra("title") ?: "", intent.getStringExtra("body") ?: "", tag, kind, id, date)
            Widgets.TOGGLE -> {
                Widgets.toggle(c, kind, id, date, intent.getBooleanExtra("done", true))
                PhoneActions.run(c, goAsync())
            }
        }
    }
}
