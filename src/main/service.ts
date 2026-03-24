import crypto from 'node:crypto';
import {
  type CreateManualTransactionInput,
  type BulkSoftDeleteTransactionsInput,
  type BulkUndoDeleteTransactionsInput,
  type BulkUpdateTransactionsInput,
  DEFAULT_SETTINGS,
  type Category,
  type DashboardRange,
  type ImportCsvResult,
  type ImportFileInput,
  type ReorderRulesInput,
  type Rule,
  type Settings,
  type Transaction,
  type TransactionFilters,
  type UpdateTransactionInput,
  type WeeklyBudgetTarget
} from '../shared/types.js';
import { stringifyCsv } from './csv.js';
import { importCsvFiles } from './importer.js';
import { getDashboardMetrics } from './metrics.js';
import { applyRulesToTransaction } from './rules.js';
import { BudgetStore } from './store.js';
import { hashString, normalizeMerchant, nowIso, parseDateToIso } from './utils.js';

function normalizeIds(ids: string[]): Set<string> {
  return new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0));
}

function applyTransactionFilters(transactions: Transaction[], filters?: TransactionFilters): Transaction[] {
  if (!filters) {
    return transactions.filter((tx) => !tx.deleted);
  }

  return transactions.filter((tx) => {
    if (!filters.includeDeleted && tx.deleted) {
      return false;
    }

    if (!filters.includeExcluded && tx.excluded) {
      return false;
    }

    if (filters.source && filters.source !== 'all' && tx.source !== filters.source) {
      return false;
    }

    if (filters.category && filters.category !== 'all' && tx.category !== filters.category) {
      return false;
    }

    if (filters.text) {
      const text = filters.text.toLowerCase();
      if (!tx.description.toLowerCase().includes(text) && !tx.notes.toLowerCase().includes(text)) {
        return false;
      }
    }

    if (typeof filters.minAmount === 'number' && tx.amount < filters.minAmount) {
      return false;
    }

    if (typeof filters.maxAmount === 'number' && tx.amount > filters.maxAmount) {
      return false;
    }

    if (filters.dateFrom && tx.date < filters.dateFrom) {
      return false;
    }

    if (filters.dateTo && tx.date > filters.dateTo) {
      return false;
    }

    return true;
  });
}

function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date === b.date) {
      return b.updated_at.localeCompare(a.updated_at);
    }
    return b.date.localeCompare(a.date);
  });
}

export class BudgetService {
  constructor(private readonly store = new BudgetStore()) {}

  async importCsvFiles(files: ImportFileInput[]): Promise<ImportCsvResult> {
    const rules = await this.store.getRules();
    return importCsvFiles(this.store, files, rules);
  }

