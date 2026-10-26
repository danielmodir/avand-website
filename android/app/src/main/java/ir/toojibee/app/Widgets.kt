package ir.toojibee.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.text.SpannableString
import android.text.style.StrikethroughSpan
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
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

    fun save(c: Context, json: String) {
        val d = JSONObject(json) // only valid data is kept
        File(c.filesDir, FILE).writeText(json)
        syncPeriodWidget(c, d)
        updateAll(c)
        scheduleMidnight(c)
    }

    fun load(c: Context): JSONObject? =
        try { JSONObject(File(c.filesDir, FILE).readText()) } catch (e: Exception) { null }

    fun todayKey() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    /** Also redraws the always-there date notification (Ongoing.kt). */
    fun updateAll(c: Context) {
        val m = AppWidgetManager.getInstance(c)
        for (cls in listOf(DateWidget::class.java, MonthWidget::class.java, DeskWidget::class.java, PeriodWidget::class.java)) {
            val ids = m.getAppWidgetIds(ComponentName(c, cls))
            if (ids.isNotEmpty()) update(c, m, cls, ids)
        }
        Ongoing.update(c, load(c))
    }

    fun update(c: Context, m: AppWidgetManager, cls: Class<*>, ids: IntArray) {
        val d = load(c)
        for (id in ids) {
            val views = when (cls) {
                DateWidget::class.java -> date(c, d)
                MonthWidget::class.java -> month(c, d, id, heightDp(m, id))
                DeskWidget::class.java -> desk(c, d, heightDp(m, id))
                else -> period(c, d)
            }
            m.updateAppWidget(id, framed(c, views, Look(d)))
        }
    }

    /** The widget's height on the home screen, in dp (portrait: the larger of the two the launcher gives). */
    private fun heightDp(m: AppWidgetManager, id: Int): Int {
        val o = m.getAppWidgetOptions(id)
        val h = maxOf(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT), o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT))
        return if (h > 0) h else 0
    }

    /** The period widget is offered (in the launcher's widget list) only to an
     *  account with the period desk; one already on the home screen stays. */
    private fun syncPeriodWidget(c: Context, d: JSONObject) {
        val cn = ComponentName(c, PeriodWidget::class.java)
        val placed = AppWidgetManager.getInstance(c).getAppWidgetIds(cn).isNotEmpty()
        val want = !d.has("periodDesk") || d.optBoolean("periodDesk") || placed
        val pm = c.packageManager
        val state = if (want) PackageManager.COMPONENT_ENABLED_STATE_DEFAULT else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        if (pm.getComponentEnabledSetting(cn) != state) pm.setComponentEnabledSetting(cn, state, PackageManager.DONT_KILL_APP)
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
    class Look(d: JSONObject?) {
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
        /** Day mode: a light widget (rows get a dark layer, not a light one). */
        val light = (Color.red(card) * 299 + Color.green(card) * 587 + Color.blue(card) * 114) / 1000 > 150
        val danger = Color.parseColor("#E5484D")
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
    fun openApp(c: Context, req: Int, date: String, kind: String = "", id: String = "", action: String = MainActivity.ACTION_REMINDER): PendingIntent {
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
        // Prayer times of the chosen city (the app's prayer.js; empty when switched off).
        val pray = day.optString("pray")
        v.setViewVisibility(R.id.pray, if (pray.isEmpty()) View.GONE else View.VISIBLE)
        v.setTextViewText(R.id.pray, pray)
        v.setTextColor(R.id.pray, look.muted)
        v.setOnClickPendingIntent(R.id.root, openApp(c, 2, key))
        return v
    }

    // ── the month ───────────────────────────────────────────────────────
    private fun monthOffsetKey(id: Int) = "month_off_$id"
    /** The arrows: by a month, or by the widget's weeks when it's small. */
    fun shiftCalendar(c: Context, id: Int, by: Int) {
        if (weeksFor(heightDp(AppWidgetManager.getInstance(c), id)) > 0) shiftWeeks(c, id, by) else shiftMonth(c, id, by)
    }
    private fun shiftMonth(c: Context, id: Int, by: Int) {
        val p = c.getSharedPreferences("widgets", Context.MODE_PRIVATE)
        p.edit().putInt(monthOffsetKey(id), p.getInt(monthOffsetKey(id), 0) + by).apply()
    }

    /** How many weeks fit the widget's height: 1, 2, 4, or 0 = the whole month. */
    private fun weeksFor(heightDp: Int) = when {
        heightDp == 0 -> 0 // the launcher didn't say: the month, as before
        heightDp < 150 -> 1
        heightDp < 240 -> 2
        heightDp < 340 -> 4
        else -> 0
    }

    private fun month(c: Context, d: JSONObject?, widgetId: Int, heightDp: Int): RemoteViews {
        val n = weeksFor(heightDp)
        val weeks = d?.optJSONObject("weeks")
        if (n > 0 && weeks != null) return weeksView(c, d, widgetId, n, weeks)
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

        weekdayRow(c, v, look, m.getJSONArray("weekdays"))
        v.removeAllViews(R.id.rows)
        val cells = m.getJSONArray("cells")
        for (r in 0 until cells.length() / 7) v.addView(R.id.rows, dayRow(c, look, cells, r * 7, key))
        return v
    }

    private fun weekdayRow(c: Context, v: RemoteViews, look: Look, wds: JSONArray) {
        v.removeAllViews(R.id.weekdays)
        for (i in 0 until wds.length()) {
            val w = RemoteViews(c.packageName, R.layout.widget_month_weekday)
            w.setTextViewText(R.id.wd, wds.getString(i)); w.setTextColor(R.id.wd, look.muted)
            v.addView(R.id.weekdays, w)
        }
    }

    /** Seven days from cells[from]: [date, number, other calendars, flags (1 this month, 2 holiday)]. */
    private fun dayRow(c: Context, look: Look, cells: JSONArray, from: Int, key: String): RemoteViews {
        val row = RemoteViews(c.packageName, R.layout.widget_month_row)
        for (k in 0 until 7) {
            val cell = cells.getJSONArray(from + k)
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
        return row
    }

    // ── the calendar made small: 1, 2 or 4 weeks from this one ──────────
    private fun weekOffsetKey(id: Int) = "week_off_$id"
    fun shiftWeeks(c: Context, id: Int, by: Int) {
        val p = c.getSharedPreferences("widgets", Context.MODE_PRIVATE)
        p.edit().putInt(weekOffsetKey(id), p.getInt(weekOffsetKey(id), 0) + by).apply()
    }

    private fun weeksView(c: Context, d: JSONObject, widgetId: Int, n: Int, weeks: JSONObject): RemoteViews {
        val look = Look(d)
        val key = todayKey()
        val list = weeks.getJSONArray("list")
        // This week = the one with today in it (the data may be a day or two old).
        var now = weeks.optInt("now")
        for (i in 0 until list.length()) {
            val cells = list.getJSONObject(i).getJSONArray("cells")
            for (k in 0 until 7) if (cells.getJSONArray(k).getString(0) == key) now = i
        }
        val p = c.getSharedPreferences("widgets", Context.MODE_PRIVATE)
        // The arrows move by the widget's own size (n weeks).
        val first = (now + p.getInt(weekOffsetKey(widgetId), 0) * n).coerceIn(0, maxOf(0, list.length() - n))
        val v = base(c, R.layout.widget_month, look)
        val week = list.getJSONObject(first)
        v.setTextViewText(R.id.title, week.optString("title")); v.setTextColor(R.id.title, look.text)
        v.setOnClickPendingIntent(R.id.title, openApp(c, 3, week.optString("first")))
        v.setImageViewResource(R.id.left, if (look.fa) R.drawable.widget_arrow else R.drawable.widget_arrow_left)
        v.setImageViewResource(R.id.right, if (look.fa) R.drawable.widget_arrow_left else R.drawable.widget_arrow)
        v.setInt(R.id.left, "setColorFilter", if (first > 0) look.text else look.muted)
        v.setInt(R.id.right, "setColorFilter", if (first < list.length() - n) look.text else look.muted)
        val nav = { action: String, req: Int ->
            PendingIntent.getBroadcast(c, req, Intent(c, MonthWidget::class.java).setAction(action).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        v.setOnClickPendingIntent(R.id.left, nav(PREV, widgetId * 2))
        v.setOnClickPendingIntent(R.id.right, nav(NEXT, widgetId * 2 + 1))
        // One week only: no room for the title bar, just the days' names and the days.
        v.setViewVisibility(R.id.head, if (n == 1) View.GONE else View.VISIBLE)
        weekdayRow(c, v, look, weeks.getJSONArray("weekdays"))
        v.removeAllViews(R.id.rows)
        for (w in first until minOf(first + n, list.length())) v.addView(R.id.rows, dayRow(c, look, list.getJSONObject(w).getJSONArray("cells"), 0, key))
        return v
    }

    // ── the planning desk ───────────────────────────────────────────────
    /** The day's plan as the app's planning desk shows it (items.js
     *  renderItemSections): Events, Tasks, Habits, each under its heading
     *  with its count; as many rows as the widget's height has room for. */
    private fun desk(c: Context, d: JSONObject?, heightDp: Int): RemoteViews {
        val look = Look(d)
        val key = todayKey()
        val plan = d?.optJSONObject("plan")?.optJSONObject(key) ?: return noData(c, R.layout.widget_desk, look, R.id.title)
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
        val rowBg = if (look.light) R.drawable.widget_row_bg_light else R.drawable.widget_row_bg
        var room = (if (heightDp > 0) heightDp else 250) - 70 // the padding and the title bar
        var hidden = 0
        val colors = d.optJSONObject("itemColors")
        val kindColor = { kind: String -> try { Color.parseColor(colors!!.getString(kind)) } catch (e: Exception) { look.primary } }
        fun section(label: String, count: Int): Boolean {
            if (count == 0) return false
            if (room < 26 + 42) { hidden += count; return false }
            room -= 26
            val s = RemoteViews(c.packageName, R.layout.widget_desk_section)
            s.setTextViewText(R.id.label, label); s.setTextColor(R.id.label, look.text)
            s.setTextViewText(R.id.count, look.digits(count.toString())); s.setTextColor(R.id.count, look.primary)
            s.setInt(R.id.count_bg, "setColorFilter", (look.primary and 0x00FFFFFF) or (0x29 shl 24))
            v.addView(R.id.list, s)
            return true
        }
        val events = plan.optJSONArray("events") ?: JSONArray()
        if (section(labels?.optString("events") ?: "", events.length())) {
            for (i in 0 until events.length()) {
                if (room < 42) { hidden += events.length() - i; break }
                room -= 42
                val e = events.getJSONObject(i)
                val row = RemoteViews(c.packageName, R.layout.widget_desk_event)
                row.setInt(R.id.row, "setBackgroundResource", rowBg)
                row.setInt(R.id.mark, "setColorFilter", kindColor("event"))
                row.setTextViewText(R.id.title, e.optString("title")); row.setTextColor(R.id.title, look.text)
                val time = e.optString("time")
                row.setViewVisibility(R.id.time, if (time.isEmpty()) View.GONE else View.VISIBLE)
                row.setTextViewText(R.id.time, time); row.setTextColor(R.id.time, look.primary)
                row.setOnClickPendingIntent(R.id.row, openApp(c, ("open|event|${e.optString("id")}").hashCode(), key, "event", e.optString("id")))
                v.addView(R.id.list, row)
            }
        }
        for ((kind, label) in listOf("task" to "tasks", "habit" to "habits")) {
            val items = plan.optJSONArray(label) ?: JSONArray()
            if (!section(labels?.optString(label) ?: "", items.length())) continue
            for (i in 0 until items.length()) {
                if (room < 46) { hidden += items.length() - i; break }
                room -= 46
                v.addView(R.id.list, itemRow(c, look, rowBg, kind, items.getJSONObject(i), key, kindColor(kind)))
            }
        }
        val any = events.length() + (plan.optJSONArray("tasks")?.length() ?: 0) + (plan.optJSONArray("habits")?.length() ?: 0) > 0
        v.setViewVisibility(R.id.empty, if (!any || hidden > 0) View.VISIBLE else View.GONE)
        v.setTextViewText(R.id.empty, if (!any) labels?.optString("nothing") ?: "" else "+" + look.digits(hidden.toString()))
        v.setTextColor(R.id.empty, look.muted)
        if (hidden > 0) v.setOnClickPendingIntent(R.id.empty, openApp(c, 4, key))
        return v
    }

    /** A task or habit row: the app's checkbox (✓ done in the kind's color, ✗ not done in red, struck-through title). */
    private fun itemRow(c: Context, look: Look, rowBg: Int, kind: String, it: JSONObject, key: String, color: Int): RemoteViews {
        val id = it.optString("id")
        val state = it.optString("state")
        val done = state == "done"; val notDone = state == "not_done"
        val row = RemoteViews(c.packageName, R.layout.widget_desk_row)
        row.setInt(R.id.row, "setBackgroundResource", rowBg)
        val title = SpannableString(it.optString("title"))
        if (done || notDone) title.setSpan(StrikethroughSpan(), 0, title.length, 0)
        row.setTextViewText(R.id.title, title)
        row.setTextColor(R.id.title, if (done || notDone) look.muted else look.text)
        val time = it.optString("time")
        row.setViewVisibility(R.id.time, if (time.isEmpty()) View.GONE else View.VISIBLE)
        row.setTextViewText(R.id.time, time); row.setTextColor(R.id.time, look.muted)
        row.setViewVisibility(R.id.star, if (it.optBoolean("pinned")) View.VISIBLE else View.GONE)
        row.setInt(R.id.star, "setColorFilter", look.primary)
        if (it.optBoolean("tick", true)) {
            val square = kind == "habit"
            val filled = done || notDone
            row.setImageViewResource(R.id.check_box, when {
                square && filled -> R.drawable.widget_square_fill
                square -> R.drawable.widget_square
                filled -> R.drawable.widget_dot
                else -> R.drawable.widget_ring
            })
            row.setInt(R.id.check_box, "setColorFilter", if (done) color else if (notDone) look.danger else look.muted)
            row.setViewVisibility(R.id.check_mark, if (filled) View.VISIBLE else View.GONE)
            row.setImageViewResource(R.id.check_mark, if (notDone) R.drawable.widget_x else R.drawable.widget_check)
            row.setInt(R.id.check_mark, "setColorFilter", if (notDone) Color.WHITE else contrastOn(color))
            val tick = Intent(c, ActionReceiver::class.java).setAction(TOGGLE)
                .putExtra("kind", kind).putExtra("id", id).putExtra("date", key).putExtra("done", !done)
            row.setOnClickPendingIntent(R.id.check, PendingIntent.getBroadcast(c, ("$kind|$id|$key").hashCode(), tick,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        } else row.setViewVisibility(R.id.check, View.GONE) // a counting/timed habit ticks itself in the app
        row.setOnClickPendingIntent(R.id.row, openApp(c, ("open|$kind|$id").hashCode(), key, kind, id))
        return row
    }

    /** Dark on a light color, white on a dark one (items.js colorIsLight). */
    private fun contrastOn(color: Int) =
        if ((Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000 > 160) Color.parseColor("#1A1708") else Color.WHITE

    /** A tick on the desk widget: shown at once, then applied by the app (PhoneActions). */
    fun toggle(c: Context, kind: String, id: String, date: String, done: Boolean) {
        val d = load(c)
        if (d != null) {
            d.optJSONObject("desk")?.optJSONArray(date)?.let { items ->
                for (i in 0 until items.length()) {
                    val it = items.getJSONObject(i)
                    if (it.optString("kind") == kind && it.optString("id") == id) it.put("done", done)
                }
            }
            d.optJSONObject("plan")?.optJSONObject(date)?.optJSONArray(if (kind == "task") "tasks" else "habits")?.let { items ->
                for (i in 0 until items.length()) {
                    val it = items.getJSONObject(i)
                    if (it.optString("id") == id) it.put("state", if (done) "done" else "")
                }
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
    /** Resized on the home screen: the calendar picks its weeks, the desk its rows. */
    override fun onAppWidgetOptionsChanged(c: Context, m: AppWidgetManager, id: Int, options: android.os.Bundle) {
        Widgets.update(c, m, javaClass, intArrayOf(id))
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
                Widgets.shiftCalendar(c, id, if (intent.action == Widgets.NEXT) 1 else -1)
                Widgets.update(c, AppWidgetManager.getInstance(c), MonthWidget::class.java, intArrayOf(id))
            }
            else -> super.onReceive(c, intent)
        }
    }
}
