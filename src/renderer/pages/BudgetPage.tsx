import { useEffect, useMemo, useState } from 'react';
import { type Category, type Settings, type Transaction, type WeeklyBudgetTarget } from '../../shared/types';
import { formatDate, formatMoney } from '../format';

interface BudgetPageProps {
  transactions: Transaction[];
  categories: Category[];
  budgets: WeeklyBudgetTarget[];
  settings: Settings | null;
  onSetBudget: (category: WeeklyBudgetTarget['category'], weeklyLimit: number) => Promise<void>;
  onUpdateSettings: (settings: Partial<Settings>) => Promise<void>;
  onUpdateCategory: (id: string, category: Category) => Promise<void>;
  onExportDashboard: () => Promise<string | null>;
}

interface CategoryBudgetRow {
  category: Category;
  limit: number;
  spent: number;
  remaining: number;
  overBudget: boolean;
}

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

function daysInMonth(month: string): number {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.getUTCDate();
}

function asExpenseSpent(amount: number): number {
  return amount < 0 ? Math.abs(amount) : 0;
}

function buildCategoryRows(
  transactions: Transaction[],
  budgetMap: Map<Category, number>,
  categories: Category[],
  limitMultiplier = 1
): CategoryBudgetRow[] {
  return categories.map((category) => {
    const categoryTotal = sum(transactions.filter((tx) => tx.category === category).map((tx) => tx.amount));
    const limit = (budgetMap.get(category) ?? 0) * limitMultiplier;

    if (category === 'Income') {
      return {
        category,
        limit,
        spent: categoryTotal,
        remaining: categoryTotal - limit,
        overBudget: false
      };
    }

    const spent = asExpenseSpent(categoryTotal);
    return {
      category,
      limit,
      spent,
      remaining: limit - spent,
      overBudget: spent > limit && limit > 0
    };
  });
}

