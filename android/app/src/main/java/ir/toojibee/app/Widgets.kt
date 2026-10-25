package ir.toojibee.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * The home-screen widgets: today's date, the month, the planning desk and
 * the period ring. The phone draws them (no WebView, so they cost nothing
 * while idle); what they show comes ready from the web app
 * (widgetData in frontend/demo/js/core/android.js), worked out by its own
 * calendar, occasion, desk and period code, days ahead — so they stay
 * right after midnight without the app being opened. They're redrawn when
 * that data changes, at midnight, and after a tick on the desk widget.
 */
object Widgets {
    private const val FILE = "widgets.json"
    const val TOGGLE = "ir.toojibee.app.WIDGET_TOGGLE"
    const val MIDNIGHT = "ir.toojibee.app.WIDGET_MIDNIGHT"
    const val PREV = "ir.toojibee.app.WIDGET_PREV"
    const val NEXT = "ir.toojibee.app.WIDGET_NEXT"
    const val ADD = "ir.toojibee.app.ADD"
    private const val MAX_ROWS = 7

    fun save(c: Context, json: String) {
        JSONObject(json) // only valid data is kept
        File(c.filesDir, FILE).writeText(json)
        updateAll(c)
        scheduleMidnight(c)
    }

    private fun load(c: Context): JSONObject? =
        try { JSONObject(File(c.filesDir, FILE).readText()) } catch (e: Exception) { null }

    private fun todayKey() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    fun updateAll(c: Context) {
        val m = AppWidgetManager.getInstance(c)
        for (cls in listOf(DateWidget::class.java, MonthWidget::class.java, DeskWidget::class.java, PeriodWidget::class.java)) {
            val ids = m.getAppWidgetIds(ComponentName(c, cls))
            if (ids.isNotEmpty()) update(c, m, cls, ids)
        }
    }

    fun update(c: Context, m: AppWidgetManager, cls: Class<*>, ids: IntArray) {
        val d = load(c)
        for (id in ids) {
            val views = when (cls) {
                DateWidget::class.java -> date(c, d)
                MonthWidget::class.java -> month(c, d, id)
                DeskWidget::class.java -> desk(c, d)
                else -> period(c, d)
            }
            m.updateAppWidget(id, framed(c, views, Look(d)))
        }
    }

