"""Compute budget periods from expense history without changing the ledger."""
from calendar import monthrange
from datetime import date, datetime, time, timedelta
import re
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.utils import timezone

from apps.common.exceptions import ApiError

from .models import MoneyTransaction
from .services import DB, MAX_TOMAN

BUDGET_ZONE = ZoneInfo("Asia/Tehran")
DAY = timedelta(days=1)


def parse_budget_date(raw):
    if isinstance(raw, str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", raw):
        try:
            value = date.fromisoformat(raw)
            if 1000 <= value.year <= 9998:
                return value
        except ValueError:
            pass
    raise ApiError("validation_error")


def _period_start(start, period, number):
    if period == "weekly":
        return start + timedelta(weeks=number)
    year, month = divmod(start.year * 12 + start.month - 1 + number, 12)
    month += 1
    return date(year, month, min(start.day, monthrange(year, month)[1]))


def _period_number(start, period, as_of):
    if period == "weekly":
        return (as_of - start).days // 7
    number = (as_of.year - start.year) * 12 + as_of.month - start.month
    return number - (_period_start(start, period, number) > as_of)


def _midnight(day):
    return datetime.combine(day, time.min, tzinfo=BUDGET_ZONE)


def budget_periods(budget, as_of, periods):
    """Gregorian dates in Tehran. Weekly/monthly periods repeat from the
    start date, clamping each monthly anniversary independently. End dates
    are inclusive, with spending through as_of. Custom budgets run once.
    """
    if as_of < budget.start_date:
        return []
    custom = budget.period == "custom"
    last = 0 if custom else _period_number(budget.start_date, budget.period, as_of)
    visible = max(0, last - periods + 1)
    first = 0 if budget.rollover else visible
    start = budget.start_date if custom else _period_start(budget.start_date, budget.period, first)
    through = min(as_of, budget.end_date) if custom else as_of
    expenses = MoneyTransaction.objects.using(DB).filter(
        user_id=budget.user_id, kind="expense",
        occurred_at__gte=_midnight(start), occurred_at__lt=_midnight(through + DAY),
    )
    if budget.category_id is not None:
        expenses = expenses.filter(
            Q(category_id=budget.category_id) |
            Q(category__parent_id=budget.category_id, category__user_id=budget.user_id)
        )
    amounts = iter(expenses.order_by("occurred_at").values_list("occurred_at", "amount_toman").iterator())
    expense = next(amounts, None)
    reports = []
    rollover = 0
    for number in range(first, last + 1):
        next_start = budget.end_date + DAY if custom else _period_start(budget.start_date, budget.period, number + 1)
        boundary = _midnight(next_start)
        spent = 0
        while expense is not None and expense[0] < boundary:
            spent += expense[1]
            if spent > MAX_TOMAN:
                raise ApiError("budget_total_limit")
            expense = next(amounts, None)
        limit = budget.amount_toman + rollover
        if limit > MAX_TOMAN:
            raise ApiError("budget_total_limit")
        remaining = limit - spent
        if number >= visible:
            if remaining < 0:
                status = "over_limit"
            elif remaining == 0:
                status = "at_limit"
            elif spent * 5 >= limit * 4:
                status = "near_limit"
            else:
                status = "on_track"
            reports.append({
                "start_date": start.isoformat(), "end_date": (next_start - DAY).isoformat(),
                "spent_toman": spent, "rollover_toman": rollover, "limit_toman": limit,
                "remaining_toman": remaining, "status": status,
            })
        rollover = max(0, remaining) if budget.rollover else 0
        start = next_start
    return reports[::-1]
