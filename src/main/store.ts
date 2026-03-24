import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ALL_CATEGORIES,
  DEFAULT_SETTINGS,
  type Category,
  type Rule,
  type Settings,
  type SourceType,
  type Transaction,
  type WeeklyBudgetTarget
} from '../shared/types.js';
import {
  BUDGETS_FILE,
  BUDGET_HEADERS,
  DATA_ROOT,
  DEFAULT_BUDGET_MAP,
  EXPORT_ROOT,
  IMPORT_ROOT,
  RULES_FILE,
  RULE_HEADERS,
  SETTINGS_FILE,
  SETTINGS_HEADERS,
  TRANSACTIONS_FILE,
  TRANSACTION_HEADERS
} from './constants.js';
import { readCsvFile, writeCsvFile } from './csv.js';
import { buildStarterRules } from './rules.js';
import { nowIso, toBoolean, toNumber } from './utils.js';

function asCategory(value: string): Category {
  if ((ALL_CATEGORIES as readonly string[]).includes(value)) {
    return value as Category;
  }
  return 'Uncategorized';
}

function serializeTransaction(tx: Transaction): Record<string, string> {
  return {
    id: tx.id,
    source: tx.source,
    source_file: tx.source_file,
    source_row_hash: tx.source_row_hash,
    date: tx.date,
    description: tx.description,
    amount: tx.amount.toFixed(2),
    category: tx.category,
    discover_original_category: tx.discover_original_category,
    excluded: String(tx.excluded),
    deleted: String(tx.deleted),
    delete_reason: tx.delete_reason,
    notes: tx.notes,
    created_at: tx.created_at,
    updated_at: tx.updated_at
  };
}

function deserializeTransaction(row: Record<string, string>): Transaction {
  return {
    id: row.id,
    source: (row.source || 'citizens') as SourceType,
    source_file: row.source_file || '',
    source_row_hash: row.source_row_hash || '',
    date: row.date || '',
    description: row.description || '',
    amount: toNumber(row.amount),
    category: asCategory(row.category),
    discover_original_category: row.discover_original_category || '',
    excluded: toBoolean(row.excluded),
    deleted: toBoolean(row.deleted),
    delete_reason: row.delete_reason || '',
    notes: row.notes || '',
    created_at: row.created_at || nowIso(),
    updated_at: row.updated_at || nowIso()
  };
}

function serializeRule(rule: Rule): Record<string, string> {
  return {
    id: rule.id,
    priority: String(rule.priority),
    enabled: String(rule.enabled),
    condition_type: rule.condition_type,
    condition_value: rule.condition_value,
    target_category: rule.target_category,
    set_excluded: String(rule.set_excluded)
  };
}

function deserializeRule(row: Record<string, string>): Rule {
  return {
    id: row.id,
    priority: Math.max(0, Number.parseInt(row.priority || '0', 10) || 0),
    enabled: toBoolean(row.enabled),
    condition_type: (row.condition_type || 'description_contains') as Rule['condition_type'],
    condition_value: row.condition_value || '',
    target_category: asCategory(row.target_category),
    set_excluded: toBoolean(row.set_excluded)
  };
}

function serializeBudget(target: WeeklyBudgetTarget): Record<string, string> {
  return {
    category: target.category,
    weekly_limit: target.weekly_limit.toFixed(2)
  };
}

function deserializeBudget(row: Record<string, string>): WeeklyBudgetTarget {
  return {
    category: asCategory(row.category),
    weekly_limit: toNumber(row.weekly_limit)
  };
}

function serializeSettings(settings: Settings): Array<Record<string, string>> {
  return [
    {
      week_start_day: settings.week_start_day,
      weekly_net_savings_target: settings.weekly_net_savings_target.toFixed(2)
    }
  ];
}

