import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDashboardMetrics } from '../src/main/metrics';
import type { Transaction, WeeklyBudgetTarget } from '../src/shared/types';

const transactions: Transaction[] = [
  {
    id: '1',
    source: 'citizens',
    source_file: 'a.csv',
    source_row_hash: '1',
    date: '2026-03-23',
    description: 'Payroll',
    amount: 1000,
    category: 'Income',
    discover_original_category: '',
    excluded: false,
    deleted: false,
    delete_reason: '',
    notes: '',
    created_at: '2026-03-23T00:00:00.000Z',
    updated_at: '2026-03-23T00:00:00.000Z'
  },
  {
    id: '2',
    source: 'citizens',
    source_file: 'a.csv',
    source_row_hash: '2',
    date: '2026-03-24',
    description: 'ALDI',
    amount: -120,
    category: 'Groceries',
    discover_original_category: '',
    excluded: false,
    deleted: false,
    delete_reason: '',
    notes: '',
    created_at: '2026-03-24T00:00:00.000Z',
    updated_at: '2026-03-24T00:00:00.000Z'
  },
  {
    id: '3',
    source: 'citizens',
    source_file: 'a.csv',
    source_row_hash: '3',
    date: '2026-03-24',
    description: 'Rent',
    amount: -400,
    category: 'Rent',
    discover_original_category: '',
    excluded: false,
    deleted: false,
    delete_reason: '',
    notes: '',
    created_at: '2026-03-24T00:00:00.000Z',
    updated_at: '2026-03-24T00:00:00.000Z'
  }
];

const budgets: WeeklyBudgetTarget[] = [
  { category: 'Groceries', weekly_limit: 100 },
  { category: 'Rent', weekly_limit: 350 },
  { category: 'Income', weekly_limit: 0 },
  { category: 'Restaurants', weekly_limit: 0 },
  { category: 'Gas', weekly_limit: 0 },
  { category: 'Utilities', weekly_limit: 0 },
  { category: 'Subscriptions', weekly_limit: 0 },
  { category: 'Entertainment', weekly_limit: 0 },
  { category: 'Other', weekly_limit: 0 },
  { category: 'Uncategorized', weekly_limit: 0 },
  { category: 'Transfer', weekly_limit: 0 }
];

describe('dashboard metrics', () => {
  it('calculates weekly net and over-budget flags', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00.000Z'));

    const metrics = getDashboardMetrics(transactions, budgets, 300);

    expect(metrics.weekStart).toBe('2026-03-23');
    expect(metrics.weekEnd).toBe('2026-03-24');
    expect(metrics.weeklyIncome).toBeCloseTo(1000, 2);
    expect(metrics.weeklyExpenses).toBeCloseTo(-520, 2);
    expect(metrics.weeklyNet).toBeCloseTo(480, 2);
    expect(metrics.weeklySavingsDelta).toBeCloseTo(180, 2);
    expect(metrics.weeklyTransactions).toHaveLength(3);
    expect(metrics.weeklyTransactions.map((tx) => tx.id)).toEqual(['2', '3', '1']);

    const groceries = metrics.categoryRows.find((row) => row.category === 'Groceries');
    const rent = metrics.categoryRows.find((row) => row.category === 'Rent');

    expect(groceries?.overBudget).toBe(true);
    expect(rent?.overBudget).toBe(true);
  });

  it('anchors weekly totals to the current date week (since monday)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    const metrics = getDashboardMetrics(transactions, budgets, 300);

    expect(metrics.weekStart).toBe('2026-03-30');
    expect(metrics.weekEnd).toBe('2026-04-02');
    expect(metrics.weeklyIncome).toBe(0);
    expect(metrics.weeklyExpenses).toBe(0);
    expect(metrics.weeklyNet).toBe(0);
    expect(metrics.weeklyTransactions).toHaveLength(0);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
