"""Owner-scoped financial records. All amounts are integer toman.

The wallet is the sum of account ledger balances; cards are references to an
account and never carry their own balance. There is no relation to core.User
because the core and finance databases are deliberately separate.
"""
from django.db import models
from django.db.models import Q


class Wallet(models.Model):
    """One lock row per owner serializes all account postings for exact totals."""
    user_id = models.UUIDField(unique=True)


class Account(models.Model):
    user_id = models.UUIDField(db_index=True)
    client_id = models.CharField(max_length=80, null=True, blank=True)
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=20, choices=[(x, x) for x in ("bank", "cash", "savings", "other")])
    color = models.CharField(max_length=32, blank=True)
    icon = models.CharField(max_length=40, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user_id", "archived_at"])]
        constraints = [models.UniqueConstraint(fields=["user_id", "client_id"], name="finance_account_request_once")]


class Card(models.Model):
    user_id = models.UUIDField(db_index=True)
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="cards")
    label = models.CharField(max_length=100)
    masked_number = models.CharField(max_length=32, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)


class Category(models.Model):
    user_id = models.UUIDField(db_index=True)
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=10, choices=[("income", "income"), ("expense", "expense")])
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    color = models.CharField(max_length=32, blank=True)
    icon = models.CharField(max_length=40, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)


class MoneyTransaction(models.Model):
    user_id = models.UUIDField(db_index=True)
    request_id = models.CharField(max_length=80)
    payload_hash = models.CharField(max_length=64)
    kind = models.CharField(max_length=16, choices=[(x, x) for x in ("opening", "income", "expense", "transfer", "adjustment", "debt_payment", "debt_receipt")])
    amount_toman = models.BigIntegerField()
    occurred_at = models.DateTimeField()
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.PROTECT)
    note = models.TextField(blank=True)
    source_id = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user_id", "request_id"], name="finance_request_once"),
            models.CheckConstraint(condition=Q(amount_toman__gt=0), name="finance_positive_amount"),
        ]
        indexes = [models.Index(fields=["user_id", "occurred_at"])]


class LedgerEntry(models.Model):
    user_id = models.UUIDField(db_index=True)
    transaction = models.ForeignKey(MoneyTransaction, on_delete=models.PROTECT, related_name="entries")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="entries")
    amount_toman = models.BigIntegerField()  # signed: debit negative, credit positive

    class Meta:
        constraints = [models.CheckConstraint(condition=~Q(amount_toman=0), name="finance_nonzero_entry")]
        indexes = [models.Index(fields=["user_id", "account"])]
