import { useEffect, useMemo, useState } from 'react';
import { type Category, type SourceType, type Transaction, type TransactionFilters } from '../../shared/types';
import { formatDate, formatMoney } from '../format';

interface TransactionsPageProps {
  transactions: Transaction[];
  categories: Category[];
  onLoad: (filters: TransactionFilters) => Promise<void>;
  onUpdateCategory: (id: string, category: Category) => Promise<void>;
  onBulkUpdateCategory: (ids: string[], category: Category) => Promise<void>;
  onUpdateDescription: (id: string, description: string) => Promise<void>;
  onSetExcluded: (id: string, excluded: boolean) => Promise<void>;
  onBulkSetExcluded: (ids: string[], excluded: boolean) => Promise<void>;
  onSoftDelete: (id: string, reason: string) => Promise<void>;
  onBulkSoftDelete: (ids: string[], reason: string) => Promise<void>;
  onUndoDelete: (id: string) => Promise<void>;
  onBulkUndoDelete: (ids: string[]) => Promise<void>;
  onExportTransactions: () => Promise<string | null>;
}

interface WeeklyTransactionGroup {
  weekStart: string;
  weekEnd: string;
  transactions: Transaction[];
  income: number;
  expenses: number;
  net: number;
}

type TransactionSortOption =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'description_asc'
  | 'description_desc';

const VISIBLE_ROW_LIMIT_OPTIONS = [100, 250, 500, 1000, 2000] as const;
const DEFAULT_VISIBLE_ROW_LIMIT = 500;

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

function compareByDateDescending(a: Transaction, b: Transaction): number {
  if (a.date === b.date) {
    return b.updated_at.localeCompare(a.updated_at);
  }

  return b.date.localeCompare(a.date);
}

function compareTransactions(a: Transaction, b: Transaction, sortBy: TransactionSortOption): number {
  if (sortBy === 'date_desc') {
    return compareByDateDescending(a, b);
  }

  if (sortBy === 'date_asc') {
    if (a.date === b.date) {
      return a.updated_at.localeCompare(b.updated_at);
    }

    return a.date.localeCompare(b.date);
  }

  if (sortBy === 'amount_desc') {
    if (a.amount === b.amount) {
      return compareByDateDescending(a, b);
    }

    return b.amount - a.amount;
  }

  if (sortBy === 'amount_asc') {
    if (a.amount === b.amount) {
      return compareByDateDescending(a, b);
    }

    return a.amount - b.amount;
  }

  if (sortBy === 'description_asc') {
    const textComparison = a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
    if (textComparison !== 0) {
      return textComparison;
    }

    return compareByDateDescending(a, b);
  }

  const textComparison = b.description.localeCompare(a.description, undefined, { sensitivity: 'base' });
  if (textComparison !== 0) {
    return textComparison;
  }

  return compareByDateDescending(a, b);
}

