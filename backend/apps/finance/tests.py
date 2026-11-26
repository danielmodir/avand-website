import uuid
from datetime import datetime, timezone

from django.test import TestCase

from .models import Account, Budget, Card, Category, LedgerEntry, MoneyTransaction
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
        Budget.objects.create(user_id=self.owner, client_id="food", name="Food", category=parent,
                              period="weekly", start_date="2026-01-01", amount_toman=200)
        post_transaction(self.owner, "opening", 1200, self.cash.id, "opening")
        post_transaction(self.stranger, "opening", 900, self.other.id, "other-opening")
        self.assertEqual(account_balance(self.owner, self.cash.id), 1200)
        purge_user(self.owner)
        self.assertFalse(Account.objects.filter(user_id=self.owner).exists())
        self.assertFalse(Card.objects.filter(user_id=self.owner).exists())
        self.assertFalse(Category.objects.filter(user_id=self.owner).exists())
        self.assertFalse(Budget.objects.filter(user_id=self.owner).exists())
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


class BudgetApiTests(ApiTestCase):
    url = "/api/v1/finance/budgets"

    def setUp(self):
        self.client = self.register()
        self.definition = {
            "client_id": "budget", "name": "Budget", "amount_toman": 100,
            "period": "weekly", "start_date": "2026-01-01", "rollover": True,
        }

    def create_budget(self, **changes):
        return self.client.post(self.url, {**self.definition, **changes}, format="json")

    def report(self, as_of, periods=6):
        response = self.client.get(self.url, {"as_of": as_of, "periods": periods})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["timezone"], "Asia/Tehran")
        return {row["client_id"]: row["periods"] for row in response.json()["budgets"]}

    def test_idempotence_validation_and_owner_scope(self):
        category = self.client.post("/api/v1/finance/categories",
            {"name": "Food", "client_id": "food", "kind": "expense"}, format="json").json()["id"]
        created = self.create_budget(category_id=category)
        self.assertEqual(created.status_code, 201)
        retry = self.create_budget(category_id=category)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json(), created.json())
        self.assertEqual(self.create_budget(category_id=category, amount_toman=110).status_code, 409)
        second = self.register(email="budget-other@example.com")
        self.assertEqual(second.get(self.url).json()["budgets"], [])
        self.assertEqual(second.post(self.url, {**self.definition, "category_id": category}, format="json").status_code, 404)
        self.assertEqual(second.post(self.url, self.definition, format="json").status_code, 201)
        for changes in (
            {"start_date": "2026-02-30"}, {"period": "yearly"}, {"rollover": "true"},
            {"end_date": "2026-01-02"}, {"period": "custom", "end_date": "2026-01-02"},
            {"period": "custom", "end_date": "2025-12-31", "rollover": False},
        ):
            self.assertEqual(self.create_budget(**changes).status_code, 400)
        self.assertEqual(self.client.get(self.url, {"periods": 25}).status_code, 400)

    def test_full_expense_history_scope_rollover_and_corrections(self):
        categories = "/api/v1/finance/categories"
        parent = self.client.post(categories,
            {"name": "Food", "client_id": "food", "kind": "expense"}, format="json").json()["id"]
        child = self.client.post(categories,
            {"name": "Cafe", "client_id": "cafe", "parent_id": parent, "kind": "expense"}, format="json").json()["id"]
        for key, category in (("global", None), ("parent", parent), ("child", child)):
            self.assertEqual(self.create_budget(client_id=key, category_id=category, amount_toman=200).status_code, 201)
        owner = Category.objects.get(id=parent).user_id
        template = {"user_id": owner, "kind": "expense", "amount_toman": 1,
                    "occurred_at": datetime(2026, 1, 1, tzinfo=timezone.utc), "category_id": child}
        MoneyTransaction.objects.bulk_create([MoneyTransaction(request_id=f"expense-{n}", **template) for n in range(101)])
        MoneyTransaction.objects.create(request_id="parent", **{**template, "category_id": parent, "amount_toman": 20})
        MoneyTransaction.objects.create(request_id="uncategorized", **{**template, "category_id": None, "amount_toman": 39})
        MoneyTransaction.objects.create(request_id="excluded-transfer", **{**template, "kind": "transfer", "amount_toman": 99})
        # 20:30 UTC starts Jan 8 in Tehran, exactly at the weekly boundary.
        MoneyTransaction.objects.create(request_id="boundary", **{**template, "amount_toman": 400,
            "occurred_at": datetime(2026, 1, 7, 20, 30, tzinfo=timezone.utc)})
        rows = self.report("2026-01-15")
        self.assertEqual([rows[key][2]["spent_toman"] for key in ("global", "parent", "child")], [160, 121, 101])
        self.assertEqual(rows["global"][2]["status"], "near_limit")
        self.assertEqual(rows["global"][1]["rollover_toman"], 40)
        self.assertEqual(rows["global"][1]["remaining_toman"], -160)
        self.assertEqual(rows["global"][1]["status"], "over_limit")
        self.assertEqual(rows["global"][0]["rollover_toman"], 0)
        # A later expense that was entered with a historical date changes the
        # affected closed period and its dependent period immediately.
        MoneyTransaction.objects.filter(request_id="boundary").update(amount_toman=100)
        self.assertEqual(self.report("2026-01-15", periods=1)["global"][0]["rollover_toman"], 140)
        self.assertEqual(self.report("2026-01-07")["global"][0]["spent_toman"], 160)

    def test_monthly_anniversary_custom_end_and_no_rollover(self):
        self.assertEqual(self.create_budget(client_id="monthly", period="monthly", start_date="2026-01-31",
                                            rollover=False).status_code, 201)
        self.assertEqual(self.create_budget(client_id="custom", period="custom", start_date="2026-03-01",
                                            end_date="2026-03-01", rollover=False).status_code, 201)
        self.assertEqual(self.report("2026-01-01"), {"monthly": [], "custom": []})
        reports = self.report("2026-03-31")
        self.assertEqual([(row["start_date"], row["end_date"], row["rollover_toman"]) for row in reports["monthly"]],
                         [("2026-03-31", "2026-04-29", 0), ("2026-02-28", "2026-03-30", 0), ("2026-01-31", "2026-02-27", 0)])
        self.assertEqual([(row["start_date"], row["end_date"]) for row in reports["custom"]], [("2026-03-01", "2026-03-01")])

    def test_report_rejects_aggregates_outside_exact_wire_range(self):
        limit = 9_000_000_000_000_000
        self.assertEqual(self.create_budget(amount_toman=limit + 1).status_code, 400)
        self.assertEqual(self.create_budget(amount_toman=limit).status_code, 201)
        self.assertEqual(self.report("2026-01-07")["budget"][0]["limit_toman"], limit)
        response = self.client.get(self.url, {"as_of": "2026-01-08"})
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["error"], "budget_total_limit")
