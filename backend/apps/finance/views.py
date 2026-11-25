"""Small, authenticated finance API. No financial rows join the sync document."""
from datetime import datetime

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import ApiError

from .models import Account, Category, LedgerEntry, MoneyTransaction
from .services import LedgerError, account_balance, post_transaction

DB = "finance"


def _text(value, *, limit, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ApiError("validation_error")
    return value.strip()


def _positive_id(value):
    if type(value) is not int or value < 1:
        raise ApiError("validation_error")
    return value


def _account_row(row, balances):
    return {"id": row.id, "client_id": row.client_id, "name": row.name, "kind": row.kind,
            "color": row.color, "icon": row.icon, "archived": row.archived_at is not None,
            "balance_toman": balances.get(row.id, 0)}


def _category_row(row):
    return {"id": row.id, "client_id": row.client_id, "name": row.name, "kind": row.kind,
            "parent_id": row.parent_id, "color": row.color, "icon": row.icon,
            "archived": row.archived_at is not None}


class FinanceStateView(APIView):
    def get(self, request):
        uid = request.user.id
        accounts = list(Account.objects.using(DB).filter(user_id=uid).order_by("id"))
        categories = list(Category.objects.using(DB).filter(user_id=uid).order_by("id"))
        balances = dict(LedgerEntry.objects.using(DB).filter(user_id=uid).values("account_id")
                        .annotate(balance=Sum("amount_toman")).values_list("account_id", "balance"))
        txs = MoneyTransaction.objects.using(DB).filter(user_id=uid).order_by("-occurred_at", "-id")[:100]
        transactions = []
        for row in txs:
            entries = list(row.entries.values("account_id", "amount_toman"))
            transactions.append({"id": row.id, "request_id": row.request_id, "kind": row.kind,
                                 "amount_toman": row.amount_toman, "occurred_at": row.occurred_at.isoformat(),
                                 "category_id": row.category_id, "note": row.note, "source_id": row.source_id,
                                 "entries": entries})
        return Response({"currency": "TOMAN", "wallet_balance_toman": sum(balances.values()),
                         "accounts": [_account_row(a, balances) for a in accounts],
                         "categories": [_category_row(c) for c in categories],
                         "transactions": transactions})


class AccountsView(APIView):
    def post(self, request):
        uid = request.user.id
        body = request.data
        client_id = _text(body.get("client_id"), limit=80, required=True)
        name = _text(body.get("name"), limit=100, required=True)
        kind = body.get("kind")
        if kind not in {"bank", "cash", "savings", "other"}:
            raise ApiError("validation_error")
        color = _text(body.get("color", ""), limit=32)
        icon = _text(body.get("icon", ""), limit=40)
        with transaction.atomic(using=DB):
            existing = Account.objects.using(DB).filter(user_id=uid, client_id=client_id).first()
            if existing:
                if (existing.name, existing.kind, existing.color, existing.icon) != (name, kind, color, icon):
                    raise ApiError("request_conflict", 409)
                return Response(_account_row(existing, {existing.id: account_balance(uid, existing.id)}))
            row = Account.objects.using(DB).create(user_id=uid, client_id=client_id, name=name,
                                                   kind=kind, color=color, icon=icon)
        return Response(_account_row(row, {}), status=201)


class CategoriesView(APIView):
    def post(self, request):
        uid = request.user.id
        body = request.data
        client_id = _text(body.get("client_id"), limit=80, required=True)
        name = _text(body.get("name"), limit=100, required=True)
        kind = body.get("kind")
        if kind not in {"income", "expense"}:
            raise ApiError("validation_error")
        parent_id = body.get("parent_id")
        if parent_id is not None:
            parent_id = _positive_id(parent_id)
        color = _text(body.get("color", ""), limit=32)
        icon = _text(body.get("icon", ""), limit=40)
        with transaction.atomic(using=DB):
            existing = Category.objects.using(DB).filter(user_id=uid, client_id=client_id).first()
            if existing:
                if (existing.name, existing.kind, existing.parent_id, existing.color, existing.icon) != (name, kind, parent_id, color, icon):
                    raise ApiError("request_conflict", 409)
                return Response(_category_row(existing))
            if parent_id is not None:
                parent = Category.objects.using(DB).filter(id=parent_id, user_id=uid, kind=kind, archived_at__isnull=True).first()
                if parent is None:
                    raise ApiError("category_not_found", 404)
                if parent.parent_id is not None:
                    raise ApiError("category_depth")
            row = Category.objects.using(DB).create(user_id=uid, client_id=client_id, name=name,
                                                    kind=kind, parent_id=parent_id, color=color, icon=icon)
        return Response(_category_row(row), status=201)


class TransactionsView(APIView):
    def post(self, request):
        body = request.data
        request_id = _text(body.get("request_id"), limit=80, required=True)
        kind = body.get("kind")
        amount = body.get("amount_toman")
        account_id = _positive_id(body.get("account_id"))
        destination_id = body.get("destination_id")
        if destination_id is not None:
            destination_id = _positive_id(destination_id)
        category_id = body.get("category_id")
        if category_id is not None:
            category_id = _positive_id(category_id)
        note = _text(body.get("note", ""), limit=2000)
        source_id = _text(body.get("source_id", ""), limit=120)
        occurred_at = body.get("occurred_at")
        if occurred_at is not None:
            if not isinstance(occurred_at, str):
                raise ApiError("validation_error")
            occurred_at = parse_datetime(occurred_at)
            if not isinstance(occurred_at, datetime) or timezone.is_naive(occurred_at):
                raise ApiError("validation_error")
        exists = MoneyTransaction.objects.using(DB).filter(user_id=request.user.id, request_id=request_id).exists()
        try:
            row = post_transaction(request.user.id, kind, amount, account_id, request_id,
                                   destination_id=destination_id, category_id=category_id,
                                   note=note, source_id=source_id, occurred_at=occurred_at)
        except LedgerError as exc:
            code = str(exc)
            raise ApiError(code, 409 if code == "request_conflict" else 404 if code.endswith("not_found") else 400)
        return Response({"id": row.id, "request_id": row.request_id}, status=200 if exists else 201)
