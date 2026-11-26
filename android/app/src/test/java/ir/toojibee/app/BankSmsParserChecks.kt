package ir.toojibee.app

/** Run on the JVM without an Android device or external test dependencies. */
object BankSmsParserChecks {
    @JvmStatic fun main(args: Array<String>) {
        val time = 1_789_000_000_000L
        val debit = """
            بانک نمونه
            حساب: ۱۲۳۴-۵۶۷۸-۹۰۰۱
            برداشت: ۱۲۳٬۴۵۰ ریال
            مانده: ٦٠٠٬٠٠٠ ريال
        """.trimIndent()
        val draft = checkNotNull(BankSmsParser.parse("30001234", debit, time))
        check(draft.direction == "debit")
        check(draft.money == BankSmsParser.Money(123450, "IRR"))
        check(draft.balance == BankSmsParser.Money(600000, "IRR"))
        check(draft.accountLast4 == "9001")
        check(draft.receivedAt == time && draft.confidence == "high")
        check(draft.id.matches(Regex("sms-[a-f0-9]{64}")))
        check(BankSmsParser.parse("30001234", debit, time)?.id == draft.id)
        check(BankSmsParser.parse("30001234", debit, time + 1000)?.id != draft.id)

        val credit = checkNotNull(BankSmsParser.parse("MELLAT", "واریز 25,000 تومان", time))
        check(credit.direction == "credit" && credit.money == BankSmsParser.Money(25000, "TOMAN"))
        check(credit.accountLast4 == null && credit.balance == null)
        val unknown = checkNotNull(BankSmsParser.parse("20001234", "کارت **1234\n+2,500\nمانده 88000", time))
        check(unknown.money == BankSmsParser.Money(2500, "UNKNOWN") && unknown.confidence == "review")

        check(BankSmsParser.parse("+989121234567", debit, time) == null)
        check(BankSmsParser.parse("30001234", "برداشت: 10000 ریال", time) == null)
        check(BankSmsParser.parse("30001234", "$debit\nرمز پویا: 886655", time) == null)
        check(BankSmsParser.parse("MELLAT", "کد تأیید: 123456", time) == null)
        check(BankSmsParser.parse("MELLAT", "$debit\nhttps://example.invalid", time) == null)
        check(BankSmsParser.parse("MELLAT", "برداشت +10000 ریال", time) == null)
        check(BankSmsParser.parse("MELLAT", "واریز +100- ریال", time) == null)
        check(BankSmsParser.parse("MELLAT", "برداشت 12,34 ریال", time) == null)
        check(BankSmsParser.parse("MELLAT", "برداشت 100 ریال\nواریز 100 ریال", time) == null)
        check(BankSmsParser.parse("MELLAT", "برداشت 9999999999999999999 ریال", time) == null)
        println("Bank SMS parser checks passed")
    }
}
