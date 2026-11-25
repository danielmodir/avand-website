import uuid

from django.test import TestCase

from .models import Account, Card, Category, LedgerEntry, MoneyTransaction
from .services import LedgerError, account_balance, post_transaction, purge_user
from apps.common.testing import ApiTestCase


class LedgerTests(TestCase):
    databases = "__all__"

    def setUp(self):
        self.owner = uuid.uuid4()
        self.stranger = uuid.uuid4()
        self.cash = Account.objects.create(user_id=self.owner, name="Cash", kind="cash")
        self.bank = Account.objects.create(user_id=self.owner, name="Bank", kind="bank")
        self.other = Account.objects.create(user_id=self.stranger, name="Other", kind="cash")

    def test_opening_income_expense_and_transfer(self):
        post_transaction(self.owner, "opening", 10000, self.cash.id, "open-1")
        post_transaction(self.owner, "income", 3000, self.bank.id, "income-1")
        post_transaction(self.owner, "expense", 2000, self.cash.id, "expense-1")
        transfer = post_transaction(self.owner, "transfer", 4000, self.cash.id, "transfer-1", destination_id=self.bank.id)
        self.assertEqual(account_balance(self.owner, self.cash.id), 4000)
        self.assertEqual(account_balance(self.owner, self.bank.id), 7000)
        self.assertEqual(sum(transfer.entries.values_list("amount_toman", flat=True)), 0)
        self.assertEqual(MoneyTransaction.objects.filter(user_id=self.owner).count(), 4)

    def test_request_is_idempotent_and_payload_bound(self):
        first = post_transaction(self.owner, "income", 500, self.cash.id, "same-key")
        second = post_transaction(self.owner, "income", 500, self.cash.id, "same-key")
        self.assertEqual(first.id, second.id)
        self.assertEqual(LedgerEntry.objects.filter(transaction=first).count(), 1)
        with self.assertRaises(LedgerError):
            post_transaction(self.owner, "income", 600, self.cash.id, "same-key")

    def test_foreign_account_and_invalid_amount_are_rejected(self):
        with self.assertRaises(LedgerError):
            post_transaction(self.owner, "income", 100, self.other.id, "foreign")
        with self.assertRaises(LedgerError):
            post_transaction(self.owner, "transfer", 100, self.cash.id, "cross-owner", destination_id=self.other.id)
        for amount in (0, -1, 1.2, True, "100"):
            with self.assertRaises(LedgerError):
                post_transaction(self.owner, "income", amount, self.cash.id, f"invalid-{amount}")
        self.assertEqual(MoneyTransaction.objects.count(), 0)

    def test_debt_or_saving_allocation_is_not_a_cash_flow(self):
        with self.assertRaises(LedgerError):
            post_transaction(self.owner, "debt", 100, self.cash.id, "debt-1")
        with self.assertRaises(LedgerError):
            post_transaction(self.owner, "saving", 100, self.cash.id, "saving-1")
        self.assertEqual(account_balance(self.owner, self.cash.id), 0)

    def test_aggregate_balance_remains_safe_for_web_integer_math(self):
        post_transaction(self.owner, "opening", 9_000_000_000_000_000, self.cash.id, "large-opening")
        with self.assertRaises(LedgerError):
            post_transaction(self.owner, "income", 1, self.cash.id, "overflow")
        self.assertEqual(account_balance(self.owner, self.cash.id), 9_000_000_000_000_000)

    def test_card_has_no_balance_and_purge_removes_only_owner_records(self):
        Card.objects.create(user_id=self.owner, account=self.cash, label="Debit", masked_number="****1234")
        parent = Category.objects.create(user_id=self.owner, name="Food", kind="expense")
        Category.objects.create(user_id=self.owner, name="Cafe", kind="expense", parent=parent)
        post_transaction(self.owner, "opening", 1200, self.cash.id, "opening")
        post_transaction(self.stranger, "opening", 900, self.other.id, "other-opening")
        self.assertEqual(account_balance(self.owner, self.cash.id), 1200)
        purge_user(self.owner)
        self.assertFalse(Account.objects.filter(user_id=self.owner).exists())
        self.assertFalse(Card.objects.filter(user_id=self.owner).exists())
        self.assertFalse(Category.objects.filter(user_id=self.owner).exists())
        self.assertEqual(account_balance(self.stranger, self.other.id), 900)