  async getTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
    const transactions = await this.store.getTransactions();
    const filtered = applyTransactionFilters(transactions, filters);
    return sortTransactions(filtered);
  }

  async createManualTransaction(input: CreateManualTransactionInput): Promise<Transaction> {
    const description = input.description.trim();
    if (!description) {
      throw new Error('Description is required');
    }

    const date = parseDateToIso(input.date);
    const absoluteAmount = Math.abs(input.amount);
    if (!Number.isFinite(absoluteAmount) || absoluteAmount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    const normalizedAmount = input.direction === 'expense' ? -absoluteAmount : absoluteAmount;
    const id = crypto.randomUUID();
    const now = nowIso();

    const manualTransaction: Transaction = {
      id,
      source: input.source,
      source_file: 'manual-entry',
      source_row_hash: hashString(`manual-entry|${id}|${date}|${description}|${normalizedAmount.toFixed(2)}`),
      date,
      description,
      amount: normalizedAmount,
      category: input.category,
      discover_original_category: input.source === 'discover' ? 'Manual Entry' : '',
      excluded: false,
      deleted: false,
      delete_reason: '',
      notes: (input.notes ?? '').trim(),
      created_at: now,
      updated_at: now
    };

    const transactions = await this.store.getTransactions();
    await this.store.saveTransactions([...transactions, manualTransaction]);

    return manualTransaction;
  }

  async updateTransaction(input: UpdateTransactionInput): Promise<Transaction | null> {
    const transactions = await this.store.getTransactions();
    const index = transactions.findIndex((tx) => tx.id === input.id);

    if (index === -1) {
      return null;
    }

    const current = transactions[index];
    const updated: Transaction = {
      ...current,
      category: input.category ?? current.category,
      description: input.description ?? current.description,
      excluded: typeof input.excluded === 'boolean' ? input.excluded : current.excluded,
      notes: input.notes ?? current.notes,
      updated_at: nowIso()
    };

    transactions[index] = updated;
    await this.store.saveTransactions(transactions);

    return updated;
  }

  async updateTransactions(input: BulkUpdateTransactionsInput): Promise<{ updatedCount: number }> {
    const idSet = normalizeIds(input.ids);

    if (idSet.size === 0) {
      return { updatedCount: 0 };
    }

    const transactions = await this.store.getTransactions();
    const timestamp = nowIso();
    let updatedCount = 0;

    const next = transactions.map((tx) => {
      if (!idSet.has(tx.id)) {
        return tx;
      }

      const nextCategory = input.category ?? tx.category;
      const nextExcluded = typeof input.excluded === 'boolean' ? input.excluded : tx.excluded;

      if (nextCategory === tx.category && nextExcluded === tx.excluded) {
        return tx;
      }

      updatedCount += 1;
      return {
        ...tx,
        category: nextCategory,
        excluded: nextExcluded,
        updated_at: timestamp
      };
    });

    if (updatedCount > 0) {
      await this.store.saveTransactions(next);
    }

    return { updatedCount };
  }

  async softDeleteTransaction(input: { id: string; reason?: string }): Promise<void> {
    const transactions = await this.store.getTransactions();
    const index = transactions.findIndex((tx) => tx.id === input.id);

    if (index === -1) {
      return;
    }

    transactions[index] = {
      ...transactions[index],
      deleted: true,
      delete_reason: input.reason ?? 'User removed transaction',
      updated_at: nowIso()
    };

    await this.store.saveTransactions(transactions);
  }

  async softDeleteTransactions(input: BulkSoftDeleteTransactionsInput): Promise<{ updatedCount: number }> {
    const idSet = normalizeIds(input.ids);

    if (idSet.size === 0) {
      return { updatedCount: 0 };
    }

    const transactions = await this.store.getTransactions();
    const timestamp = nowIso();
    let updatedCount = 0;

    const next = transactions.map((tx) => {
      if (!idSet.has(tx.id) || tx.deleted) {
        return tx;
      }

      updatedCount += 1;
      return {
        ...tx,
        deleted: true,
        delete_reason: input.reason ?? 'User removed transaction',
        updated_at: timestamp
      };
    });

    if (updatedCount > 0) {
      await this.store.saveTransactions(next);
    }

    return { updatedCount };
  }

  async undoDeleteTransaction(input: { id: string }): Promise<void> {
    const transactions = await this.store.getTransactions();
    const index = transactions.findIndex((tx) => tx.id === input.id);

    if (index === -1) {
      return;
    }

    transactions[index] = {
      ...transactions[index],
      deleted: false,
      delete_reason: '',
      updated_at: nowIso()
    };

    await this.store.saveTransactions(transactions);
  }

  async undoDeleteTransactions(input: BulkUndoDeleteTransactionsInput): Promise<{ updatedCount: number }> {
    const idSet = normalizeIds(input.ids);

    if (idSet.size === 0) {
      return { updatedCount: 0 };
    }

    const transactions = await this.store.getTransactions();
    const timestamp = nowIso();
    let updatedCount = 0;

    const next = transactions.map((tx) => {
      if (!idSet.has(tx.id) || !tx.deleted) {
        return tx;
      }

      updatedCount += 1;
      return {
        ...tx,
        deleted: false,
        delete_reason: '',
        updated_at: timestamp
      };
    });

    if (updatedCount > 0) {
      await this.store.saveTransactions(next);
    }

    return { updatedCount };
  }

  async getRules(): Promise<Rule[]> {
    return this.store.getRules();
  }

  async createRule(input: Omit<Rule, 'id' | 'priority'>): Promise<Rule> {
    const rules = await this.store.getRules();
    const newRule: Rule = {
      ...input,
      id: crypto.randomUUID(),
      priority: rules.length + 1
    };

    const next = [...rules, newRule].sort((a, b) => a.priority - b.priority);
    await this.store.saveRules(next);

    return newRule;
  }

  async updateRule(rule: Rule): Promise<Rule | null> {
    const rules = await this.store.getRules();
    const index = rules.findIndex((existing) => existing.id === rule.id);

    if (index === -1) {
      return null;
    }

    rules[index] = rule;
    await this.store.saveRules(rules);

    return rule;
  }

  async deleteRule(input: { id: string }): Promise<{ deleted: boolean }> {
    const rules = await this.store.getRules();
    const next = rules.filter((rule) => rule.id !== input.id);

    if (next.length === rules.length) {
      return { deleted: false };
    }

    await this.store.saveRules(next);
    return { deleted: true };
  }

  async reorderRules(input: ReorderRulesInput): Promise<Rule[]> {
    const rules = await this.store.getRules();
    const byId = new Map(rules.map((rule) => [rule.id, rule]));

    const reordered: Rule[] = [];
    input.orderedIds.forEach((id) => {
      const rule = byId.get(id);
      if (rule) {
        reordered.push(rule);
        byId.delete(id);
      }
    });

    byId.forEach((rule) => reordered.push(rule));

    const normalized = reordered.map((rule, index) => ({ ...rule, priority: index + 1 }));
    await this.store.saveRules(normalized);

    return normalized;
  }

  async runRules(scope: 'uncategorized' | 'all'): Promise<{ updatedCount: number }> {
    const [rules, transactions] = await Promise.all([this.store.getRules(), this.store.getTransactions()]);

    let updatedCount = 0;

    const next = transactions.map((tx) => {
      if (tx.deleted) {
        return tx;
      }

      if (scope === 'uncategorized' && tx.category !== 'Uncategorized') {
        return tx;
      }

      const updated = applyRulesToTransaction(
        {
          ...tx,
          category: scope === 'all' ? 'Uncategorized' : tx.category
        },
        rules
      );

      if (updated.category !== tx.category || updated.excluded !== tx.excluded) {
        updatedCount += 1;
        return {
          ...updated,
          updated_at: nowIso()
        };
      }

      return tx;
    });

    await this.store.saveTransactions(next);

    return { updatedCount };
  }

  async getBudgets(): Promise<WeeklyBudgetTarget[]> {
    return this.store.getBudgets();
  }

  async setBudget(category: Category, weeklyLimit: number): Promise<WeeklyBudgetTarget[]> {
    const budgets = await this.store.getBudgets();
    const index = budgets.findIndex((budget) => budget.category === category);

    if (index === -1) {
      budgets.push({ category, weekly_limit: weeklyLimit });
    } else {
      budgets[index] = { ...budgets[index], weekly_limit: weeklyLimit };
    }

    await this.store.saveBudgets(budgets);

    return this.store.getBudgets();
  }

  async getSettings(): Promise<Settings> {
    const settings = await this.store.getSettings();
    return {
      ...DEFAULT_SETTINGS,
      ...settings
    };
  }

  async updateSettings(partial: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();
    const next: Settings = {
      ...current,
      ...partial,
      week_start_day: 'monday'
    };

    await this.store.saveSettings(next);
    return next;
  }

  async getDashboardMetrics(range?: DashboardRange) {
    const [transactions, budgets, settings] = await Promise.all([
      this.store.getTransactions(),
      this.store.getBudgets(),
      this.getSettings()
    ]);

    return getDashboardMetrics(transactions, budgets, settings.weekly_net_savings_target, range);
  }

  async exportTransactionsCsv(filters?: TransactionFilters): Promise<string> {
    const transactions = await this.getTransactions({ ...filters, includeDeleted: true, includeExcluded: true });

    const rows = transactions.map((tx) => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount.toFixed(2),
      category: tx.category,
      source: tx.source,
      discover_original_category: tx.discover_original_category,
      excluded: String(tx.excluded),
      deleted: String(tx.deleted),
      delete_reason: tx.delete_reason,
      notes: tx.notes,
      updated_at: tx.updated_at
    }));

    const headers = [
      'id',
      'date',
      'description',
      'amount',
      'category',
      'source',
      'discover_original_category',
      'excluded',
      'deleted',
      'delete_reason',
      'notes',
      'updated_at'
    ];

    const csv = stringifyCsv(headers, rows);
    return this.store.writeExportFile('transactions_export', csv);
  }

  async exportDashboardSummaryCsv(range?: DashboardRange): Promise<string> {
    const metrics = await this.getDashboardMetrics(range);

    const rows: Array<Record<string, string>> = [];

    rows.push({ section: 'weekly', key: 'week_start', value: metrics.weekStart });
    rows.push({ section: 'weekly', key: 'week_end', value: metrics.weekEnd });
    rows.push({ section: 'weekly', key: 'income', value: metrics.weeklyIncome.toFixed(2) });
    rows.push({ section: 'weekly', key: 'expenses', value: metrics.weeklyExpenses.toFixed(2) });
    rows.push({ section: 'weekly', key: 'net', value: metrics.weeklyNet.toFixed(2) });
    rows.push({ section: 'weekly', key: 'savings_target', value: metrics.weeklySavingsTarget.toFixed(2) });

    metrics.categoryRows.forEach((row) => {
      rows.push({ section: 'category_weekly', key: row.category, value: row.spent.toFixed(2) });
    });

    metrics.monthlyTrend.forEach((point) => {
      rows.push({ section: 'monthly_net', key: point.month, value: point.net.toFixed(2) });
    });

    const headers = ['section', 'key', 'value'];
    const csv = stringifyCsv(headers, rows);

    return this.store.writeExportFile('dashboard_summary', csv);
  }

  async applySubscriptionSuggestion(merchantKey: string): Promise<{ updatedCount: number }> {
    const transactions = await this.store.getTransactions();
    let updatedCount = 0;

    const next: Transaction[] = transactions.map((tx): Transaction => {
      if (tx.deleted || tx.excluded || tx.amount >= 0) {
        return tx;
      }

      if (normalizeMerchant(tx.description) !== merchantKey) {
        return tx;
      }

      updatedCount += 1;
      return {
        ...tx,
        category: 'Subscriptions',
        updated_at: nowIso()
      };
    });

    await this.store.saveTransactions(next);

    return { updatedCount };
  }
}
