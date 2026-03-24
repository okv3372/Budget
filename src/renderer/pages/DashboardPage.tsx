import { useEffect, useMemo, useState } from 'react';
import { type Category, type DashboardMetrics, type Transaction } from '../../shared/types';
import { formatDate, formatMoney } from '../format';
import { DonutChart } from '../components/DonutChart';
import { SpendDistributionChart, type SpendDistributionPoint } from '../components/SpendDistributionChart';

interface DashboardPageProps {
  metrics: DashboardMetrics | null;
  transactions: Transaction[];
  categories: Category[];
  onUpdateCategory: (id: string, category: Category) => Promise<void>;
}

type PeriodMode = 'week' | 'month' | 'compare-months';

interface PeriodCategoryRow {
  category: Category;
  spent: number;
  earned: number;
  net: number;
  spendShare: number;
}

interface MonthComparisonRow {
  category: Category;
  firstShare: number;
  secondShare: number;
  firstSpent: number;
  secondSpent: number;
  shareDelta: number;
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

function addMonths(month: string, amount: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function monthStartFromDate(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

function formatMonthLabel(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function shiftMonth(month: string, offset: number): string {
  const fallbackMonth = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const date = new Date(`${fallbackMonth}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
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

function buildCategoryRows(periodTransactions: Transaction[], rowCategories: Category[]): PeriodCategoryRow[] {
  const rows = rowCategories.map((category) => {
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
}

export function DashboardPage({ metrics, transactions, categories, onUpdateCategory }: DashboardPageProps) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thisWeekStart = useMemo(() => startOfWeekMonday(todayIso), [todayIso]);
  const thisMonth = useMemo(() => todayIso.slice(0, 7), [todayIso]);
  const previousMonth = useMemo(() => addMonths(thisMonth, -1), [thisMonth]);
  const [selectedWeekStart, setSelectedWeekStart] = useState(thisWeekStart);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const [firstComparisonMonth, setFirstComparisonMonth] = useState(thisMonth);
  const [secondComparisonMonth, setSecondComparisonMonth] = useState(previousMonth);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('week');
  const [showWeeklyTransactions, setShowWeeklyTransactions] = useState(true);
  const [showMonthlyTransactions, setShowMonthlyTransactions] = useState(true);

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
    () => buildSpendSharePoints(activeTransactions, spendCategories, (transaction) => startOfWeekMonday(transaction.date)).slice(-4),
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
  const normalizedFirstComparisonMonth = useMemo(
    () => (/^\d{4}-\d{2}$/.test(firstComparisonMonth) ? firstComparisonMonth : thisMonth),
    [firstComparisonMonth, thisMonth]
  );
  const normalizedSecondComparisonMonth = useMemo(
    () => (/^\d{4}-\d{2}$/.test(secondComparisonMonth) ? secondComparisonMonth : previousMonth),
    [previousMonth, secondComparisonMonth]
  );
  const selectedMonthStart = useMemo(() => startOfMonth(normalizedMonth), [normalizedMonth]);
  const selectedMonthEnd = useMemo(() => endOfMonth(normalizedMonth), [normalizedMonth]);

  const periodRange = useMemo(
    () => {
      if (periodMode === 'week') {
        return { start: selectedWeekStart, end: selectedWeekEnd };
      }
      return { start: selectedMonthStart, end: selectedMonthEnd };
    },
    [periodMode, selectedWeekEnd, selectedWeekStart, selectedMonthEnd, selectedMonthStart]
  );

  const periodTransactions = useMemo(
    () => activeTransactions.filter((transaction) => transaction.date >= periodRange.start && transaction.date <= periodRange.end),
    [activeTransactions, periodRange.end, periodRange.start]
  );
  const weeklyTransactions = useMemo(
    () => activeTransactions.filter((transaction) => transaction.date >= selectedWeekStart && transaction.date <= selectedWeekEnd),
    [activeTransactions, selectedWeekEnd, selectedWeekStart]
  );
  const monthlyTransactions = useMemo(
    () => activeTransactions.filter((transaction) => transaction.date >= selectedMonthStart && transaction.date <= selectedMonthEnd),
    [activeTransactions, selectedMonthEnd, selectedMonthStart]
  );

  const periodRows = useMemo<PeriodCategoryRow[]>(() => buildCategoryRows(periodTransactions, categories), [categories, periodTransactions]);

  const periodTotalSpent = useMemo(() => sum(periodRows.map((row) => row.spent)), [periodRows]);
  const periodTotalEarned = useMemo(() => sum(periodRows.map((row) => row.earned)), [periodRows]);
  const periodTotalNet = periodTotalEarned - periodTotalSpent;
  const periodSpendDistributionSlices = useMemo(
    () => periodRows.filter((row) => row.spent > 0).map((row) => ({ label: row.category, value: row.spent })),
    [periodRows]
  );

  const firstComparisonRange = useMemo(
    () => ({
      start: startOfMonth(normalizedFirstComparisonMonth),
      end: endOfMonth(normalizedFirstComparisonMonth)
    }),
    [normalizedFirstComparisonMonth]
  );
  const secondComparisonRange = useMemo(
    () => ({
      start: startOfMonth(normalizedSecondComparisonMonth),
      end: endOfMonth(normalizedSecondComparisonMonth)
    }),
    [normalizedSecondComparisonMonth]
  );

  const firstComparisonTransactions = useMemo(
    () =>
      activeTransactions.filter(
        (transaction) => transaction.date >= firstComparisonRange.start && transaction.date <= firstComparisonRange.end
      ),
    [activeTransactions, firstComparisonRange.end, firstComparisonRange.start]
  );
  const secondComparisonTransactions = useMemo(
    () =>
      activeTransactions.filter(
        (transaction) => transaction.date >= secondComparisonRange.start && transaction.date <= secondComparisonRange.end
      ),
    [activeTransactions, secondComparisonRange.end, secondComparisonRange.start]
  );

  const firstComparisonRows = useMemo<PeriodCategoryRow[]>(
    () => buildCategoryRows(firstComparisonTransactions, spendCategories),
    [firstComparisonTransactions, spendCategories]
  );
  const secondComparisonRows = useMemo<PeriodCategoryRow[]>(
    () => buildCategoryRows(secondComparisonTransactions, spendCategories),
    [secondComparisonTransactions, spendCategories]
  );
  const firstComparisonRowMap = useMemo(
    () => new Map<Category, PeriodCategoryRow>(firstComparisonRows.map((row) => [row.category, row] as const)),
    [firstComparisonRows]
  );
  const secondComparisonRowMap = useMemo(
    () => new Map<Category, PeriodCategoryRow>(secondComparisonRows.map((row) => [row.category, row] as const)),
    [secondComparisonRows]
  );

  const monthComparisonRows = useMemo<MonthComparisonRow[]>(() => {
    const rows = spendCategories.map((category) => {
      const first = firstComparisonRowMap.get(category);
      const second = secondComparisonRowMap.get(category);
      const firstShare = first?.spendShare ?? 0;
      const secondShare = second?.spendShare ?? 0;
      const firstSpent = first?.spent ?? 0;
      const secondSpent = second?.spent ?? 0;

      return {
        category,
        firstShare,
        secondShare,
        firstSpent,
        secondSpent,
        shareDelta: firstShare - secondShare
      };
    });

    return rows.sort((a, b) => Math.max(b.firstSpent, b.secondSpent) - Math.max(a.firstSpent, a.secondSpent));
  }, [firstComparisonRowMap, secondComparisonRowMap, spendCategories]);

  const firstComparisonTotalSpent = useMemo(
    () =>
      sum(firstComparisonTransactions.filter((transaction) => transaction.amount < 0).map((transaction) => Math.abs(transaction.amount))),
    [firstComparisonTransactions]
  );
  const firstComparisonTotalEarned = useMemo(
    () => sum(firstComparisonTransactions.filter((transaction) => transaction.amount > 0).map((transaction) => transaction.amount)),
    [firstComparisonTransactions]
  );
  const firstComparisonTotalNet = firstComparisonTotalEarned - firstComparisonTotalSpent;
  const secondComparisonTotalSpent = useMemo(
    () =>
      sum(secondComparisonTransactions.filter((transaction) => transaction.amount < 0).map((transaction) => Math.abs(transaction.amount))),
    [secondComparisonTransactions]
  );
  const secondComparisonTotalEarned = useMemo(
    () => sum(secondComparisonTransactions.filter((transaction) => transaction.amount > 0).map((transaction) => transaction.amount)),
    [secondComparisonTransactions]
  );
  const secondComparisonTotalNet = secondComparisonTotalEarned - secondComparisonTotalSpent;

  const firstComparisonSpendDistributionSlices = useMemo(
    () => firstComparisonRows.filter((row) => row.spent > 0).map((row) => ({ label: row.category, value: row.spent })),
    [firstComparisonRows]
  );
  const secondComparisonSpendDistributionSlices = useMemo(
    () => secondComparisonRows.filter((row) => row.spent > 0).map((row) => ({ label: row.category, value: row.spent })),
    [secondComparisonRows]
  );

  const firstComparisonMonthLabel = useMemo(() => formatMonthLabel(normalizedFirstComparisonMonth), [normalizedFirstComparisonMonth]);
  const secondComparisonMonthLabel = useMemo(
    () => formatMonthLabel(normalizedSecondComparisonMonth),
    [normalizedSecondComparisonMonth]
  );
  const monthComparisonHasData = useMemo(
    () => monthComparisonRows.some((row) => row.firstSpent > 0 || row.secondSpent > 0),
    [monthComparisonRows]
  );

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

  const latestMonthlyPoint = metrics.monthlyTrend[metrics.monthlyTrend.length - 1];
  const currentMonthKey = latestMonthlyPoint?.month ?? metrics.weekEnd.slice(0, 7);
  const currentMonthLabel = formatMonthLabel(currentMonthKey);
  const monthlyIncome = latestMonthlyPoint?.income ?? 0;
  const monthlyExpenses = latestMonthlyPoint?.expenses ?? 0;
  const monthlyNet = latestMonthlyPoint?.net ?? monthlyIncome + monthlyExpenses;
  const monthlyNetClass = monthlyNet < 0 ? 'neg' : 'pos';
  const weeklyNetClass = metrics.weeklyNet < 0 ? 'neg' : 'pos';

  return (
    <div className="page-grid">
      <section className="dashboard-summary-stack dashboard-order-summary">
        <div className="metric-grid">
          <article className="metric-card">
            <span>Monthly Income</span>
            <strong className="pos">{formatMoney(monthlyIncome)}</strong>
            <small>{currentMonthLabel} to date</small>
          </article>
          <article className="metric-card">
            <span>Monthly Expenses</span>
            <strong className="neg">{formatMoney(monthlyExpenses)}</strong>
            <small>Excluded rows removed</small>
          </article>
          <article className="metric-card">
            <span>Monthly Net</span>
            <strong className={monthlyNetClass}>{formatMoney(monthlyNet)}</strong>
            <small>{currentMonthLabel}</small>
          </article>
        </div>

        <div className="metric-grid">
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
        </div>
      </section>

      <section className="panel dashboard-order-spend">
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
          Weekly chart shows the last 4 weeks only. Both charts use period-average spend share from total spend in that period, and the Y-axis scales to the max visible share.
        </p>
      </section>

      <section className="panel dashboard-order-category">
        <header className="panel-header">
          <h3>Category Percentages by Week or Month</h3>
          <span>{periodMode === 'week' ? 'Week view' : periodMode === 'month' ? 'Month view' : 'Compare months'}</span>
        </header>

        <div className="budget-controls">
          {periodMode !== 'compare-months' ? (
            <>
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

              <div className="button-group">
                <button className="ghost" onClick={() => setSelectedMonth(thisMonth)}>
                  This Month
                </button>
                <button className="ghost" onClick={() => setSelectedMonth((current) => shiftMonth(current, -1))}>
                  Back
                </button>
                <button className="ghost" onClick={() => setSelectedMonth((current) => shiftMonth(current, 1))}>
                  Forward
                </button>
              </div>
            </>
          ) : (
            <div className="dashboard-month-compare-pickers">
              <label>
                First Month
                <input type="month" value={normalizedFirstComparisonMonth} onChange={(event) => setFirstComparisonMonth(event.target.value)} />
              </label>
              <label>
                Second Month
                <input
                  type="month"
                  value={normalizedSecondComparisonMonth}
                  onChange={(event) => setSecondComparisonMonth(event.target.value)}
                />
              </label>
              <div className="button-group">
                <button
                  className="ghost"
                  onClick={() => {
                    setFirstComparisonMonth(thisMonth);
                    setSecondComparisonMonth(previousMonth);
                  }}
                >
                  Latest Pair
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setFirstComparisonMonth(secondComparisonMonth);
                    setSecondComparisonMonth(firstComparisonMonth);
                  }}
                >
                  Swap
                </button>
              </div>
            </div>
          )}

          <div className="button-group period-mode-buttons" role="tablist" aria-label="Dashboard category period mode">
            <button className={`ghost ${periodMode === 'week' ? 'active' : ''}`} onClick={() => setPeriodMode('week')}>
              Use Week
            </button>
            <button className={`ghost ${periodMode === 'month' ? 'active' : ''}`} onClick={() => setPeriodMode('month')}>
              Use Month
            </button>
            <button className={`ghost ${periodMode === 'compare-months' ? 'active' : ''}`} onClick={() => setPeriodMode('compare-months')}>
              Compare Months
            </button>
          </div>
        </div>

        {periodMode === 'compare-months' ? (
          <>
            <div className="dashboard-compare-month-grid">
              <article className="dashboard-period-summary dashboard-compare-summary-card">
                <span>
                  {firstComparisonMonthLabel} ({firstComparisonRange.start} to {firstComparisonRange.end})
                </span>
                <strong className="neg">Spent {formatMoney(firstComparisonTotalSpent)}</strong>
                <strong className="pos">Earned {formatMoney(firstComparisonTotalEarned)}</strong>
                <strong className={firstComparisonTotalNet < 0 ? 'neg' : 'pos'}>Net {formatMoney(firstComparisonTotalNet)}</strong>
              </article>

              <article className="dashboard-period-summary dashboard-compare-summary-card">
                <span>
                  {secondComparisonMonthLabel} ({secondComparisonRange.start} to {secondComparisonRange.end})
                </span>
                <strong className="neg">Spent {formatMoney(secondComparisonTotalSpent)}</strong>
                <strong className="pos">Earned {formatMoney(secondComparisonTotalEarned)}</strong>
                <strong className={secondComparisonTotalNet < 0 ? 'neg' : 'pos'}>Net {formatMoney(secondComparisonTotalNet)}</strong>
              </article>
            </div>

            <div className="dashboard-compare-month-grid">
              <DonutChart title={`${firstComparisonMonthLabel} Spend Distribution`} slices={firstComparisonSpendDistributionSlices} />
              <DonutChart title={`${secondComparisonMonthLabel} Spend Distribution`} slices={secondComparisonSpendDistributionSlices} />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>{firstComparisonMonthLabel}</th>
                    <th>{secondComparisonMonthLabel}</th>
                    <th>Share Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {monthComparisonHasData ? (
                    monthComparisonRows.map((row) => (
                      <tr key={`month-compare-${row.category}`}>
                        <td>{row.category}</td>
                        <td>{row.firstShare.toFixed(1)}% · {formatMoney(row.firstSpent)}</td>
                        <td>{row.secondShare.toFixed(1)}% · {formatMoney(row.secondSpent)}</td>
                        <td className={row.shareDelta > 0 ? 'compare-share-up' : row.shareDelta < 0 ? 'compare-share-down' : ''}>
                          {row.shareDelta > 0 ? '+' : ''}
                          {row.shareDelta.toFixed(1)} pts
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>
                        No spend rows found for {firstComparisonMonthLabel} and {secondComparisonMonthLabel}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="hint">Percentages are each category&apos;s share of total spending for that month.</p>
          </>
        ) : (
          <>
            <div className="dashboard-period-summary">
              <span>
                {periodRange.start} to {periodRange.end}
              </span>
              <strong className="neg">Spent {formatMoney(periodTotalSpent)}</strong>
              <strong className="pos">Earned {formatMoney(periodTotalEarned)}</strong>
              <strong className={periodTotalNet < 0 ? 'neg' : 'pos'}>Net {formatMoney(periodTotalNet)}</strong>
            </div>

            <DonutChart
              title={periodMode === 'week' ? 'Weekly Spend Distribution' : 'Monthly Spend Distribution'}
              slices={periodSpendDistributionSlices}
            />

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
          </>
        )}
      </section>

      <section className="panel dashboard-order-week-transactions">
        <header className="panel-header">
          <h3>This Week&apos;s Transactions</h3>
          <div className="panel-header-actions">
            <span>{weeklyTransactions.length} rows</span>
            <button
              className="ghost"
              type="button"
              onClick={() => setShowWeeklyTransactions((current) => !current)}
              aria-expanded={showWeeklyTransactions}
              aria-controls="dashboard-week-transactions-table"
            >
              {showWeeklyTransactions ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </header>

        {showWeeklyTransactions ? (
          <div className="table-wrap" id="dashboard-week-transactions-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {weeklyTransactions.map((transaction) => (
                  <tr key={`dashboard-week-tx-${transaction.id}`}>
                    <td>{formatDate(transaction.date)}</td>
                    <td>{transaction.description}</td>
                    <td className={transaction.amount < 0 ? 'neg' : 'pos'}>{formatMoney(transaction.amount)}</td>
                    <td>
                      <select
                        value={transaction.category}
                        onChange={(event) => void onUpdateCategory(transaction.id, event.target.value as Category)}
                      >
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {weeklyTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No transactions found for {selectedWeekStart} through {selectedWeekEnd}.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="panel dashboard-order-month-transactions">
        <header className="panel-header">
          <h3>This Month&apos;s Transactions</h3>
          <div className="panel-header-actions">
            <span>{monthlyTransactions.length} rows</span>
            <button
              className="ghost"
              type="button"
              onClick={() => setShowMonthlyTransactions((current) => !current)}
              aria-expanded={showMonthlyTransactions}
              aria-controls="dashboard-month-transactions-table"
            >
              {showMonthlyTransactions ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </header>

        {showMonthlyTransactions ? (
          <div className="table-wrap" id="dashboard-month-transactions-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTransactions.map((transaction) => (
                  <tr key={`dashboard-month-tx-${transaction.id}`}>
                    <td>{formatDate(transaction.date)}</td>
                    <td>{transaction.description}</td>
                    <td className={transaction.amount < 0 ? 'neg' : 'pos'}>{formatMoney(transaction.amount)}</td>
                    <td>
                      <select
                        value={transaction.category}
                        onChange={(event) => void onUpdateCategory(transaction.id, event.target.value as Category)}
                      >
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {monthlyTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No transactions found for {selectedMonthStart} through {selectedMonthEnd}.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