class FinanceApiTests(ApiTestCase):
    def setUp(self):
        self.client = self.register()

    def test_manual_ledger_and_retry(self):
        url = "/api/v1/finance/accounts"
        created = self.client.post(url, {"client_id": "account-1", "name": "Cash", "kind": "cash"}, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        account = created.json()["id"]
        retry = self.client.post(url, {"client_id": "account-1", "name": "Cash", "kind": "cash"}, format="json")
        self.assertEqual(retry.json()["id"], account)
        second = self.client.post(url, {"client_id": "account-2", "name": "Bank", "kind": "bank"}, format="json")
        self.assertEqual(second.status_code, 201, second.content)
        bank = second.json()["id"]
        tx = "/api/v1/finance/transactions"
        for body in (
            {"request_id": "opening", "kind": "opening", "amount_toman": 1000, "account_id": account},
            {"request_id": "income", "kind": "income", "amount_toman": 500, "account_id": account},
            {"request_id": "transfer", "kind": "transfer", "amount_toman": 300, "account_id": account, "destination_id": bank},
        ):
            response = self.client.post(tx, body, format="json")
            self.assertEqual(response.status_code, 201, response.content)
            self.assertEqual(self.client.post(tx, body, format="json").status_code, 200)
        data = self.client.get("/api/v1/finance/state").json()
        self.assertEqual(data["currency"], "TOMAN")
        self.assertEqual(data["wallet_balance_toman"], 1500)
        self.assertEqual({a["id"]: a["balance_toman"] for a in data["accounts"]}, {account: 1200, bank: 300})
        self.assertEqual(len(data["transactions"]), 3)

    def test_validation_and_ownership(self):
        account = self.client.post("/api/v1/finance/accounts", {"client_id": "my-a", "name": "Mine", "kind": "cash"}, format="json").json()["id"]
        self.assertEqual(self.client.post("/api/v1/finance/accounts", {"client_id": "my-a", "name": "Changed", "kind": "cash"}, format="json").status_code, 409)
        other = self.register(email="other@example.com")
        body = {"request_id": "cross-owner", "kind": "income", "amount_toman": 100, "account_id": account}
        self.assertEqual(other.post("/api/v1/finance/transactions", body, format="json").status_code, 404)
        self.assertEqual(other.get("/api/v1/finance/state").json()["accounts"], [])
        for bad in (1.2, "100", -1, 0, True):
            body["amount_toman"] = bad
            self.assertEqual(self.client.post("/api/v1/finance/transactions", body, format="json").status_code, 400)
        self.assertEqual(self.client.get("/api/v1/finance/state").json()["wallet_balance_toman"], 0)

    def test_custom_parent_category_and_transaction_link(self):
        url = "/api/v1/finance/categories"
        parent = self.client.post(url, {"client_id": "food", "name": "Food", "kind": "expense"}, format="json")
        self.assertEqual(parent.status_code, 201, parent.content)
        self.assertEqual(self.client.post(url, {"client_id": "food", "name": "Food", "kind": "expense"}, format="json").json()["id"], parent.json()["id"])
        child = self.client.post(url, {"client_id": "cafe", "name": "Cafe", "kind": "expense", "parent_id": parent.json()["id"]}, format="json")
        self.assertEqual(child.status_code, 201, child.content)
        account = self.client.post("/api/v1/finance/accounts", {"client_id": "cash", "name": "Cash", "kind": "cash"}, format="json").json()["id"]
        expense = self.client.post("/api/v1/finance/transactions", {"request_id": "coffee", "kind": "expense", "amount_toman": 500,
            "account_id": account, "category_id": child.json()["id"]}, format="json")
        self.assertEqual(expense.status_code, 201, expense.content)
        state = self.client.get("/api/v1/finance/state").json()
        self.assertEqual(state["transactions"][0]["category_id"], child.json()["id"])
        self.assertEqual(len(state["categories"]), 2)
        other = self.register(email="category-other@example.com")
        denied = other.post(url, {"client_id": "foreign-child", "name": "Child", "kind": "expense", "parent_id": parent.json()["id"]}, format="json")
        self.assertEqual(denied.status_code, 404)