    /** Redraw just after midnight: the data already has the new day. */
    fun scheduleMidnight(c: Context) {
        val next = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 30)
        }
        val pi = PendingIntent.getBroadcast(c, 7, Intent(c, DateWidget::class.java).setAction(MIDNIGHT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        c.getSystemService(AlarmManager::class.java).set(AlarmManager.RTC, next.timeInMillis, pi)
    }

    // ── shared bits ─────────────────────────────────────────────────────
    private class Look(d: JSONObject?) {
        val fa = d?.optString("lang") != "en"
        private val colors = d?.optJSONObject("colors")
        private fun color(name: String, fallback: Int) = try { Color.parseColor(colors!!.getString(name)) } catch (e: Exception) { fallback }
        val card = color("card", Color.parseColor("#2E2910"))
        val text = color("text", Color.parseColor("#F5F0D2"))
        val muted = color("muted", Color.parseColor("#A8EBE3A7"))
        val primary = color("primary", Color.parseColor("#EB7D00"))
        val onPrimary = color("onPrimary", Color.parseColor("#2E2910"))
        val holiday = color("holiday", Color.parseColor("#F0937A"))
        /** Days of the months around this one, faded like the app's .other-month. */
        val faded = (muted and 0x00FFFFFF) or (0x55 shl 24)
        fun digits(s: String) = if (fa) s.map { if (it in '0'..'9') '۰' + (it - '0') else it }.joinToString("") else s
    }

    private fun base(c: Context, layout: Int, look: Look): RemoteViews {
        val v = RemoteViews(c.packageName, layout)
        v.setInt(R.id.bg, "setColorFilter", look.card)
        return v
    }

    /** The app's direction (Persian right-to-left), whatever the phone's language:
     *  the widget sits in a frame that has it, and everything inside follows. */
    private fun framed(c: Context, v: RemoteViews, look: Look): RemoteViews {
        val frame = RemoteViews(c.packageName, if (look.fa) R.layout.widget_frame_rtl else R.layout.widget_frame_ltr)
        frame.addView(R.id.frame, v)
        return frame
    }

    /** The app, on a day (and an item's details), like a tapped reminder. */
    private fun openApp(c: Context, req: Int, date: String, kind: String = "", id: String = "", action: String = MainActivity.ACTION_REMINDER): PendingIntent {
        val i = Intent(c, MainActivity::class.java).setAction(action)
            .putExtra("kind", kind).putExtra("id", id).putExtra("date", date)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun noData(c: Context, layout: Int, look: Look, textId: Int): RemoteViews {
        val v = base(c, layout, look)
        v.setTextViewText(textId, if (look.fa) "توجیبی رو یه بار باز کن" else "Open Toojibee once")
        v.setTextColor(textId, look.muted)
        v.setOnClickPendingIntent(R.id.root, openApp(c, 1, todayKey()))
        return v
    }

    // ── today's date ────────────────────────────────────────────────────
    private fun date(c: Context, d: JSONObject?): RemoteViews {
        val look = Look(d)
        val key = todayKey()
        val day = d?.optJSONObject("days")?.optJSONObject(key) ?: return noData(c, R.layout.widget_date, look, R.id.weekday)
        val v = base(c, R.layout.widget_date, look)
        v.setTextViewText(R.id.big, day.optString("big")); v.setTextColor(R.id.big, if (day.optBoolean("holiday")) look.holiday else look.primary)
        v.setTextViewText(R.id.weekday, day.optString("wd")); v.setTextColor(R.id.weekday, look.text)
        v.setTextViewText(R.id.month, day.optString("month")); v.setTextColor(R.id.month, look.muted)
        v.setTextViewText(R.id.other, day.optString("other")); v.setTextColor(R.id.other, look.muted)
        val occ = day.optJSONArray("occ")
        val names = (0 until (occ?.length() ?: 0)).map { occ!!.getString(it) }
        v.setViewVisibility(R.id.occ, if (names.isEmpty()) View.GONE else View.VISIBLE)
        v.setTextViewText(R.id.occ, names.joinToString(if (look.fa) "، " else ", "))
        v.setTextColor(R.id.occ, if (day.optBoolean("holiday")) look.holiday else look.text)
        v.setOnClickPendingIntent(R.id.root, openApp(c, 2, key))
        return v
    }

    // ── the month ───────────────────────────────────────────────────────
    private fun monthOffsetKey(id: Int) = "month_off_$id"
    fun shiftMonth(c: Context, id: Int, by: Int) {
        val p = c.getSharedPreferences("widgets", Context.MODE_PRIVATE)
        p.edit().putInt(monthOffsetKey(id), p.getInt(monthOffsetKey(id), 0) + by).apply()
    }

    private fun month(c: Context, d: JSONObject?, widgetId: Int): RemoteViews {
        val look = Look(d)
        val key = todayKey()
        val months = d?.optJSONArray("months") ?: return noData(c, R.layout.widget_month, look, R.id.title)
        // This month = the one whose own days include today.
        var current = -1
        for (i in 0 until months.length()) {
            val cells = months.getJSONObject(i).getJSONArray("cells")
            for (k in 0 until cells.length()) { val cell = cells.getJSONArray(k); if (cell.getString(0) == key && cell.getInt(3) and 1 == 1) current = i }
        }
        if (current < 0) return noData(c, R.layout.widget_month, look, R.id.title)
        val p = c.getSharedPreferences("widgets", Context.MODE_PRIVATE)
        val idx = (current + p.getInt(monthOffsetKey(widgetId), 0)).coerceIn(0, months.length() - 1)
        p.edit().putInt(monthOffsetKey(widgetId), idx - current).apply()
        val m = months.getJSONObject(idx)

        val v = base(c, R.layout.widget_month, look)
        v.setTextViewText(R.id.title, m.optString("title")); v.setTextColor(R.id.title, look.text)
        v.setOnClickPendingIntent(R.id.title, openApp(c, 3, m.optString("first")))
        // Previous comes first: on the right in Persian, pointing outward.
        v.setImageViewResource(R.id.left, if (look.fa) R.drawable.widget_arrow else R.drawable.widget_arrow_left)
        v.setImageViewResource(R.id.right, if (look.fa) R.drawable.widget_arrow_left else R.drawable.widget_arrow)
        v.setInt(R.id.left, "setColorFilter", if (idx > 0) look.text else look.muted)
        v.setInt(R.id.right, "setColorFilter", if (idx < months.length() - 1) look.text else look.muted)
        val nav = { action: String, req: Int ->
            PendingIntent.getBroadcast(c, req, Intent(c, MonthWidget::class.java).setAction(action).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        v.setOnClickPendingIntent(R.id.left, nav(PREV, widgetId * 2))
        v.setOnClickPendingIntent(R.id.right, nav(NEXT, widgetId * 2 + 1))

        v.removeAllViews(R.id.weekdays)
        val wds = m.getJSONArray("weekdays")
        for (i in 0 until wds.length()) {
            val w = RemoteViews(c.packageName, R.layout.widget_month_weekday)
            w.setTextViewText(R.id.wd, wds.getString(i)); w.setTextColor(R.id.wd, look.muted)
            v.addView(R.id.weekdays, w)
        }
        v.removeAllViews(R.id.rows)
        val cells = m.getJSONArray("cells")
        for (r in 0 until cells.length() / 7) {
            val row = RemoteViews(c.packageName, R.layout.widget_month_row)
            for (k in 0 until 7) {
                val cell = cells.getJSONArray(r * 7 + k)
                val date = cell.getString(0)
                val flags = cell.getInt(3)
                val inMonth = flags and 1 == 1
                val isToday = date == key
                val cv = RemoteViews(c.packageName, R.layout.widget_month_cell)
                cv.setTextViewText(R.id.num, cell.getString(1))
                cv.setTextViewText(R.id.sub, cell.getString(2))
                val numColor = when {
                    isToday -> look.onPrimary
                    !inMonth -> look.faded
                    flags and 2 == 2 -> look.holiday
                    else -> look.text
                }
                cv.setTextColor(R.id.num, numColor)
                cv.setTextColor(R.id.sub, if (isToday) look.onPrimary else if (inMonth) look.muted else look.faded)
                if (isToday) { cv.setViewVisibility(R.id.today, View.VISIBLE); cv.setInt(R.id.today, "setColorFilter", look.primary) }
                cv.setOnClickPendingIntent(R.id.cell, openApp(c, date.hashCode(), date))
                row.addView(R.id.row, cv)
            }
            v.addView(R.id.rows, row)
        }
        return v
    }

    // ── the planning desk ───────────────────────────────────────────────
    private fun desk(c: Context, d: JSONObject?): RemoteViews {
        val look = Look(d)
        val key = todayKey()
        val items = d?.optJSONObject("desk")?.optJSONArray(key) ?: return noData(c, R.layout.widget_desk, look, R.id.title)
        val labels = d.optJSONObject("labels")
        val day = d.optJSONObject("days")?.optJSONObject(key)
        val v = base(c, R.layout.widget_desk, look)
        val title = listOfNotNull(labels?.optString("planning"), day?.let { "${it.optString("wd")} ${it.optString("big")}" }).joinToString(" · ")
        v.setTextViewText(R.id.title, title); v.setTextColor(R.id.title, look.text)
        v.setOnClickPendingIntent(R.id.title, openApp(c, 4, key))
        v.setInt(R.id.add_bg, "setColorFilter", look.primary)
        v.setInt(R.id.add_icon, "setColorFilter", look.onPrimary)
        v.setOnClickPendingIntent(R.id.add, openApp(c, 5, key, action = ADD))
        v.removeAllViews(R.id.list)
        val n = minOf(items.length(), MAX_ROWS)
        for (i in 0 until n) {
            val it = items.getJSONObject(i)
            val kind = it.optString("kind"); val id = it.optString("id"); val done = it.optBoolean("done")
            val row = RemoteViews(c.packageName, R.layout.widget_desk_row)
            val color = try { Color.parseColor(it.optString("color")) } catch (e: Exception) { look.primary }
            row.setInt(R.id.mark, "setColorFilter", color)
            row.setTextViewText(R.id.title, it.optString("title"))
            row.setTextColor(R.id.title, if (done) look.muted else look.text)
            row.setTextViewText(R.id.time, look.digits(it.optString("time")))
            row.setTextColor(R.id.time, look.muted)
            if ((kind == "task" || kind == "habit") && it.optBoolean("tick", true)) {
                row.setImageViewResource(R.id.check_box, if (done) R.drawable.widget_dot else R.drawable.widget_ring)
                row.setInt(R.id.check_box, "setColorFilter", if (done) look.primary else look.muted)
                row.setViewVisibility(R.id.check_mark, if (done) View.VISIBLE else View.GONE)
                row.setInt(R.id.check_mark, "setColorFilter", look.onPrimary)
                val tick = Intent(c, ActionReceiver::class.java).setAction(TOGGLE)
                    .putExtra("kind", kind).putExtra("id", id).putExtra("date", key).putExtra("done", !done)
                row.setOnClickPendingIntent(R.id.check, PendingIntent.getBroadcast(c, ("$kind|$id|$key").hashCode(), tick,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            } else row.setViewVisibility(R.id.check, View.GONE)
            row.setOnClickPendingIntent(R.id.row, openApp(c, ("open|$kind|$id").hashCode(), key, kind, id))
            v.addView(R.id.list, row)
        }
        v.setViewVisibility(R.id.empty, if (n == 0) View.VISIBLE else View.GONE)
        v.setTextViewText(R.id.empty, labels?.optString("nothing") ?: "")
        v.setTextColor(R.id.empty, look.muted)
        return v
    }

    /** A tick on the desk widget: shown at once, then applied by the app (PhoneActions). */
    fun toggle(c: Context, kind: String, id: String, date: String, done: Boolean) {
        val d = load(c)
        val items = d?.optJSONObject("desk")?.optJSONArray(date)
        if (items != null) {
            for (i in 0 until items.length()) {
                val it = items.getJSONObject(i)
                if (it.optString("kind") == kind && it.optString("id") == id) it.put("done", done)
            }
            File(c.filesDir, FILE).writeText(d.toString())
            updateAll(c)
        }
        PhoneActions.add(c, kind, id, date, done)
    }

    // ── the period ring ─────────────────────────────────────────────────
    private fun period(c: Context, d: JSONObject?): RemoteViews {
        val look = Look(d)
        val key = todayKey()
        val p = d?.optJSONObject("period")
        val today = p?.optJSONObject("days")?.optJSONObject(key)
        val v = base(c, R.layout.widget_period, look)
        v.setOnClickPendingIntent(R.id.root, openApp(c, 6, key))
        if (p == null || today == null) {
            v.setTextViewText(R.id.main, d?.optJSONObject("labels")?.optString("period") ?: "")
            v.setTextColor(R.id.main, look.muted)
            v.setTextViewText(R.id.sub, if (look.fa) "از میز پریود توی اپ تنظیمش کن" else "Set it up on the period desk")
            v.setTextColor(R.id.sub, look.muted)
            return v
        }
        v.setImageViewBitmap(R.id.ring, ring(p, today.optInt("idx"), look))
        v.setTextViewText(R.id.main, today.optString("main")); v.setTextColor(R.id.main, look.text)
        v.setTextViewText(R.id.sub, today.optString("sub")); v.setTextColor(R.id.sub, look.muted)
        return v
    }

    /** The period desk's ring (period.js periodWheelSvg): arcs per phase, today's dot. */
    private fun ring(p: JSONObject, idx: Int, look: Look): Bitmap {
        val size = 360
        val len = p.optInt("len", 28).coerceAtLeast(1)
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        val stroke = size * 0.075f
        val r = size / 2f - stroke
        val box = RectF(size / 2f - r, size / 2f - r, size / 2f + r, size / 2f + r)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; strokeCap = Paint.Cap.ROUND }
        val gap = 360f * 0.035f / (2 * Math.PI.toFloat()) * 2 // the same gap as the app's ring, in degrees
        val arcs = p.optJSONArray("arcs")
        // The ring runs clockwise from the top in both languages, like the app's.
        for (i in 0 until (arcs?.length() ?: 0)) {
            val a = arcs!!.getJSONObject(i)
            paint.color = try { Color.parseColor(a.optString("color")) } catch (e: Exception) { look.muted }
            val start = a.optInt("start") * 360f / len - 90f + gap / 2
            val sweep = a.optInt("len") * 360f / len - gap
            if (sweep > 0) cv.drawArc(box, start, sweep, false, paint)
        }
        val ta = Math.toRadians(((idx + 0.5) * 360.0 / len) - 90.0)
        val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = look.text }
        cv.drawCircle(size / 2f + r * Math.cos(ta).toFloat(), size / 2f + r * Math.sin(ta).toFloat(), stroke * 0.42f, dot)
        return bmp
    }
}

/** The four widgets: each redraws from Widgets' data. */
open class BaseWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) {
        Widgets.update(c, m, javaClass, ids)
        Widgets.scheduleMidnight(c)
    }
    override fun onReceive(c: Context, intent: Intent) {
        if (intent.action == Widgets.MIDNIGHT) { Widgets.updateAll(c); Widgets.scheduleMidnight(c); return }
        super.onReceive(c, intent)
    }
}
class DateWidget : BaseWidget()
class DeskWidget : BaseWidget()
class PeriodWidget : BaseWidget()
class MonthWidget : BaseWidget() {
    override fun onReceive(c: Context, intent: Intent) {
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)
        when (intent.action) {
            Widgets.PREV, Widgets.NEXT -> {
                Widgets.shiftMonth(c, id, if (intent.action == Widgets.NEXT) 1 else -1)
                Widgets.update(c, AppWidgetManager.getInstance(c), MonthWidget::class.java, intArrayOf(id))
            }
            else -> super.onReceive(c, intent)
        }
    }
}