export function TransactionsPage({
  transactions,
  categories,
  onLoad,
  onUpdateCategory,
  onBulkUpdateCategory,
  onUpdateDescription,
  onSetExcluded,
  onBulkSetExcluded,
  onSoftDelete,
  onBulkSoftDelete,
  onUndoDelete,
  onBulkUndoDelete,
  onExportTransactions
}: TransactionsPageProps) {
  const [filters, setFilters] = useState<TransactionFilters>({
    source: 'all',
    category: 'all',
    includeDeleted: false,
    includeExcluded: true,
    text: ''
  });
  const [draftDescriptions, setDraftDescriptions] = useState<Record<string, string>>({});
  const [exportPath, setExportPath] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<Category>('Uncategorized');
  const [sortBy, setSortBy] = useState<TransactionSortOption>('date_desc');
  const [visibleRowLimit, setVisibleRowLimit] = useState(DEFAULT_VISIBLE_ROW_LIMIT);
  const sortedTransactions = useMemo(
    () => [...transactions].sort((a, b) => compareTransactions(a, b, sortBy)),
    [transactions, sortBy]
  );
  const visibleTransactions = useMemo(() => sortedTransactions.slice(0, visibleRowLimit), [sortedTransactions, visibleRowLimit]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedTransactions = useMemo(
    () => visibleTransactions.filter((tx) => selectedIdSet.has(tx.id)),
    [visibleTransactions, selectedIdSet]
  );

  const selectedEditableIds = useMemo(
    () => selectedTransactions.filter((tx) => !tx.deleted).map((tx) => tx.id),
    [selectedTransactions]
  );

  const selectedDeletedIds = useMemo(
    () => selectedTransactions.filter((tx) => tx.deleted).map((tx) => tx.id),
    [selectedTransactions]
  );

  const selectedIncludedIds = useMemo(
    () => selectedTransactions.filter((tx) => !tx.deleted && !tx.excluded).map((tx) => tx.id),
    [selectedTransactions]
  );

  const selectedExcludedIds = useMemo(
    () => selectedTransactions.filter((tx) => !tx.deleted && tx.excluded).map((tx) => tx.id),
    [selectedTransactions]
  );

  useEffect(() => {
    const visibleIds = new Set(visibleTransactions.map((tx) => tx.id));
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [visibleTransactions]);

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }

    const exists = categories.some((category) => category.toLowerCase() === bulkCategory.toLowerCase());
    if (!exists) {
      setBulkCategory(categories[0]);
    }
  }, [categories, bulkCategory]);

  const totals = useMemo(() => {
    const income = transactions.filter((tx) => tx.amount > 0 && !tx.deleted).reduce((sum, tx) => sum + tx.amount, 0);
    const expenses = transactions.filter((tx) => tx.amount < 0 && !tx.deleted).reduce((sum, tx) => sum + tx.amount, 0);
    return {
      income,
      expenses,
      net: income + expenses
    };
  }, [transactions]);

  const weeklyGroups = useMemo<WeeklyTransactionGroup[]>(() => {
    const groupsByWeekStart = new Map<string, WeeklyTransactionGroup>();

    visibleTransactions.forEach((tx) => {
      const weekStart = startOfWeekMonday(tx.date);
      const current = groupsByWeekStart.get(weekStart);

      if (!current) {
        groupsByWeekStart.set(weekStart, {
          weekStart,
          weekEnd: addDays(weekStart, 6),
          transactions: [tx],
          income: tx.amount > 0 && !tx.deleted ? tx.amount : 0,
          expenses: tx.amount < 0 && !tx.deleted ? tx.amount : 0,
          net: tx.deleted ? 0 : tx.amount
        });
        return;
      }

      current.transactions.push(tx);
      if (!tx.deleted) {
        if (tx.amount > 0) {
          current.income += tx.amount;
        } else if (tx.amount < 0) {
          current.expenses += tx.amount;
        }
        current.net += tx.amount;
      }
    });

    const grouped = [...groupsByWeekStart.values()].map((group) => ({
      ...group,
      transactions: [...group.transactions].sort((a, b) => compareTransactions(a, b, sortBy))
    }));

    grouped.sort((a, b) => {
      if (sortBy === 'date_asc') {
        return a.weekStart.localeCompare(b.weekStart);
      }

      return b.weekStart.localeCompare(a.weekStart);
    });

    return grouped;
  }, [visibleTransactions, sortBy]);

  async function applyFilters(): Promise<void> {
    await onLoad(filters);
  }

  function toggleSelection(id: string, selected: boolean): void {
    setSelectedIds((current) => {
      if (selected) {
        if (current.includes(id)) {
          return current;
        }
        return [...current, id];
      }

      return current.filter((currentId) => currentId !== id);
    });
  }

  function setAllVisibleSelected(selected: boolean): void {
    if (!selected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(visibleTransactions.map((tx) => tx.id));
  }

  function setWeekSelected(weekIds: string[], selected: boolean): void {
    if (!selected) {
      setSelectedIds((current) => current.filter((id) => !weekIds.includes(id)));
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      weekIds.forEach((id) => next.add(id));
      return [...next];
    });
  }

  async function applyBulkCategory(): Promise<void> {
    if (selectedEditableIds.length === 0) {
      return;
    }
    await onBulkUpdateCategory(selectedEditableIds, bulkCategory);
  }

  async function applyBulkExcluded(excluded: boolean): Promise<void> {
    const ids = excluded ? selectedIncludedIds : selectedExcludedIds;

    if (ids.length === 0) {
      return;
    }

    await onBulkSetExcluded(ids, excluded);
  }

  async function applyBulkDelete(): Promise<void> {
    if (selectedEditableIds.length === 0) {
      return;
    }

    await onBulkSoftDelete(selectedEditableIds, 'Deleted from transaction history');
  }

  async function applyBulkUndoDelete(): Promise<void> {
    if (selectedDeletedIds.length === 0) {
      return;
    }

    await onBulkUndoDelete(selectedDeletedIds);
  }

  const allVisibleSelected = visibleTransactions.length > 0 && selectedTransactions.length === visibleTransactions.length;

  function renderTransactionRow(tx: Transaction): JSX.Element {
    const draft = draftDescriptions[tx.id] ?? tx.description;

    return (
      <tr key={tx.id} className={tx.deleted ? 'row-deleted' : ''}>
        <td className="select-cell">
          <input
            type="checkbox"
            checked={selectedIdSet.has(tx.id)}
            onChange={(event) => toggleSelection(tx.id, event.target.checked)}
            aria-label={`Select transaction ${tx.description} on ${formatDate(tx.date)}`}
          />
        </td>
        <td>{formatDate(tx.date)}</td>
        <td>{tx.source}</td>
        <td>
          <input
            value={draft}
            onChange={(event) =>
              setDraftDescriptions((current) => ({
                ...current,
                [tx.id]: event.target.value
              }))
            }
            onBlur={() => {
              if (draft !== tx.description) {
                void onUpdateDescription(tx.id, draft.trim());
              }
            }}
          />
        </td>
        <td className={tx.amount < 0 ? 'neg' : 'pos'}>{formatMoney(tx.amount)}</td>
        <td>
          <select value={tx.category} onChange={(event) => void onUpdateCategory(tx.id, event.target.value as Category)} disabled={tx.deleted}>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </td>
        <td>
          <div className="status-stack">
            {tx.excluded ? <span className="chip chip-muted">Excluded</span> : null}
            {tx.deleted ? <span className="chip chip-alert">Deleted</span> : null}
          </div>
        </td>
        <td>
          <div className="actions-row">
            {!tx.deleted ? (
              <>
                <button className="ghost" onClick={() => void onSetExcluded(tx.id, !tx.excluded)}>
                  {tx.excluded ? 'Include' : 'Exclude'}
                </button>
                <button className="ghost danger" onClick={() => void onSoftDelete(tx.id, 'Deleted from transaction history')}>
                  Soft Delete
                </button>
              </>
            ) : (
              <button className="ghost" onClick={() => void onUndoDelete(tx.id)}>
                Undo
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <header className="panel-header">
          <h3>Transaction Filters</h3>
          <button
            className="ghost"
            onClick={() => {
              void onLoad({ includeDeleted: false, includeExcluded: true, source: 'all', category: 'all' });
              setFilters({ includeDeleted: false, includeExcluded: true, source: 'all', category: 'all', text: '' });
            }}
          >
            Reset
          </button>
        </header>

        <div className="form-grid compact">
          <label>
            Source
            <select
              value={filters.source ?? 'all'}
              onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value as SourceType | 'all' }))}
            >
              <option value="all">All</option>
              <option value="citizens">Citizens</option>
              <option value="discover">Discover</option>
            </select>
          </label>

          <label>
            Category
            <select
              value={filters.category ?? 'all'}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as Category | 'all' }))}
            >
              <option value="all">All</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            Date From
            <input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value || undefined }))}
            />
          </label>

          <label>
            Date To
            <input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value || undefined }))}
            />
          </label>

          <label>
            Min Amount
            <input
              type="number"
              value={filters.minAmount ?? ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  minAmount: event.target.value === '' ? undefined : Number(event.target.value)
                }))
              }
            />
          </label>

          <label>
            Max Amount
            <input
              type="number"
              value={filters.maxAmount ?? ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  maxAmount: event.target.value === '' ? undefined : Number(event.target.value)
                }))
              }
            />
          </label>

          <label>
            Search Text
            <input
              type="text"
              value={filters.text ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, text: event.target.value }))}
              placeholder="merchant or notes"
            />
          </label>

          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={Boolean(filters.includeExcluded)}
              onChange={(event) => setFilters((current) => ({ ...current, includeExcluded: event.target.checked }))}
            />
            Include excluded
          </label>

          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={Boolean(filters.includeDeleted)}
              onChange={(event) => setFilters((current) => ({ ...current, includeDeleted: event.target.checked }))}
            />
            Include deleted
          </label>

          <div className="button-group">
            <button className="button" onClick={() => void applyFilters()}>
              Apply Filters
            </button>
            <button
              className="ghost"
              onClick={() =>
                void onExportTransactions().then((path) => {
                  if (path) {
                    setExportPath(path);
                  }
                })
              }
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="totals-strip">
          <div>
            <span>Income</span>
            <strong>{formatMoney(totals.income)}</strong>
          </div>
          <div>
            <span>Expenses</span>
            <strong>{formatMoney(totals.expenses)}</strong>
          </div>
          <div>
            <span>Net</span>
            <strong className={totals.net < 0 ? 'neg' : 'pos'}>{formatMoney(totals.net)}</strong>
          </div>
        </div>

        {exportPath ? <p className="hint">Export saved: {exportPath}</p> : null}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3>History by Week</h3>
          <div className="history-header-controls">
            <label className="history-sort-select">
              Sort by
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as TransactionSortOption)}>
                <option value="date_desc">Date (newest first)</option>
                <option value="date_asc">Date (oldest first)</option>
                <option value="amount_desc">Amount (highest first)</option>
                <option value="amount_asc">Amount (lowest first)</option>
                <option value="description_asc">Description (A-Z)</option>
                <option value="description_desc">Description (Z-A)</option>
              </select>
            </label>
            <label className="history-row-limit-select">
              View
              <select value={visibleRowLimit} onChange={(event) => setVisibleRowLimit(Number(event.target.value))}>
                {VISIBLE_ROW_LIMIT_OPTIONS.map((rowLimit) => (
                  <option key={rowLimit} value={rowLimit}>
                    {rowLimit}
                  </option>
                ))}
              </select>
              rows
            </label>
            <span>{transactions.length} rows</span>
          </div>
        </header>

        {transactions.length > visibleTransactions.length ? (
          <p className="hint">Showing the first {visibleTransactions.length} rows for the selected sort to keep scrolling fast.</p>
        ) : null}

        <div className="selection-toolbar">
          <div className="selection-toolbar-summary">
            <strong>{selectedTransactions.length} selected</strong>
            <span>from {visibleTransactions.length} visible rows</span>
          </div>

          <div className="selection-toolbar-actions">
            <button className="ghost" onClick={() => setAllVisibleSelected(true)} disabled={visibleTransactions.length === 0 || allVisibleSelected}>
              Select all visible
            </button>
            <button className="ghost" onClick={() => setAllVisibleSelected(false)} disabled={selectedTransactions.length === 0}>
              Clear selection
            </button>

            <label className="bulk-category-select">
              Category
              <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value as Category)}>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <button className="ghost" onClick={() => void applyBulkCategory()} disabled={selectedEditableIds.length === 0}>
              Set Primary Category
            </button>
            <button className="ghost" onClick={() => void applyBulkExcluded(true)} disabled={selectedIncludedIds.length === 0}>
              Exclude
            </button>
            <button className="ghost" onClick={() => void applyBulkExcluded(false)} disabled={selectedExcludedIds.length === 0}>
              Include
            </button>
            <button className="ghost danger" onClick={() => void applyBulkDelete()} disabled={selectedEditableIds.length === 0}>
              Soft Delete
            </button>
            <button className="ghost" onClick={() => void applyBulkUndoDelete()} disabled={selectedDeletedIds.length === 0}>
              Undo Delete
            </button>
          </div>
        </div>

        <div className="weekly-history">
          {weeklyGroups.map((group) => {
            const weekIds = group.transactions.map((tx) => tx.id);
            const selectedWeekCount = weekIds.filter((id) => selectedIdSet.has(id)).length;
            const allWeekSelected = weekIds.length > 0 && selectedWeekCount === weekIds.length;
            const someWeekSelected = selectedWeekCount > 0 && !allWeekSelected;
            const weekRangeLabel = `${formatDate(group.weekStart)} to ${formatDate(group.weekEnd)}`;

            return (
              <article className="week-section" key={group.weekStart}>
                <header className="week-summary">
                  <div>
                    <h4>{weekRangeLabel}</h4>
                    <small>
                      {group.transactions.length} rows in this week
                      {selectedWeekCount > 0 ? ` · ${selectedWeekCount} selected` : ''}
                    </small>
                  </div>

                  <div className="week-totals">
                    <div>
                      <span>Income</span>
                      <strong className="pos">{formatMoney(group.income)}</strong>
                    </div>
                    <div>
                      <span>Expenses</span>
                      <strong className="neg">{formatMoney(group.expenses)}</strong>
                    </div>
                    <div>
                      <span>Net</span>
                      <strong className={group.net < 0 ? 'neg' : 'pos'}>{formatMoney(group.net)}</strong>
                    </div>
                  </div>
                </header>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="select-cell">
                          <input
                            type="checkbox"
                            checked={allWeekSelected}
                            ref={(element) => {
                              if (element) {
                                element.indeterminate = someWeekSelected;
                              }
                            }}
                            onChange={(event) => setWeekSelected(weekIds, event.target.checked)}
                            aria-label={`Select all transactions for ${weekRangeLabel}`}
                          />
                        </th>
                        <th>Date</th>
                        <th>Source</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Category</th>
                        <th>Flags</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>{group.transactions.map((tx) => renderTransactionRow(tx))}</tbody>
                  </table>
                </div>
              </article>
            );
          })}

          {weeklyGroups.length === 0 ? <p className="hint">No transactions match the current filters.</p> : null}
        </div>
      </section>
    </div>
  );
}
