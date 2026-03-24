import os from 'node:os';
import path from 'node:path';
import { ALL_CATEGORIES } from '../shared/types.js';

export const APP_ROOT = path.join(os.homedir(), 'Documents', 'BudgetApp');
export const RESOLVED_APP_ROOT = process.env.BUDGET_APP_ROOT || APP_ROOT;
export const DATA_ROOT = path.join(RESOLVED_APP_ROOT, 'data');
export const IMPORT_ROOT = path.join(RESOLVED_APP_ROOT, 'imports');
export const EXPORT_ROOT = path.join(RESOLVED_APP_ROOT, 'exports');

export const TRANSACTIONS_FILE = path.join(DATA_ROOT, 'transactions_master.csv');
export const RULES_FILE = path.join(DATA_ROOT, 'rules.csv');
export const BUDGETS_FILE = path.join(DATA_ROOT, 'category_budgets_weekly.csv');
export const SETTINGS_FILE = path.join(DATA_ROOT, 'settings.csv');

export const TRANSACTION_HEADERS = [
  'id',
  'source',
  'source_file',
  'source_row_hash',
  'date',
  'description',
  'amount',
  'category',
  'discover_original_category',
  'excluded',
  'deleted',
  'delete_reason',
  'notes',
  'created_at',
  'updated_at'
] as const;

export const RULE_HEADERS = [
  'id',
  'priority',
  'enabled',
  'condition_type',
  'condition_value',
  'target_category',
  'set_excluded'
] as const;

export const BUDGET_HEADERS = ['category', 'weekly_limit'] as const;

export const SETTINGS_HEADERS = ['week_start_day', 'weekly_net_savings_target'] as const;

export const TRANSACTION_SOURCES = {
  citizens: 'citizens',
  discover: 'discover'
} as const;

export const DEFAULT_BUDGET_MAP = ALL_CATEGORIES.reduce<Record<string, number>>((acc, category) => {
  acc[category] = 0;
  return acc;
}, {});
