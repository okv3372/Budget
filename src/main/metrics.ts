import {
  USER_CATEGORIES,
  type Category,
  type DashboardMetrics,
  type DashboardRange,
  type MonthlyTrendPoint,
  type SubscriptionSuggestion,
  type Transaction,
  type WeeklyBudgetTarget,
  type WeeklyTrendPoint
} from '../shared/types.js';
import {
  addDays,
  compareIsoDates,
  monthKey,
  normalizeMerchant,
  startOfWeekMonday,
  withinRange
} from './utils.js';

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function startOfMonth(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

function addMonths(isoMonthStart: string, months: number): string {
  const date = new Date(`${isoMonthStart}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function monthLabel(isoMonthStart: string): string {
  return isoMonthStart.slice(0, 7);
}

function asExpenseSpent(amount: number): number {
  return amount < 0 ? Math.abs(amount) : 0;
}

function filterDashboardTransactions(transactions: Transaction[], range?: DashboardRange): Transaction[] {
  return transactions.filter((tx) => {
    if (tx.deleted || tx.excluded) {
      return false;
    }
    return withinRange(tx.date, range?.from, range?.to);
  });
}

function buildWeeklyTrend(transactions: Transaction[], anchorWeekStart: string, count = 12): WeeklyTrendPoint[] {
  const points: WeeklyTrendPoint[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const weekStart = addDays(anchorWeekStart, -offset * 7);
    const weekEnd = addDays(weekStart, 6);

    const inWeek = transactions.filter((tx) => tx.date >= weekStart && tx.date <= weekEnd);
    const income = sum(inWeek.filter((tx) => tx.amount > 0).map((tx) => tx.amount));
    const expenses = sum(inWeek.filter((tx) => tx.amount < 0).map((tx) => tx.amount));

    points.push({
      weekStart,
      income,
      expenses,
      net: income + expenses
    });
  }

  return points;
}

function buildMonthlyTrend(transactions: Transaction[], anchorDate: string, count = 12): MonthlyTrendPoint[] {
  const thisMonthStart = startOfMonth(anchorDate);
  const points: MonthlyTrendPoint[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const monthStart = addMonths(thisMonthStart, -offset);
    const label = monthLabel(monthStart);

    const inMonth = transactions.filter((tx) => monthKey(tx.date) === label);
    const income = sum(inMonth.filter((tx) => tx.amount > 0).map((tx) => tx.amount));
    const expenses = sum(inMonth.filter((tx) => tx.amount < 0).map((tx) => tx.amount));

    points.push({
      month: label,
      income,
      expenses,
      net: income + expenses
    });
  }

  return points;
}

function buildSubscriptionSuggestions(transactions: Transaction[]): SubscriptionSuggestion[] {
  const expenseRows = transactions.filter((tx) => tx.amount < 0 && !tx.deleted && !tx.excluded);
  const groups = groupBy(expenseRows, (tx) => normalizeMerchant(tx.description));
  const suggestions: SubscriptionSuggestion[] = [];

  groups.forEach((rows, merchantKey) => {
    if (merchantKey.length < 3 || rows.length < 3) {
      return;
    }

    const sorted = [...rows].sort((a, b) => compareIsoDates(a.date, b.date));
    const intervals: number[] = [];

    for (let index = 1; index < sorted.length; index += 1) {
      const prev = new Date(`${sorted[index - 1].date}T00:00:00Z`);
      const cur = new Date(`${sorted[index].date}T00:00:00Z`);
      const diffDays = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    if (intervals.length < 2) {
      return;
    }

    const avgInterval = sum(intervals) / intervals.length;
    const intervalVariance = sum(intervals.map((value) => (value - avgInterval) ** 2)) / intervals.length;
    const intervalStdDev = Math.sqrt(intervalVariance);

    const absAmounts = sorted.map((tx) => Math.abs(tx.amount));
    const avgAmount = sum(absAmounts) / absAmounts.length;
    const amountVariance = sum(absAmounts.map((value) => (value - avgAmount) ** 2)) / absAmounts.length;
    const amountStdDev = Math.sqrt(amountVariance);

    const intervalLooksMonthly = avgInterval >= 20 && avgInterval <= 40 && intervalStdDev <= 10;
    const amountStable = avgAmount > 0 && amountStdDev / avgAmount <= 0.25;

    if (!intervalLooksMonthly || !amountStable) {
      return;
    }

    suggestions.push({
      merchantKey,
      exampleDescription: sorted[0].description,
      occurrences: sorted.length,
      averageAmount: avgAmount,
      averageIntervalDays: avgInterval,
      lastDate: sorted[sorted.length - 1].date
    });
  });

  return suggestions.sort((a, b) => b.occurrences - a.occurrences).slice(0, 10);
}

export function getDashboardMetrics(
  transactions: Transaction[],
  budgets: WeeklyBudgetTarget[],
  weeklySavingsTarget: number,
  range?: DashboardRange
): DashboardMetrics {
  const scoped = filterDashboardTransactions(transactions, range);
  const anchor = range?.to ?? new Date().toISOString().slice(0, 10);
  const weekStart = startOfWeekMonday(anchor);
  const weekEnd = anchor;

  const weekRows = scoped.filter((tx) => tx.date >= weekStart && tx.date <= weekEnd);
  const weeklyTransactions = [...weekRows].sort((a, b) => {
    if (a.date === b.date) {
      return b.updated_at.localeCompare(a.updated_at);
    }
    return b.date.localeCompare(a.date);
  });
  const weeklyIncome = sum(weekRows.filter((tx) => tx.amount > 0).map((tx) => tx.amount));
  const weeklyExpenses = sum(weekRows.filter((tx) => tx.amount < 0).map((tx) => tx.amount));
  const weeklyNet = weeklyIncome + weeklyExpenses;

  const budgetMap = new Map<Category, number>(budgets.map((budget) => [budget.category, budget.weekly_limit]));

  const categoryRows = USER_CATEGORIES.map((category) => {
    const txs = weekRows.filter((tx) => tx.category === category);
    const categoryTotal = sum(txs.map((tx) => tx.amount));

    if (category === 'Income') {
      const limit = budgetMap.get(category) ?? 0;
      const remaining = categoryTotal - limit;
      return {
        category,
        limit,
        spent: categoryTotal,
        remaining,
        overBudget: false
      };
    }

    const spent = asExpenseSpent(categoryTotal);
    const limit = budgetMap.get(category) ?? 0;
    const remaining = limit - spent;

    return {
      category,
      limit,
      spent,
      remaining,
      overBudget: spent > limit && limit > 0
    };
  });

  const distributionWindowFrom = addDays(anchor, -89);
  const recent = scoped.filter((tx) => tx.date >= distributionWindowFrom && tx.amount < 0);
  const categoryDistribution = USER_CATEGORIES.filter((category) => category !== 'Income').map((category) => {
    const spent = Math.abs(sum(recent.filter((tx) => tx.category === category).map((tx) => tx.amount)));
    return {
      category,
      spent
    };
  });

  return {
    weekStart,
    weekEnd,
    weeklyIncome,
    weeklyExpenses,
    weeklyNet,
    weeklySavingsTarget,
    weeklySavingsDelta: weeklyNet - weeklySavingsTarget,
    weeklyTransactions,
    categoryRows,
    weeklyTrend: buildWeeklyTrend(scoped, weekStart, 12),
    monthlyTrend: buildMonthlyTrend(scoped, anchor, 12),
    categoryDistribution,
    subscriptionSuggestions: buildSubscriptionSuggestions(scoped)
  };
}
