import { useEffect, useMemo, useState } from 'react';
import './styles.css';
import {
  ALL_CATEGORIES,
  type Category,
  type DashboardMetrics,
  type ImportCsvResult,
  type Rule,
  type Settings,
  type Transaction,
  type TransactionFilters,
  type WeeklyBudgetTarget
} from '../shared/types';
import { BudgetPage } from './pages/BudgetPage';
import { DashboardPage } from './pages/DashboardPage';
import { ImportClassifyPage } from './pages/ImportClassifyPage';
import { RulesPage } from './pages/RulesPage';
import { TransactionsPage } from './pages/TransactionsPage';

const defaultHistoryFilters: TransactionFilters = {
  includeDeleted: false,
  includeExcluded: true,
  source: 'all',
  category: 'all'
};

type View = 'dashboard' | 'budget' | 'import' | 'rules' | 'transactions';

const viewLabels: Record<View, string> = {
  dashboard: 'Dashboard',
  budget: 'Budget',
  import: 'Import + Classify',
  rules: 'Rules',
  transactions: 'Transactions'
};

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [historyTransactions, setHistoryTransactions] = useState<Transaction[]>([]);
  const [historyFilters, setHistoryFilters] = useState<TransactionFilters>(defaultHistoryFilters);
  const [rules, setRules] = useState<Rule[]>([]);
  const [budgets, setBudgets] = useState<WeeklyBudgetTarget[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const categories = useMemo(() => [...ALL_CATEGORIES], []);

  const activeCount = useMemo(() => allTransactions.filter((tx) => !tx.deleted).length, [allTransactions]);
  const statusText = message || 'Import CSV files to begin classification and dashboard tracking.';

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMessage('');
    }, 4500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [message]);

  async function refreshAll(): Promise<void> {
    const [transactions, rulesData, budgetsData, settingsData, metricsData, historyData] = await Promise.all([
      window.budgetApi.getTransactions({ includeDeleted: true, includeExcluded: true, source: 'all', category: 'all' }),
      window.budgetApi.getRules(),
      window.budgetApi.getBudgets(),
      window.budgetApi.getSettings(),
      window.budgetApi.getDashboardMetrics(),
      window.budgetApi.getTransactions(historyFilters)
    ]);

    setAllTransactions(transactions);
    setRules(rulesData);
    setBudgets(budgetsData);
    setSettings(settingsData);
    setMetrics(metricsData);
    setHistoryTransactions(historyData);
  }

  useEffect(() => {
    setBusy(true);
    void refreshAll()
      .catch((error) => {
        setMessage(`Failed to load data: ${(error as Error).message}`);
      })
      .finally(() => setBusy(false));
  }, []);

  async function runAction(label: string, action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
      await refreshAll();
      setMessage(label);
    } catch (error) {
      setMessage(`${label} failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFiles(files: File[]): Promise<ImportCsvResult | null> {
    setBusy(true);
    try {
      const payload = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          content: await file.text()
        }))
      );

      const result = await window.budgetApi.importCsvFiles(payload);
      await refreshAll();
      setMessage(`Imported ${result.importedCount} new transactions.`);
      return result;
    } catch (error) {
      setMessage(`Import failed: ${(error as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function updateCategory(id: string, category: Category): Promise<void> {
    await runAction('Transaction category updated', async () => {
      await window.budgetApi.updateTransaction({ id, category });
    });
  }

  async function updateCategoryBulk(ids: string[], category: Category): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return;
    }

    await runAction(`Category updated for ${uniqueIds.length} transactions`, async () => {
      await window.budgetApi.updateTransactions({ ids: uniqueIds, category });
    });
  }

  async function updateDescription(id: string, description: string): Promise<void> {
    await runAction('Description updated', async () => {
      await window.budgetApi.updateTransaction({ id, description });
    });
  }

  async function setExcluded(id: string, excluded: boolean): Promise<void> {
    await runAction(excluded ? 'Transaction excluded' : 'Transaction included', async () => {
      await window.budgetApi.updateTransaction({ id, excluded });
    });
  }

  async function setExcludedBulk(ids: string[], excluded: boolean): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return;
    }

    await runAction(`${excluded ? 'Excluded' : 'Included'} ${uniqueIds.length} transactions`, async () => {
      await window.budgetApi.updateTransactions({ ids: uniqueIds, excluded });
    });
  }

  async function softDelete(id: string, reason: string): Promise<void> {
    await runAction('Transaction soft deleted', async () => {
      await window.budgetApi.softDeleteTransaction({ id, reason });
    });
  }

  async function softDeleteBulk(ids: string[], reason: string): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return;
    }

    await runAction(`Soft deleted ${uniqueIds.length} transactions`, async () => {
      await window.budgetApi.softDeleteTransactions({ ids: uniqueIds, reason });
    });
  }

  async function undoDelete(id: string): Promise<void> {
    await runAction('Transaction restored', async () => {
      await window.budgetApi.undoDeleteTransaction({ id });
    });
  }

  async function undoDeleteBulk(ids: string[]): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return;
    }

    await runAction(`Restored ${uniqueIds.length} transactions`, async () => {
      await window.budgetApi.undoDeleteTransactions({ ids: uniqueIds });
    });
  }

  async function runRules(scope: 'uncategorized' | 'all'): Promise<number> {
    let updatedCount = 0;
    await runAction(`Rules re-applied (${scope})`, async () => {
      const result = await window.budgetApi.runRules(scope);
      updatedCount = result.updatedCount;
      setMessage(`Rules updated ${result.updatedCount} transactions.`);
    });
    return updatedCount;
  }

  async function loadHistory(filters: TransactionFilters): Promise<void> {
    setBusy(true);
    try {
      setHistoryFilters(filters);
      const rows = await window.budgetApi.getTransactions(filters);
      setHistoryTransactions(rows);
      setMessage(`Loaded ${rows.length} transactions with current filters.`);
    } catch (error) {
      setMessage(`Failed to load filtered transactions: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportTransactions(): Promise<string | null> {
    try {
      const file = await window.budgetApi.exportTransactionsCsv(historyFilters);
      setMessage(`Transactions exported: ${file}`);
      return file;
    } catch (error) {
      setMessage(`Export failed: ${(error as Error).message}`);
      return null;
    }
  }

  async function exportDashboard(): Promise<string | null> {
    try {
      const file = await window.budgetApi.exportDashboardSummaryCsv();
      setMessage(`Dashboard export written: ${file}`);
      return file;
    } catch (error) {
      setMessage(`Dashboard export failed: ${(error as Error).message}`);
      return null;
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient-layer" />

      <header className="topbar">
        <div>
          <h1>Budget Ledger</h1>
          <p>Mac local-first finance console · data path: ~/Documents/BudgetApp</p>
        </div>

        <div className="topbar-meta">
          <div>
            <span>Transactions</span>
            <strong>{activeCount}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{busy ? 'Working...' : 'Ready'}</strong>
          </div>
        </div>
      </header>

      <nav className="nav-tabs">
        {(Object.keys(viewLabels) as View[]).map((view) => (
          <button key={view} className={activeView === view ? 'active' : ''} onClick={() => setActiveView(view)}>
            {viewLabels[view]}
          </button>
        ))}
      </nav>

      <main>
        {activeView === 'dashboard' ? (
          <DashboardPage metrics={metrics} transactions={allTransactions} categories={categories} />
        ) : null}

        {activeView === 'budget' ? (
          <BudgetPage
            transactions={allTransactions}
            categories={categories}
            budgets={budgets}
            settings={settings}
            onSetBudget={(category, weeklyLimit) =>
              runAction(`Budget saved (${category})`, async () => {
                await window.budgetApi.setBudget(category, weeklyLimit);
              })
            }
            onUpdateSettings={(partial) =>
              runAction('Settings updated', async () => {
                await window.budgetApi.updateSettings(partial);
              })
            }
            onUpdateCategory={updateCategory}
            onExportDashboard={exportDashboard}
          />
        ) : null}

        {activeView === 'import' ? (
          <ImportClassifyPage
            transactions={allTransactions}
            categories={categories}
            busy={busy}
            onImportFiles={handleImportFiles}
            onUpdateCategory={updateCategory}
            onUpdateDescription={updateDescription}
            onSetExcluded={setExcluded}
            onSoftDelete={softDelete}
            onRunRules={runRules}
          />
        ) : null}

        {activeView === 'rules' ? (
          <RulesPage
            categories={categories}
            rules={rules}
            onCreateRule={(input) =>
              runAction('Rule created', async () => {
                await window.budgetApi.createRule(input);
              })
            }
            onUpdateRule={(rule) =>
              runAction('Rule updated', async () => {
                await window.budgetApi.updateRule(rule);
              })
            }
            onDeleteRule={(ruleId) =>
              runAction('Rule deleted', async () => {
                await window.budgetApi.deleteRule({ id: ruleId });
              })
            }
            onReorderRules={(orderedIds) =>
              runAction('Rule priority updated', async () => {
                await window.budgetApi.reorderRules({ orderedIds });
              })
            }
          />
        ) : null}

        {activeView === 'transactions' ? (
          <TransactionsPage
            transactions={historyTransactions}
            categories={categories}
            onLoad={loadHistory}
            onUpdateCategory={updateCategory}
            onUpdateDescription={updateDescription}
            onSetExcluded={setExcluded}
            onBulkSetExcluded={setExcludedBulk}
            onSoftDelete={softDelete}
            onBulkSoftDelete={softDeleteBulk}
            onUndoDelete={undoDelete}
            onBulkUndoDelete={undoDeleteBulk}
            onBulkUpdateCategory={updateCategoryBulk}
            onExportTransactions={exportTransactions}
          />
        ) : null}
      </main>

      <footer className="status-bar" role="status" aria-live="polite">
        <span>{statusText}</span>
        {message ? (
          <button className="status-dismiss" type="button" onClick={() => setMessage('')} aria-label="Dismiss status message">
            x
          </button>
        ) : null}
      </footer>
    </div>
  );
}
