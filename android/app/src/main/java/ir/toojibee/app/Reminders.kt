package ir.toojibee.app

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Reminders shown by the phone. The web app works out the upcoming list
 * (js/core/notify.js, syncAndroidSchedule: the next 7 days, the same items
 * Web Push sends the server) and hands it over whenever it changes. One
 * alarm is set, for the earliest one; when it goes off every reminder
 * that's due is shown and the alarm moves on to the next. Nothing goes
 * over the network.
 *
 * While the app is on screen the web app shows reminders itself (and a
 * toast), so the alarm only moves on, and everything due until the app
 * leaves the screen counts as handled ("until"). What was shown here is
 * remembered and handed back (takeShown) so the app doesn't show it again.
 * Both sides use the reminder's slot as the notification tag, so the rare
 * one both show replaces itself instead of appearing twice.
 */
object Reminders {
    private const val CHANNEL = "reminders"
    private const val LATE_LIMIT_MS = 2 * 3_600_000L  // a reminder missed by more (phone off) is dropped
    private const val SHOWN_KEEP_MS = 3 * 86_400_000L

    /** True while MainActivity is on screen (its WebView runs the reminders then). */
    @Volatile var appOnScreen = false

    private fun listFile(c: Context) = File(c.filesDir, "reminders.json")
    private fun prefs(c: Context) = c.getSharedPreferences("reminders", Context.MODE_PRIVATE)

    fun save(c: Context, json: String) {
        JSONArray(json) // only a valid list is kept
        listFile(c).writeText(json)
        scheduleNext(c)
    }

    private fun load(c: Context): JSONArray =
        try { JSONArray(listFile(c).readText()) } catch (e: Exception) { JSONArray() }

    private fun shownMap(c: Context): JSONObject =
        try { JSONObject(prefs(c).getString("shown", "{}")!!) } catch (e: Exception) { JSONObject() }

    /** The slots shown here since the app last asked, as a JSON array. */
    fun takeShown(c: Context): String {
        val map = shownMap(c)
        val out = JSONArray()
        map.keys().forEach { out.put(it) }
        return out.toString()
    }

    fun scheduleNext(c: Context) {
        val now = System.currentTimeMillis()
        val shown = shownMap(c)
        val items = load(c)
        var next = Long.MAX_VALUE
        for (i in 0 until items.length()) {
            val r = items.getJSONObject(i)
            val at = r.optLong("at")
            if (at > now && at < next && !shown.has(r.optString("slot"))) next = at
        }
        val am = c.getSystemService(AlarmManager::class.java)
        val pi = PendingIntent.getBroadcast(c, 0, Intent(c, ReminderReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        if (next == Long.MAX_VALUE) { am.cancel(pi); return }
        val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi)
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi)
    }

    /** The alarm went off (or the phone restarted): show what's due, move on. */
    fun fire(c: Context) {
        val now = System.currentTimeMillis()
        if (appOnScreen) markHandled(c, now)
        else {
            val until = prefs(c).getLong("until", 0)
            val shown = shownMap(c)
            val items = load(c)
            for (i in 0 until items.length()) {
                val r = items.getJSONObject(i)
                val at = r.optLong("at")
                val slot = r.optString("slot")
                if (at > now + 30_000 || at <= until || now - at > LATE_LIMIT_MS || shown.has(slot)) continue
                show(c, r.optString("title"), r.optString("body"), slot, r.optString("kind"), r.optString("id"), r.optString("date"), at)
                shown.put(slot, now)
            }
            val keys = shown.keys().asSequence().toList()
            keys.forEach { if (now - shown.optLong(it) > SHOWN_KEEP_MS) shown.remove(it) }
            prefs(c).edit().putString("shown", shown.toString()).putLong("until", now + 30_000).apply()
        }
        scheduleNext(c)
    }

    /** Reminders due up to `t` were the web app's to show. */
    fun markHandled(c: Context, t: Long) = prefs(c).edit().putLong("until", t).apply()

    fun show(c: Context, title: String, body: String, tag: String, kind: String, id: String, date: String, at: Long = System.currentTimeMillis()) {
        val nm = c.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            val ch = NotificationChannel(CHANNEL, c.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH)
            ch.enableVibration(true)
            nm.createNotificationChannel(ch)
        }
        val open = Intent(c, MainActivity::class.java)
            .setAction(MainActivity.ACTION_REMINDER)
            .putExtra("kind", kind).putExtra("id", id).putExtra("date", date)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(c, tag.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        @Suppress("DEPRECATION")
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, CHANNEL) else Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL)
        b.setSmallIcon(R.drawable.ic_notify)
            .setColor(Color.parseColor("#EB7D00"))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setWhen(at).setShowWhen(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pi)
        // «انجام شد» for a task or habit whose day has come (the app doesn't
        // tick days ahead); «بعداً یادم بنداز» for everything with an item.
        val words = localized(c)
        val extras = { action: String ->
            Intent(c, ActionReceiver::class.java).setAction(action)
                .putExtra("tag", tag).putExtra("kind", kind).putExtra("id", id).putExtra("date", date)
                .putExtra("title", title).putExtra("body", body)
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        if ((kind == "task" || kind == "habit") && id.isNotEmpty() && date.isNotEmpty() && date <= today && canTick(c, tag)) {
            @Suppress("DEPRECATION")
            b.addAction(Notification.Action.Builder(0, words.getString(R.string.action_done),
                PendingIntent.getBroadcast(c, (tag + "|done").hashCode(), extras(ActionReceiver.DONE), flags)).build())
        }
        if (id.isNotEmpty()) {
            @Suppress("DEPRECATION")
            b.addAction(Notification.Action.Builder(0, words.getString(R.string.action_later),
                PendingIntent.getBroadcast(c, (tag + "|later").hashCode(), extras(ActionReceiver.LATER), flags)).build())
        }
        nm.notify(tag, 1, b.build())
    }

    /** False for a habit that counts or times itself (the list says tick: false). */
    private fun canTick(c: Context, slot: String): Boolean {
        val items = load(c)
        for (i in 0 until items.length()) {
            val r = items.getJSONObject(i)
            if (r.optString("slot") == slot) return r.optBoolean("tick", true)
        }
        return true
    }

    /** The app's language (the web app tells it, setLang), for the buttons' words. */
    fun setLang(c: Context, lang: String) {
        if (lang == "fa" || lang == "en") c.getSharedPreferences("app", Context.MODE_PRIVATE).edit().putString("lang", lang).apply()
    }

    private fun localized(c: Context): Context {
        val lang = c.getSharedPreferences("app", Context.MODE_PRIVATE).getString("lang", null) ?: return c
        val conf = android.content.res.Configuration(c.resources.configuration)
        conf.setLocale(java.util.Locale(lang))
        return c.createConfigurationContext(conf)
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) = Reminders.fire(c)
}

/** Alarms don't survive a restart, and a clock/time-zone change moves them. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        Reminders.fire(c)
        Widgets.updateAll(c) // a new day, or a changed clock
        Widgets.scheduleMidnight(c)
    }
}
