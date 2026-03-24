import { useEffect, useMemo, useState } from 'react';
import { type Category, type DashboardMetrics, type Transaction } from '../../shared/types';
import { formatMoney } from '../format';
import { DonutChart } from '../components/DonutChart';
import { LineChart } from '../components/LineChart';
import { SpendDistributionChart, type SpendDistributionPoint } from '../components/SpendDistributionChart';

interface DashboardPageProps {
  metrics: DashboardMetrics | null;
  transactions: Transaction[];
  categories: Category[];
}

type PeriodMode = 'week' | 'month';

interface PeriodCategoryRow {
  category: Category;
  spent: number;
  earned: number;
  net: number;
  spendShare: number;
}

const KNOWN_SPEND_CATEGORY_COLORS: Record<string, string> = {
  Groceries: '#1e8a5f',
  Restaurants: '#0f5f8d',
  Gas: '#bc6a16',
  Rent: '#a7362b',
  Utilities: '#2f3d98',
  Subscriptions: '#2f7752',
  Entertainment: '#8d4f96',
  Other: '#4351b1'
};

const FALLBACK_SPEND_COLORS = ['#1e8a5f', '#0f5f8d', '#bc6a16', '#a7362b', '#2f3d98', '#2f7752', '#8d4f96', '#4351b1', '#5f6b73'];

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function startOfWeekMonday(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfMonth(month: string): string {
  return `${month}-01`;
}

function endOfMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function monthStartFromDate(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

function normalizeSpendSelection(selected: Category[], available: Category[]): Category[] {
  const availableSet = new Set(available.map((category) => category.toLowerCase()));
  const kept = selected.filter((category) => availableSet.has(category.toLowerCase()));
  const seen = new Set<string>();
  const deduped: Category[] = [];

  for (const category of kept) {
    const key = category.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(category);
  }

  return deduped;
}

function buildSpendSharePoints(
  transactions: Transaction[],
  spendCategories: Category[],
  periodKey: (transaction: Transaction) => string
): SpendDistributionPoint[] {
  const spendCategorySet = new Set(spendCategories.map((category) => category.toLowerCase()));
  const spendByPeriod = new Map<string, Map<Category, number>>();

  for (const transaction of transactions) {
    if (transaction.amount >= 0 || !spendCategorySet.has(transaction.category.toLowerCase())) {
      continue;
    }

    const key = periodKey(transaction);
    const current = spendByPeriod.get(key) ?? new Map<Category, number>();
    current.set(transaction.category, (current.get(transaction.category) ?? 0) + Math.abs(transaction.amount));
    spendByPeriod.set(key, current);
  }

  const keys = [...spendByPeriod.keys()].sort((a, b) => a.localeCompare(b));
  return keys.map((key) => {
    const spends = spendByPeriod.get(key) ?? new Map<Category, number>();
    const totalSpend = sum(spendCategories.map((category) => spends.get(category) ?? 0));
    const percentages: Record<string, number> = {};

    for (const category of spendCategories) {
      const categorySpend = spends.get(category) ?? 0;
      percentages[category] = totalSpend > 0 ? (categorySpend / totalSpend) * 100 : 0;
    }

    return {
      date: key,
      percentages
    };
  });
}

export function DashboardPage({ metrics, transactions, categories }: DashboardPageProps) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thisWeekStart = useMemo(() => startOfWeekMonday(todayIso), [todayIso]);
  const thisMonth = useMemo(() => todayIso.slice(0, 7), [todayIso]);
  const [selectedWeekStart, setSelectedWeekStart] = useState(thisWeekStart);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('week');

  const userCategories = useMemo(
    () => categories.filter((category) => category !== 'Uncategorized' && category !== 'Transfer'),
    [categories]
  );
  const spendCategories = useMemo(() => userCategories.filter((category) => category.toLowerCase() !== 'income'), [userCategories]);
  const [enabledSpendCategories, setEnabledSpendCategories] = useState<Category[]>(spendCategories);

  useEffect(() => {
    setEnabledSpendCategories((current) => normalizeSpendSelection(current.length > 0 ? current : spendCategories, spendCategories));
  }, [spendCategories]);

  const spendColorMap = useMemo(() => {
    const map = new Map<Category, string>();
    spendCategories.forEach((category, index) => {
      map.set(category, KNOWN_SPEND_CATEGORY_COLORS[category] ?? FALLBACK_SPEND_COLORS[index % FALLBACK_SPEND_COLORS.length]);
    });
    return map;
  }, [spendCategories]);

  const activeTransactions = useMemo(
    () => transactions.filter((transaction) => !transaction.deleted && !transaction.excluded),
    [transactions]
  );

  const weeklySpendSharePoints = useMemo(
    () => buildSpendSharePoints(activeTransactions, spendCategories, (transaction) => startOfWeekMonday(transaction.date)),
    [activeTransactions, spendCategories]
  );

  const monthlySpendSharePoints = useMemo(
    () => buildSpendSharePoints(activeTransactions, spendCategories, (transaction) => monthStartFromDate(transaction.date)),
    [activeTransactions, spendCategories]
  );

  const spendSeries = useMemo(
    () =>
      spendCategories.map((category) => ({
        category,
        color: spendColorMap.get(category) ?? FALLBACK_SPEND_COLORS[0],
        enabled: enabledSpendCategories.includes(category)
      })),
    [enabledSpendCategories, spendCategories, spendColorMap]
  );

  const selectedWeekEnd = useMemo(() => addDays(selectedWeekStart, 6), [selectedWeekStart]);
  const normalizedMonth = useMemo(
    () => (/^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : thisMonth),
    [selectedMonth, thisMonth]
  );
  const selectedMonthStart = useMemo(() => startOfMonth(normalizedMonth), [normalizedMonth]);
  const selectedMonthEnd = useMemo(() => endOfMonth(normalizedMonth), [normalizedMonth]);

  const periodRange = useMemo(
    () =>
      periodMode === 'week'
        ? { start: selectedWeekStart, end: selectedWeekEnd }
        : { start: selectedMonthStart, end: selectedMonthEnd },
    [periodMode, selectedWeekEnd, selectedWeekStart, selectedMonthEnd, selectedMonthStart]
  );

  const periodTransactions = useMemo(
    () => activeTransactions.filter((transaction) => transaction.date >= periodRange.start && transaction.date <= periodRange.end),
    [activeTransactions, periodRange.end, periodRange.start]
  );

  const periodRows = useMemo<PeriodCategoryRow[]>(() => {
    const rows = categories.map((category) => {
      const categoryRows = periodTransactions.filter((transaction) => transaction.category === category);
      const spent = sum(categoryRows.filter((transaction) => transaction.amount < 0).map((transaction) => Math.abs(transaction.amount)));
      const earned = sum(categoryRows.filter((transaction) => transaction.amount > 0).map((transaction) => transaction.amount));
      const net = sum(categoryRows.map((transaction) => transaction.amount));

      return {
        category,
        spent,
        earned,
        net,
        spendShare: 0
      };
    });

    const totalSpent = sum(rows.map((row) => row.spent));
    const withShare = rows.map((row) => ({
      ...row,
      spendShare: totalSpent > 0 ? (row.spent / totalSpent) * 100 : 0
    }));

    return withShare.sort((a, b) => b.spendShare - a.spendShare || a.category.localeCompare(b.category));
  }, [categories, periodTransactions]);

  const periodTotalSpent = useMemo(() => sum(periodRows.map((row) => row.spent)), [periodRows]);
  const periodTotalEarned = useMemo(() => sum(periodRows.map((row) => row.earned)), [periodRows]);
  const periodTotalNet = periodTotalEarned - periodTotalSpent;
  const spendDateRange = useMemo(() => {
    const spendDates = activeTransactions
      .filter((transaction) => transaction.amount < 0 && spendCategories.includes(transaction.category))
      .map((transaction) => transaction.date)
      .sort((a, b) => a.localeCompare(b));

    return {
      start: spendDates[0] ?? '',
      end: spendDates[spendDates.length - 1] ?? ''
    };
  }, [activeTransactions, spendCategories]);

  if (!metrics) {
    return (
      <div className="page-grid">
        <section className="panel">Loading dashboard...</section>
      </div>
    );
  }

  const weeklyNetClass = metrics.weeklyNet < 0 ? 'neg' : 'pos';

  return (
    <div className="page-grid">
      <section className="metric-grid">
        <article className="metric-card">
          <span>Weekly Income</span>
          <strong className="pos">{formatMoney(metrics.weeklyIncome)}</strong>
          <small>{metrics.weekStart} to {metrics.weekEnd}</small>
        </article>
        <article className="metric-card">
          <span>Weekly Expenses</span>
          <strong className="neg">{formatMoney(metrics.weeklyExpenses)}</strong>
          <small>Excluded rows removed</small>
        </article>
        <article className="metric-card">
          <span>Weekly Net</span>
          <strong className={weeklyNetClass}>{formatMoney(metrics.weeklyNet)}</strong>
          <small>Target {formatMoney(metrics.weeklySavingsTarget)}</small>
        </article>
        <article className="metric-card">
          <span>Savings Delta</span>
          <strong className={metrics.weeklySavingsDelta < 0 ? 'neg' : 'pos'}>{formatMoney(metrics.weeklySavingsDelta)}</strong>
          <small>{metrics.weeklySavingsDelta >= 0 ? 'Ahead of target' : 'Below target'}</small>
        </article>
      </section>

      <section className="chart-grid">
        <LineChart
          title="Weekly Net Trend"
          points={metrics.weeklyTrend.map((point) => ({ label: point.weekStart.slice(5), value: point.net }))}
          accent="#1e8a5f"
        />
        <LineChart
          title="Monthly Net Trend"
          points={metrics.monthlyTrend.map((point) => ({ label: point.month.slice(5), value: point.net }))}
          accent="#0f5f8d"
        />
        <DonutChart
          title="90-Day Spend Distribution"
          slices={metrics.categoryDistribution
            .filter((slice) => userCategories.includes(slice.category) && slice.category.toLowerCase() !== 'income')
            .map((slice) => ({ label: slice.category, value: slice.spent }))}
        />
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>Spend Distribution Over Time</h3>
          <span>{spendDateRange.start && spendDateRange.end ? `${spendDateRange.start} to ${spendDateRange.end}` : 'No spending data'}</span>
        </header>

        <div className="spend-controls-row">
          <div className="button-group">
            <button className="ghost" onClick={() => setEnabledSpendCategories(spendCategories)}>
              Show All
            </button>
            <button className="ghost" onClick={() => setEnabledSpendCategories([])}>
              Hide All
            </button>
          </div>

          <div className="spend-category-toggle-grid">
            {spendCategories.map((category) => {
              const active = enabledSpendCategories.includes(category);
              return (
                <button
                  key={`spend-toggle-${category}`}
                  className={`spend-category-toggle ${active ? 'active' : ''}`}
                  onClick={() =>
                    setEnabledSpendCategories((current) =>
                      current.includes(category)
                        ? current.filter((item) => item !== category)
                        : [...current, category]
                    )
                  }
                  aria-pressed={active}
                >
                  <i style={{ backgroundColor: spendColorMap.get(category) ?? FALLBACK_SPEND_COLORS[0] }} />
                  <span>{category}</span>
                </button>
              );
            })}
          </div>
        </div>

        <SpendDistributionChart title="Weekly Spend Share by Category" points={weeklySpendSharePoints} series={spendSeries} xLabelMode="week" />
        <SpendDistributionChart title="Monthly Spend Share by Category" points={monthlySpendSharePoints} series={spendSeries} xLabelMode="month" />
        <p className="hint">
          Weekly and monthly charts use each period&apos;s average spend share from total spend in that period. Y-axis scales to the max visible share. Category toggles only affect line visibility.
        </p>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>Category Percentages by Week or Month</h3>
          <span>{periodMode === 'week' ? 'Week view' : 'Month view'}</span>
        </header>

        <div className="budget-controls">
          <div className="button-group">
            <button className="ghost" onClick={() => setSelectedWeekStart(thisWeekStart)}>
              This Week
            </button>
            <button className="ghost" onClick={() => setSelectedWeekStart(addDays(thisWeekStart, -7))}>
              Last Week
            </button>
            <button className="ghost" onClick={() => setSelectedWeekStart((current) => addDays(current, -7))}>
              Back
            </button>
            <button className="ghost" onClick={() => setSelectedWeekStart((current) => addDays(current, 7))}>
              Forward
            </button>
          </div>

          <label>
            Week (Monday start)
            <input
              type="date"
              value={selectedWeekStart}
              onChange={(event) => {
                if (!event.target.value) {
                  return;
                }
                setSelectedWeekStart(startOfWeekMonday(event.target.value));
              }}
            />
          </label>

          <label>
            Month
            <input type="month" value={normalizedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
          </label>

          <div className="button-group period-mode-buttons" role="tablist" aria-label="Dashboard category period mode">
            <button className={`ghost ${periodMode === 'week' ? 'active' : ''}`} onClick={() => setPeriodMode('week')}>
              Use Week
            </button>
            <button className={`ghost ${periodMode === 'month' ? 'active' : ''}`} onClick={() => setPeriodMode('month')}>
              Use Month
            </button>
          </div>
        </div>

        <div className="dashboard-period-summary">
          <span>
            {periodRange.start} to {periodRange.end}
          </span>
          <strong className="neg">Spent {formatMoney(periodTotalSpent)}</strong>
          <strong className="pos">Earned {formatMoney(periodTotalEarned)}</strong>
          <strong className={periodTotalNet < 0 ? 'neg' : 'pos'}>Net {formatMoney(periodTotalNet)}</strong>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Spend Share</th>
                <th>Spent</th>
                <th>Earned</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {periodRows.map((row) => (
                <tr key={`period-category-${row.category}`}>
                  <td>{row.category}</td>
                  <td>{row.spendShare.toFixed(1)}%</td>
                  <td className={row.spent > 0 ? 'neg' : ''}>{formatMoney(row.spent)}</td>
                  <td className={row.earned > 0 ? 'pos' : ''}>{formatMoney(row.earned)}</td>
                  <td className={row.net < 0 ? 'neg' : 'pos'}>{formatMoney(row.net)}</td>
                </tr>
              ))}
              {periodRows.length === 0 ? (
                <tr>
                  <td colSpan={5}>No transactions found for {periodRange.start} through {periodRange.end}.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
