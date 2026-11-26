const test = require('node:test');
const assert = require('node:assert/strict');
const budgets = require('../frontend/demo/js/core/finance-budgets.js');

test('budget rollover counts a child once and never changes the wallet', () => {
  const budget = { amount_toman: 1000, category_id: 1, period: 'weekly',
    start_date: '2026-11-01', rollover: true };
  const categories = [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }];
  const tx = [
    { kind: 'expense', amount_toman: 200, category_id: 2, occurred_at: '2026-11-02T12:00:00Z' },
    { kind: 'expense', amount_toman: 100, category_id: 1, occurred_at: '2026-11-09T12:00:00Z' },
    { kind: 'transfer', amount_toman: 900, category_id: null, occurred_at: '2026-11-09T12:00:00Z' },
  ];
  const report = budgets.report(budget, tx, categories, '2026-11-10', 2);
  assert.deepEqual(report.map(p => [p.spent_toman, p.rollover_toman, p.remaining_toman]),
    [[100, 800, 1700], [200, 0, 800]]);
  assert.equal(tx.length, 3);
});

test('month anchors clamp then recover; future transactions are excluded', () => {
  const budget = { amount_toman: 100, category_id: null, period: 'monthly',
    start_date: '2026-01-31', rollover: false };
  const tx = [{ kind: 'expense', amount_toman: 90, category_id: null,
    occurred_at: '2026-03-30T12:00:00Z' }];
  const report = budgets.report(budget, tx, [], '2026-03-01', 3);
  assert.deepEqual(report.map(p => p.start_date), ['2026-02-28', '2026-01-31']);
  assert.equal(report[0].spent_toman, 0);
});