function deserializeSettings(rows: Array<Record<string, string>>): Settings {
  const row = rows[0] ?? {};
  return {
    week_start_day: 'monday',
    weekly_net_savings_target: toNumber(row.weekly_net_savings_target)
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class BudgetStore {
  async ensureInitialized(): Promise<void> {
    await fs.mkdir(DATA_ROOT, { recursive: true });
    await fs.mkdir(path.join(IMPORT_ROOT, 'citizens'), { recursive: true });
    await fs.mkdir(path.join(IMPORT_ROOT, 'discover'), { recursive: true });
    await fs.mkdir(EXPORT_ROOT, { recursive: true });

    if (!(await fileExists(TRANSACTIONS_FILE))) {
      await writeCsvFile(TRANSACTIONS_FILE, TRANSACTION_HEADERS, []);
    }

    if (!(await fileExists(RULES_FILE))) {
      const starter = buildStarterRules();
      await writeCsvFile(RULES_FILE, RULE_HEADERS, starter.map(serializeRule));
    }

    if (!(await fileExists(BUDGETS_FILE))) {
      const defaults: WeeklyBudgetTarget[] = ALL_CATEGORIES.map((category) => ({
        category,
        weekly_limit: DEFAULT_BUDGET_MAP[category]
      }));
      await writeCsvFile(BUDGETS_FILE, BUDGET_HEADERS, defaults.map(serializeBudget));
    }

    if (!(await fileExists(SETTINGS_FILE))) {
      await writeCsvFile(SETTINGS_FILE, SETTINGS_HEADERS, serializeSettings(DEFAULT_SETTINGS));
    }
  }

  async getTransactions(): Promise<Transaction[]> {
    await this.ensureInitialized();
    const rows = await readCsvFile(TRANSACTIONS_FILE);
    return rows.map(deserializeTransaction);
  }

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    await this.ensureInitialized();
    const sorted = [...transactions].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
    await writeCsvFile(TRANSACTIONS_FILE, TRANSACTION_HEADERS, sorted.map(serializeTransaction));
  }

  async getRules(): Promise<Rule[]> {
    await this.ensureInitialized();
    const rows = await readCsvFile(RULES_FILE);
    if (rows.length === 0) {
      const starter = buildStarterRules();
      await this.saveRules(starter);
      return starter;
    }
    return rows.map(deserializeRule).sort((a, b) => a.priority - b.priority);
  }

  async saveRules(rules: Rule[]): Promise<void> {
    await this.ensureInitialized();
    const normalized = [...rules]
      .sort((a, b) => a.priority - b.priority)
      .map((rule, index) => ({
        ...rule,
        priority: index + 1
      }));

    await writeCsvFile(RULES_FILE, RULE_HEADERS, normalized.map(serializeRule));
  }

  async getBudgets(): Promise<WeeklyBudgetTarget[]> {
    await this.ensureInitialized();
    const rows = await readCsvFile(BUDGETS_FILE);
    const unique = new Map<Category, WeeklyBudgetTarget>();

    rows.map(deserializeBudget).forEach((budget) => {
      unique.set(budget.category, budget);
    });

    return ALL_CATEGORIES.map((category) => unique.get(category) ?? { category, weekly_limit: DEFAULT_BUDGET_MAP[category] }).sort(
      (a, b) => a.category.localeCompare(b.category)
    );
  }

  async saveBudgets(budgets: WeeklyBudgetTarget[]): Promise<void> {
    await this.ensureInitialized();
    const unique = new Map<Category, WeeklyBudgetTarget>();
    budgets.forEach((budget) => {
      unique.set(budget.category, {
        category: budget.category,
        weekly_limit: Number.isFinite(budget.weekly_limit) ? budget.weekly_limit : 0
      });
    });

    const merged = ALL_CATEGORIES.map((category) => unique.get(category) ?? { category, weekly_limit: 0 });
    await writeCsvFile(BUDGETS_FILE, BUDGET_HEADERS, merged.map(serializeBudget));
  }

  async getSettings(): Promise<Settings> {
    await this.ensureInitialized();
    const rows = await readCsvFile(SETTINGS_FILE);
    if (rows.length === 0) {
      await this.saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }

    return deserializeSettings(rows);
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.ensureInitialized();
    await writeCsvFile(SETTINGS_FILE, SETTINGS_HEADERS, serializeSettings(settings));
  }

  async writeImportedRaw(source: SourceType, fileName: string, content: string): Promise<string> {
    await this.ensureInitialized();

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(IMPORT_ROOT, source, `${stamp}_${safeFileName}`);

    await fs.writeFile(outputFile, content, 'utf-8');
    return outputFile;
  }

  async writeExportFile(baseName: string, content: string): Promise<string> {
    await this.ensureInitialized();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(EXPORT_ROOT, `${baseName}_${stamp}.csv`);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }
}
