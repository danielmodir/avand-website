"""Atomic posting boundary for actual money movements."""
import hashlib
import json

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from .models import Account, Card, Category, LedgerEntry, MoneyTransaction

DB = "finance"
KINDS = {"opening", "income", "expense", "transfer"}


class LedgerError(ValueError):
    pass


def account_balance(user_id, account_id):
    if not Account.objects.using(DB).filter(id=account_id, user_id=user_id).exists():
        raise LedgerError("account_not_found")
    return LedgerEntry.objects.using(DB).filter(user_id=user_id, account_id=account_id).aggregate(
        balance=Sum("amount_toman")
    )["balance"] or 0


def post_transaction(user_id, kind, amount_toman, account_id, request_id, *, destination_id=None,
                     category_id=None, note="", source_id="", occurred_at=None):
    """Post exactly once. Retry with the same request returns the existing row.

    Adjustments use a positive amount and a caller-selected direction through
    kind=opening/income/expense; a signed adjustment API will be added with its
    UI. Debt obligations and saving allocations cannot post through this path.
    """
    if kind not in KINDS:
        raise LedgerError("unsupported_kind")
    if type(amount_toman) is not int or not 0 < amount_toman <= 9_000_000_000_000_000:
        raise LedgerError("invalid_amount")
    if not isinstance(request_id, str) or not 1 <= len(request_id) <= 80:
        raise LedgerError("invalid_request_id")
    if kind == "transfer" and (destination_id is None or destination_id == account_id):
        raise LedgerError("invalid_transfer")
    if kind != "transfer" and destination_id is not None:
        raise LedgerError("unexpected_destination")
    payload = [kind, amount_toman, account_id, destination_id, category_id, note, source_id,
               occurred_at.isoformat() if occurred_at else None]
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, default=str).encode()).hexdigest()
    occurred_at = occurred_at or timezone.now()
    with transaction.atomic(using=DB):
        existing = MoneyTransaction.objects.using(DB).filter(user_id=user_id, request_id=request_id).first()
        if existing:
            if existing.payload_hash != digest:
                raise LedgerError("request_conflict")
            return existing
        account_ids = [account_id] + ([destination_id] if destination_id is not None else [])
        accounts = list(Account.objects.using(DB).select_for_update().filter(
            id__in=account_ids, user_id=user_id, archived_at__isnull=True
        ).order_by("id"))
        if len(accounts) != len(account_ids):
            raise LedgerError("account_not_found")
        if category_id is not None:
            if kind not in {"income", "expense"} or not Category.objects.using(DB).filter(
                id=category_id, user_id=user_id, kind=kind, archived_at__isnull=True
            ).exists():
                raise LedgerError("category_not_found")
        try:
            with transaction.atomic(using=DB):
                row = MoneyTransaction.objects.using(DB).create(
                    user_id=user_id, request_id=request_id, payload_hash=digest,
                    kind=kind, amount_toman=amount_toman, occurred_at=occurred_at,
                    category_id=category_id, note=note, source_id=source_id,
                )
                sign = -1 if kind in {"expense", "transfer"} else 1
                LedgerEntry.objects.using(DB).create(
                    user_id=user_id, transaction=row, account_id=account_id,
                    amount_toman=sign * amount_toman,
                )
                if kind == "transfer":
                    LedgerEntry.objects.using(DB).create(
                        user_id=user_id, transaction=row, account_id=destination_id,
                        amount_toman=amount_toman,
                    )
                return row
        except IntegrityError:
            # Concurrent duplicate request: the winner is visible after the
            # inner savepoint rolls back. The outer transaction stays valid.
            existing = MoneyTransaction.objects.using(DB).get(user_id=user_id, request_id=request_id)
            if existing.payload_hash != digest:
                raise LedgerError("request_conflict")
            return existing


def purge_user(user_id):
    with transaction.atomic(using=DB):
        LedgerEntry.objects.using(DB).filter(user_id=user_id).delete()
        MoneyTransaction.objects.using(DB).filter(user_id=user_id).delete()
        Card.objects.using(DB).filter(user_id=user_id).delete()
        Category.objects.using(DB).filter(user_id=user_id).delete()
        Account.objects.using(DB).filter(user_id=user_id).delete()
