package ir.toojibee.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.Color
import android.os.Build
import org.json.JSONObject

/**
 * The always-there notification, like other calendar apps': today's date
 * (in the app's main calendar, with the others and the day's occasion under
 * it) and how many tasks, habits and events are left. Built from the same
 * data as the widgets (widgetData in frontend/demo/js/core/android.js),
 * days ahead, so it turns over at midnight without the app (Widgets'
 * midnight alarm, boot). Silent, no badge; switched off in the app's
 * Settings ("Date in the notifications", ongoingNotification).
 */
object Ongoing {
    private const val CHANNEL = "today"
    private const val ID = 4242

    fun update(c: Context, d: JSONObject?) {
        val nm = c.getSystemService(NotificationManager::class.java)
        val on = d?.optJSONObject("ongoing")
        val key = Widgets.todayKey()
        val day = d?.optJSONObject("days")?.optJSONObject(key)
        if (on == null || !on.optBoolean("on") || day == null) { nm.cancel(ID); return }
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            val ch = NotificationChannel(CHANNEL, c.getString(R.string.channel_today), NotificationManager.IMPORTANCE_LOW)
            ch.setShowBadge(false)
            ch.enableVibration(false)
            ch.setSound(null, null)
            nm.createNotificationChannel(ch)
        }
        val look = Widgets.Look(d)
        val title = "${day.optString("wd")} ${day.optString("big")} ${day.optString("month")}"
        val left = on.optJSONObject("days")?.optString(key).orEmpty()
        val occ = day.optJSONArray("occ")
        val occasions = (0 until (occ?.length() ?: 0)).map { occ!!.getString(it) }.joinToString(if (look.fa) "، " else ", ")
        val more = listOf(left, day.optString("other"), occasions).filter { it.isNotEmpty() }.joinToString("\n")
        @Suppress("DEPRECATION")
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, CHANNEL) else Notification.Builder(c).setPriority(Notification.PRIORITY_LOW)
        b.setSmallIcon(R.drawable.ic_notify)
            .setColor(Color.parseColor("#EB7D00"))
            .setContentTitle(title)
            .setContentText(left)
            .setStyle(Notification.BigTextStyle().bigText(more))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_STATUS)
            .setContentIntent(Widgets.openApp(c, 8, key))
        try { nm.notify(ID, b.build()) } catch (e: SecurityException) { /* notifications not allowed */ }
    }
}
