/* Budget forecasts from the private ledger. Boundaries are Gregorian dates in
   Asia/Tehran, matching both finance APIs; no value enters the wallet ledger. */
const FinanceBudgets = (function () {
  'use strict';
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
  function day(value) {
    const parts = zone.format(new Date(value)).split('/');
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  function utc(value) { return new Date(value + 'T00:00:00Z'); }
  function iso(value) { return value.toISOString().slice(0, 10); }
  function addDays(value, n) { const d = utc(value); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function monthStart(anchor, n) {
    const [y, m, d] = anchor.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(d, last)); return iso(first);
  }
  function bounds(budget, asOf) {
    if (asOf < budget.start_date) return [];
    if (budget.period === 'custom') return [{ start_date: budget.start_date, end_date: budget.end_date }];
    const result = [];
    for (let n = 0; n < 2400; n++) {
      const start = budget.period === 'weekly' ? addDays(budget.start_date, n * 7) : monthStart(budget.start_date, n);
      if (start > asOf) break;
      const next = budget.period === 'weekly' ? addDays(budget.start_date, (n + 1) * 7) : monthStart(budget.start_date, n + 1);
      result.push({ start_date: start, end_date: addDays(next, -1) });
    }
    return result;
  }
  function categorySet(id, categories) {
    if (id == null) return null;
    const set = new Set([String(id)]);
    const parent = categories.find(c => String(c.id) === String(id));
    for (const c of categories) if (String(c.parent_id) === String(id)
      || (parent && c.parent_client_id === parent.client_id)) set.add(String(c.id));
    return set;
  }
  function report(budget, transactions, categories, asOf, count) {
    const periods = bounds(budget, asOf), ids = categorySet(budget.category_id, categories);
    let carry = 0, invalid = false;
    const rows = periods.map(period => {
      if (invalid) return { ...period, status: 'total_limit' };
      const spent = transactions.reduce((sum, tx) => {
        if (tx.kind !== 'expense' || !tx.occurred_at) return sum;
        const date = day(tx.occurred_at);
        return date >= period.start_date && date <= period.end_date && date <= asOf
          && (!ids || ids.has(String(tx.category_id))) ? sum + Number(tx.amount_toman || 0) : sum;
      }, 0);
      const limit = Number(budget.amount_toman) + carry;
      if (!Number.isSafeInteger(spent) || spent > 9000000000000000
        || !Number.isSafeInteger(limit) || limit > 9000000000000000) {
        invalid = true;
        return { ...period, status: 'total_limit' };
      }
      const remaining = limit - spent;
      const status = remaining < 0 ? 'over_limit' : remaining === 0 ? 'at_limit'
        : spent >= limit * 0.8 ? 'near_limit' : 'on_track';
      const row = { ...period, spent_toman: spent, rollover_toman: carry,
        limit_toman: limit, remaining_toman: remaining, status };
      carry = budget.rollover && budget.period !== 'custom' ? Math.max(0, remaining) : 0;
      return row;
    });
    return rows.slice(-count).reverse();
  }
  return { report: report, today: () => day(new Date()) };
})();
if (typeof module !== 'undefined') module.exports = FinanceBudgets;
