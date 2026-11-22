from django.test import TestCase

from .models import Account, Card, Category, LedgerEntry, MoneyTransaction
from .services import LedgerError, account_balance, post_transaction, purge_user


class LedgerTests(TestCase):
    databases = "__all__"

    def setUp(self):
        self.cash = Account.objects.create(user_id=11, name="Cash", kind="cash")
        self.bank = Account.objects.create(user_id=11, name="Bank", kind="bank")
        self.other = Account.objects.create(user_id=22, name="Other", kind="cash")

    def test_opening_income_expense_and_transfer(self):
        post_transaction(11, "opening", 10000, self.cash.id, "open-1")
        post_transaction(11, "income", 3000, self.bank.id, "income-1")
        post_transaction(11, "expense", 2000, self.cash.id, "expense-1")
        transfer = post_transaction(11, "transfer", 4000, self.cash.id, "transfer-1", destination_id=self.bank.id)
        self.assertEqual(account_balance(11, self.cash.id), 4000)
        self.assertEqual(account_balance(11, self.bank.id), 7000)
        self.assertEqual(sum(transfer.entries.values_list("amount_toman", flat=True)), 0)
        self.assertEqual(MoneyTransaction.objects.filter(user_id=11).count(), 4)

    def test_request_is_idempotent_and_payload_bound(self):
        first = post_transaction(11, "income", 500, self.cash.id, "same-key")
        second = post_transaction(11, "income", 500, self.cash.id, "same-key")
        self.assertEqual(first.id, second.id)
        self.assertEqual(LedgerEntry.objects.filter(transaction=first).count(), 1)
        with self.assertRaises(LedgerError):
            post_transaction(11, "income", 600, self.cash.id, "same-key")

    def test_foreign_account_and_invalid_amount_are_rejected(self):
        with self.assertRaises(LedgerError):
            post_transaction(11, "income", 100, self.other.id, "foreign")
        with self.assertRaises(LedgerError):
            post_transaction(11, "transfer", 100, self.cash.id, "cross-owner", destination_id=self.other.id)
        for amount in (0, -1, 1.2, True, "100"):
            with self.assertRaises(LedgerError):
                post_transaction(11, "income", amount, self.cash.id, f"invalid-{amount}")
        self.assertEqual(MoneyTransaction.objects.count(), 0)

    def test_debt_or_saving_allocation_is_not_a_cash_flow(self):
        with self.assertRaises(LedgerError):
            post_transaction(11, "debt", 100, self.cash.id, "debt-1")
        with self.assertRaises(LedgerError):
            post_transaction(11, "saving", 100, self.cash.id, "saving-1")
        self.assertEqual(account_balance(11, self.cash.id), 0)

    def test_card_has_no_balance_and_purge_removes_only_owner_records(self):
        Card.objects.create(user_id=11, account=self.cash, label="Debit", masked_number="****1234")
        parent = Category.objects.create(user_id=11, name="Food", kind="expense")
        Category.objects.create(user_id=11, name="Cafe", kind="expense", parent=parent)
        post_transaction(11, "opening", 1200, self.cash.id, "opening")
        post_transaction(22, "opening", 900, self.other.id, "other-opening")
        self.assertEqual(account_balance(11, self.cash.id), 1200)
        purge_user(11)
        self.assertFalse(Account.objects.filter(user_id=11).exists())
        self.assertFalse(Card.objects.filter(user_id=11).exists())
        self.assertFalse(Category.objects.filter(user_id=11).exists())
        self.assertEqual(account_balance(22, self.other.id), 900)
