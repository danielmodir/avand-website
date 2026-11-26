package ir.toojibee.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Telephony
import org.json.JSONArray
import org.json.JSONObject

/** Private, per-install queue of masked drafts. No SMS inbox or network access. */
internal object BankSms {
    private const val LIMIT = 100
    private const val SEEN_LIMIT = 1000
    private val uidPattern = Regex("[A-Za-z0-9_-]{1,100}")
    private val idPattern = Regex("sms-[a-f0-9]{64}")
    private fun prefs(context: Context) = context.getSharedPreferences("bank-sms", Context.MODE_PRIVATE)
    private fun owner(context: Context) = prefs(context).getString("owner", null)
    fun validOwner(uid: String?) = uid != null && uidPattern.matches(uid)
    fun permitted(context: Context) =
        context.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

    @Synchronized
    fun status(context: Context, uid: String?): String {
        if (!validOwner(uid)) return "disabled"
        val owner = owner(context)
        if (owner != null && owner != uid) return "other-account"
        if (owner == uid && permitted(context)) return "enabled"
        return if (prefs(context).getString("denied", null) == uid || owner == uid) "denied" else "disabled"
    }

    @Synchronized
    fun setEnabled(context: Context, uid: String?, enabled: Boolean) {
        if (!validOwner(uid)) return
        val owner = owner(context)
        if (owner != null && owner != uid) return
        val edit = prefs(context).edit()
        if (!enabled) {
            if (owner == uid) edit.remove("owner").remove("queue")
            if (prefs(context).getString("denied", null) == uid) edit.remove("denied")
        } else if (permitted(context)) {
            edit.putString("owner", uid).remove("denied")
        } else {
            edit.putString("denied", uid)
        }
        edit.commit()
    }

    private fun read(context: Context, uid: String): JSONObject? {
        val sealed = prefs(context).getString("queue", null) ?: return JSONObject()
        return runCatching { JSONObject(FinanceCrypto.open(uid, sealed)) }.getOrNull()
    }

    private fun write(context: Context, uid: String, data: JSONObject): Boolean {
        val sealed = FinanceCrypto.seal(uid, data.toString())
        return sealed.isNotEmpty() && prefs(context).edit().putString("queue", sealed).commit()
    }

    @Synchronized
    fun drafts(context: Context, uid: String?): String {
        val current = uid ?: return "[]"
        if (status(context, current) != "enabled") return "[]"
        return read(context, current)?.optJSONArray("drafts")?.toString() ?: "[]"
    }

    @Synchronized
    fun dismiss(context: Context, uid: String?, id: String?): Boolean {
        val current = uid ?: return false
        if (id == null || !idPattern.matches(id) || status(context, current) != "enabled") return false
        val data = read(context, current) ?: return false
        val drafts = data.optJSONArray("drafts") ?: return false
        for (i in 0 until drafts.length()) {
            if (drafts.optJSONObject(i)?.optString("id") != id) continue
            drafts.remove(i)
            return write(context, current, data)
        }
        return true
    }

    @Synchronized
    fun receive(context: Context, intent: Intent): Boolean {
        val current = owner(context) ?: return false
        if (!permitted(context)) return false
        val parts = runCatching { Telephony.Sms.Intents.getMessagesFromIntent(intent) }.getOrNull() ?: return false
        val first = parts.firstOrNull() ?: return false
        val sender = first.originatingAddress ?: return false
        if (parts.size > 15 || parts.any { it == null || it.originatingAddress != sender }) return false
        val body = parts.joinToString("") { it.messageBody ?: "" }
        val draft = BankSmsParser.parse(sender, body, first.timestampMillis) ?: return false
        val data = read(context, current) ?: return false
        val seen = data.optJSONArray("seen") ?: JSONArray().also { data.put("seen", it) }
        if ((0 until seen.length()).any { seen.optString(it) == draft.id }) return false
        val drafts = data.optJSONArray("drafts") ?: JSONArray().also { data.put("drafts", it) }
        if (drafts.length() >= LIMIT ||
            (0 until drafts.length()).any { drafts.optJSONObject(it)?.optString("id") == draft.id }) return false
        val row = JSONObject()
            .put("id", draft.id).put("amount", draft.money.amount).put("unit", draft.money.unit)
            .put("direction", draft.direction).put("receivedAt", draft.receivedAt)
            .put("confidence", draft.confidence)
        draft.accountLast4?.let { row.put("accountLast4", it) }
        draft.balance?.let { row.put("balance", it.amount).put("balanceUnit", it.unit) }
        drafts.put(row)
        if (seen.length() >= SEEN_LIMIT) seen.remove(0)
        seen.put(draft.id)
        return write(context, current, data)
    }
}

class BankSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        if (BankSms.receive(context, intent)) MainActivity.current?.get()?.financeSmsChanged()
    }
}