export function BudgetPage({
  transactions,
  categories,
  budgets,
  settings,
  onSetBudget,
  onUpdateSettings,
  onUpdateCategory,
  onExportDashboard
}: BudgetPageProps) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thisWeekStart = useMemo(() => startOfWeekMonday(todayIso), [todayIso]);
  const thisMonth = useMemo(() => todayIso.slice(0, 7), [todayIso]);

  const [selectedWeekStart, setSelectedWeekStart] = useState(thisWeekStart);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [targetDraft, setTargetDraft] = useState(settings?.weekly_net_savings_target.toString() ?? '0');
  const [exportPath, setExportPath] = useState('');

  useEffect(() => {
    setTargetDraft(settings?.weekly_net_savings_target.toString() ?? '0');
  }, [settings?.weekly_net_savings_target]);

  const budgetMap = useMemo(() => new Map(budgets.map((budget) => [budget.category, budget.weekly_limit])), [budgets]);
  const userCategories = useMemo(
    () => categories.filter((category) => category !== 'Uncategorized' && category !== 'Transfer'),
    [categories]
  );
  const activeTransactions = useMemo(
    () => transactions.filter((tx) => !tx.deleted && !tx.excluded),
    [transactions]
  );

  const weekEnd = useMemo(() => addDays(selectedWeekStart, 6), [selectedWeekStart]);
  const normalizedMonth = useMemo(
    () => (/^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : thisMonth),
    [selectedMonth, thisMonth]
  );
  const monthStart = useMemo(() => startOfMonth(normalizedMonth), [normalizedMonth]);
  const monthEnd = useMemo(() => endOfMonth(normalizedMonth), [normalizedMonth]);
  const monthlyLimitMultiplier = useMemo(() => daysInMonth(normalizedMonth) / 7, [normalizedMonth]);

  const weeklyTransactions = useMemo(
    () => activeTransactions.filter((tx) => tx.date >= selectedWeekStart && tx.date <= weekEnd),
    [activeTransactions, selectedWeekStart, weekEnd]
  );
  const monthlyTransactions = useMemo(
    () => activeTransactions.filter((tx) => tx.date >= monthStart && tx.date <= monthEnd),
    [activeTransactions, monthStart, monthEnd]
  );

  const weeklyRows = useMemo(
    () => buildCategoryRows(weeklyTransactions, budgetMap, userCategories, 1),
    [weeklyTransactions, budgetMap, userCategories]
  );
  const monthlyRows = useMemo(
    () => buildCategoryRows(monthlyTransactions, budgetMap, userCategories, monthlyLimitMultiplier),
    [monthlyTransactions, budgetMap, userCategories, monthlyLimitMultiplier]
  );

  const weeklyIncome = useMemo(() => sum(weeklyTransactions.filter((tx) => tx.amount > 0).map((tx) => tx.amount)), [weeklyTransactions]);
  const weeklyExpenses = useMemo(
    () => sum(weeklyTransactions.filter((tx) => tx.amount < 0).map((tx) => tx.amount)),
    [weeklyTransactions]
  );
  const weeklyNet = weeklyIncome + weeklyExpenses;
  const weeklySavingsTarget = settings?.weekly_net_savings_target ?? 0;
  const weeklySavingsDelta = weeklyNet - weeklySavingsTarget;

  const monthlyIncome = useMemo(
    () => sum(monthlyTransactions.filter((tx) => tx.amount > 0).map((tx) => tx.amount)),
    [monthlyTransactions]
  );
  const monthlyExpenses = useMemo(
    () => sum(monthlyTransactions.filter((tx) => tx.amount < 0).map((tx) => tx.amount)),
    [monthlyTransactions]
  );
  const monthlyNet = monthlyIncome + monthlyExpenses;

  if (!settings) {
    return (
      <div className="page-grid">
        <section className="panel">Loading budget page...</section>
      </div>
    );
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <header className="panel-header">
          <h3>Budget Periods</h3>
        </header>

        <div className="budget-controls">
          <div className="button-group">
            <button className="ghost" onClick={() => setSelectedWeekStart(thisWeekStart)}>
              This Week
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
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Weekly Income</span>
          <strong className="pos">{formatMoney(weeklyIncome)}</strong>
          <small>
            {formatDate(selectedWeekStart)} to {formatDate(weekEnd)}
          </small>
        </article>
        <article className="metric-card">
          <span>Weekly Expenses</span>
          <strong className="neg">{formatMoney(weeklyExpenses)}</strong>
          <small>{weeklyTransactions.length} included transactions</small>
        </article>
        <article className="metric-card">
          <span>Weekly Net</span>
          <strong className={weeklyNet < 0 ? 'neg' : 'pos'}>{formatMoney(weeklyNet)}</strong>
          <small>Target {formatMoney(weeklySavingsTarget)}</small>
        </article>
        <article className="metric-card">
          <span>Savings Delta</span>
          <strong className={weeklySavingsDelta < 0 ? 'neg' : 'pos'}>{formatMoney(weeklySavingsDelta)}</strong>
          <small>{weeklySavingsDelta >= 0 ? 'Ahead of target' : 'Below target'}</small>
        </article>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>Weekly Budget by Category</h3>
          <span>
            {selectedWeekStart} to {weekEnd}
          </span>
        </header>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Weekly Limit</th>
                <th>Actual</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {weeklyRows.map((row) => {
                const isIncome = row.category === 'Income';
                const draft = budgetDrafts[row.category] ?? String(budgetMap.get(row.category) ?? 0);
                return (
                  <tr key={`weekly-${row.category}`}>
                    <td>{row.category}</td>
                    <td>
                      <input
                        type="number"
                        value={draft}
                        onChange={(event) =>
                          setBudgetDrafts((current) => ({
                            ...current,
                            [row.category]: event.target.value
                          }))
                        }
                        onBlur={() => {
                          const next = Number.parseFloat((budgetDrafts[row.category] ?? draft).trim());
                          if (Number.isFinite(next)) {
                            void onSetBudget(row.category, next);
                          }
                        }}
                      />
                    </td>
                    <td className={isIncome ? 'pos' : 'neg'}>{formatMoney(isIncome ? row.spent : -row.spent)}</td>
                    <td className={row.remaining < 0 ? 'neg' : 'pos'}>{formatMoney(row.remaining)}</td>
                    <td>
                      {row.overBudget ? <span className="chip chip-alert">Over budget</span> : <span className="chip">On track</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="settings-inline">
          <label>
            Weekly Net Savings Target
            <input
              type="number"
              value={targetDraft}
              onChange={(event) => setTargetDraft(event.target.value)}
              onBlur={() => {
                const next = Number.parseFloat(targetDraft.trim());
                if (Number.isFinite(next)) {
                  void onUpdateSettings({ weekly_net_savings_target: next });
                }
              }}
            />
          </label>
          <button
            className="ghost"
            onClick={() =>
              void onExportDashboard().then((path) => {
                if (path) {
                  setExportPath(path);
                }
              })
            }
          >
            Export Dashboard CSV
          </button>
        </div>

        {exportPath ? <p className="hint">Export saved: {exportPath}</p> : null}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>This Week&apos;s Transactions</h3>
          <span>{weeklyTransactions.length} rows</span>
        </header>

        <div className="table-wrap">
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
              {weeklyTransactions.map((tx) => (
                <tr key={`week-tx-${tx.id}`}>
                  <td>{formatDate(tx.date)}</td>
                  <td>{tx.description}</td>
                  <td className={tx.amount < 0 ? 'neg' : 'pos'}>{formatMoney(tx.amount)}</td>
                  <td>
                    <select value={tx.category} onChange={(event) => void onUpdateCategory(tx.id, event.target.value as Category)}>
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
                  <td colSpan={4}>No transactions found for {selectedWeekStart} through {weekEnd}.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Monthly Income</span>
          <strong className="pos">{formatMoney(monthlyIncome)}</strong>
          <small>{normalizedMonth}</small>
        </article>
        <article className="metric-card">
          <span>Monthly Expenses</span>
          <strong className="neg">{formatMoney(monthlyExpenses)}</strong>
          <small>{monthlyTransactions.length} included transactions</small>
        </article>
        <article className="metric-card">
          <span>Monthly Net</span>
          <strong className={monthlyNet < 0 ? 'neg' : 'pos'}>{formatMoney(monthlyNet)}</strong>
          <small>
            {formatDate(monthStart)} to {formatDate(monthEnd)}
          </small>
        </article>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>Monthly Budget by Category</h3>
          <span>
            {monthStart} to {monthEnd}
          </span>
        </header>

        <p className="hint">Monthly limits are prorated from weekly limits using the selected month length.</p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Monthly Limit</th>
                <th>Actual</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((row) => {
                const isIncome = row.category === 'Income';
                return (
                  <tr key={`monthly-${row.category}`}>
                    <td>{row.category}</td>
                    <td>{formatMoney(row.limit)}</td>
                    <td className={isIncome ? 'pos' : 'neg'}>{formatMoney(isIncome ? row.spent : -row.spent)}</td>
                    <td className={row.remaining < 0 ? 'neg' : 'pos'}>{formatMoney(row.remaining)}</td>
                    <td>
                      {row.overBudget ? <span className="chip chip-alert">Over budget</span> : <span className="chip">On track</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>This Month&apos;s Transactions</h3>
          <span>{monthlyTransactions.length} rows</span>
        </header>

        <div className="table-wrap">
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
              {monthlyTransactions.map((tx) => (
                <tr key={`month-tx-${tx.id}`}>
                  <td>{formatDate(tx.date)}</td>
                  <td>{tx.description}</td>
                  <td className={tx.amount < 0 ? 'neg' : 'pos'}>{formatMoney(tx.amount)}</td>
                  <td>
                    <select value={tx.category} onChange={(event) => void onUpdateCategory(tx.id, event.target.value as Category)}>
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
                  <td colSpan={4}>No transactions found for {monthStart} through {monthEnd}.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
