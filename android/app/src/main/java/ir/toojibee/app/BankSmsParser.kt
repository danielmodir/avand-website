package ir.toojibee.app

import java.security.MessageDigest
import java.util.Locale

/** A conservative recognizer for structured Iranian bank alerts. */
internal object BankSmsParser {
    data class Money(val amount: Long, val unit: String)
    data class Draft(
        val id: String, val money: Money, val direction: String, val receivedAt: Long,
        val accountLast4: String?, val balance: Money?, val confidence: String
    )

    private val serviceSender = Regex("(?:[0-9]{3,8}|(?:\\+98)?(?:1000|2000|3000|5000)[0-9]{3,9}|(?:\\+98)?9000[0-9]{3,9})")
    private val bankSender = Regex("(?:BANK[ _-]?[A-Z]{2,20}|SEPAH|MELLAT|MELLI|SADERAT|TEJARAT|PASARGAD|SAMAN|REFAH|RESALAT|MEHRIRAN)")
    private val otp = Regex("رمز|کد[ \\t]*(?:تایید|تأیید|ورود|فعال سازی|پویا)|یک[ \\t]*بار[ \\t]*مصرف|\\b(?:otp|verification code|one.time password|passcode)\\b", RegexOption.IGNORE_CASE)
    private val link = Regex("https?://|www\\.", RegexOption.IGNORE_CASE)
    private const val number = "(?:[0-9]{1,3}(?:[,٬ ][0-9]{3})+|[0-9]+)"
    private const val unit = "(ریال|ريال|تومان|IRR|TOMAN)"
    private val movement = Regex("^\\s*(برداشت|واریز|خرید|دریافت|debit|credit)\\s*(?:مبلغ\\s*)?[:：]?\\s*([+-]?)\\s*($number)\\s*([+-]?)\\s*$unit?\\s*$", RegexOption.IGNORE_CASE)
    private val signed = Regex("^\\s*(?:مبلغ\\s*[:：]?\\s*)?([+-]?)\\s*($number)\\s*([+-]?)\\s*$unit?\\s*$", RegexOption.IGNORE_CASE)
    private val remaining = Regex("^\\s*(?:مانده(?: حساب| قابل برداشت)?|موجودی|balance)\\s*[:：]?\\s*($number)\\s*$unit?\\s*$", RegexOption.IGNORE_CASE)
    private val account = Regex("^\\s*(?:شماره\\s*)?(?:حساب|کارت|سپرده|account|card)\\s*[:：]?\\s*([0-9*xX•-]{4,40})\\s*$", RegexOption.IGNORE_CASE)
    private val bankHeader = Regex("^\\s*بانک[ \\t]+[آ-ی ]{2,30}\\s*$")
    private val last4 = Regex("[0-9]{4}$")
    private val formatting = Regex("[\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]")

    private fun normalize(text: String): String = formatting.replace(text, "").map { char ->
        when (char) {
            in '۰'..'۹' -> '0' + (char - '۰')
            in '٠'..'٩' -> '0' + (char - '٠')
            'ي', 'ى' -> 'ی'
            'ك' -> 'ک'
            '\u200c', '\u00a0' -> ' '
            '−' -> '-'
            else -> char
        }
    }.joinToString("")

    private fun money(value: String, rawUnit: String): Money? {
        val amount = value.filter { it in '0'..'9' }.toLongOrNull()?.takeIf { it <= 9_007_199_254_740_991L } ?: return null
        val unit = when (rawUnit.uppercase(Locale.ROOT)) {
            "ریال", "IRR" -> "IRR"
            "تومان", "TOMAN" -> "TOMAN"
            else -> "UNKNOWN"
        }
        return Money(amount, unit)
    }

    fun parse(sender: String, text: String, timestamp: Long): Draft? {
        val address = normalize(sender).trim().uppercase(Locale.ROOT)
        val namedBank = bankSender.matches(address)
        if ((!namedBank && !serviceSender.matches(address)) || text.length !in 1..2000 || timestamp <= 0) return null
        val body = normalize(text).trim()
        if (otp.containsMatchIn(body) || link.containsMatchIn(body)) return null
        val lines = body.lines().map { it.trim() }.filter { it.isNotEmpty() }
        val accountLine = lines.mapNotNull(account::matchEntire).singleOrNull()
        val balanceLine = lines.mapNotNull(remaining::matchEntire).singleOrNull()
        if (!namedBank && lines.none(bankHeader::matches) && (accountLine == null || balanceLine == null)) return null
        val movements = lines.mapNotNull(movement::matchEntire)
        val parsed = movements.singleOrNull()
        val signOnly = if (movements.isEmpty()) {
            lines.mapNotNull(signed::matchEntire)
                .filter { it.groupValues[1].isNotEmpty() || it.groupValues[3].isNotEmpty() }.singleOrNull()
        } else null
        val expected = when (parsed?.groupValues?.get(1)?.lowercase(Locale.ROOT)) {
            "برداشت", "خرید", "debit" -> "debit"
            "واریز", "دریافت", "credit" -> "credit"
            else -> null
        }
        val fields = parsed?.groupValues?.drop(2) ?: signOnly?.groupValues?.drop(1) ?: return null
        val (before, amount, after, currency) = fields
        if (before.isNotEmpty() && after.isNotEmpty()) return null
        val indicated = when (before + after) { "+" -> "credit"; "-" -> "debit"; else -> null }
        if (expected != null && indicated != null && expected != indicated) return null
        val direction = expected ?: indicated ?: return null
        val transaction = money(amount, currency)?.takeIf { it.amount > 0 } ?: return null
        val balance = balanceLine?.let { money(it.groupValues[1], it.groupValues[2]) }
        val suffix = accountLine?.let { last4.find(it.groupValues[1])?.value }
        val fingerprint = listOf(address, timestamp, direction, transaction.amount, transaction.unit,
            suffix, balance?.amount, balance?.unit).joinToString("\n")
        val hash = MessageDigest.getInstance("SHA-256")
            .digest(fingerprint.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(Locale.ROOT, it) }
        val confidence = if (expected != null && transaction.unit != "UNKNOWN") "high" else "review"
        return Draft("sms-$hash", transaction, direction, timestamp, suffix, balance, confidence)
    }
}
