export const USER_CATEGORIES = [
  'Groceries',
  'Restaurants',
  'Gas',
  'Rent',
  'Utilities',
  'Subscriptions',
  'Income',
  'Entertainment',
  'Other'
] as const;

export const SYSTEM_CATEGORIES = ['Uncategorized', 'Transfer'] as const;

export const ALL_CATEGORIES = [...USER_CATEGORIES, ...SYSTEM_CATEGORIES] as const;

export type Category = (typeof ALL_CATEGORIES)[number];

export type SourceType = 'citizens' | 'discover';

export type RuleConditionType = 'description_contains' | 'discover_category_equals';

export interface Transaction {
  id: string;
  source: SourceType;
  source_file: string;
  source_row_hash: string;
  date: string;
  description: string;
  amount: number;
  category: Category;
  discover_original_category: string;
  excluded: boolean;
  deleted: boolean;
  delete_reason: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Rule {
  id: string;
  priority: number;
  enabled: boolean;
  condition_type: RuleConditionType;
  condition_value: string;
  target_category: Category;
  set_excluded: boolean;
}

export interface WeeklyBudgetTarget {
  category: Category;
  weekly_limit: number;
}

export interface Settings {
  week_start_day: 'monday';
  weekly_net_savings_target: number;
}

export interface ImportFileInput {
  name: string;
  content: string;
}

export interface ImportCsvResult {
  importedCount: number;
  skippedCount: number;
  importedFiles: string[];
  sourceBreakdown: Record<SourceType, number>;
  warnings: string[];
}

export interface TransactionFilters {
  source?: SourceType | 'all';
  category?: Category | 'all';
  text?: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
  includeExcluded?: boolean;
  includeDeleted?: boolean;
}

export interface UpdateTransactionInput {
  id: string;
  category?: Category;
  description?: string;
  excluded?: boolean;
  notes?: string;
}

export interface BulkUpdateTransactionsInput {
  ids: string[];
  category?: Category;
  excluded?: boolean;
}

export interface BulkSoftDeleteTransactionsInput {
  ids: string[];
  reason?: string;
}

export interface BulkUndoDeleteTransactionsInput {
  ids: string[];
}

export type ManualTransactionDirection = 'expense' | 'income';

export interface CreateManualTransactionInput {
  date: string;
  source: SourceType;
  description: string;
  amount: number;
  direction: ManualTransactionDirection;
  category: Category;
  notes?: string;
}

export interface ReorderRulesInput {
  orderedIds: string[];
}

export interface DashboardRange {
  from?: string;
  to?: string;
}

export interface DashboardCategoryRow {
  category: Category;
  limit: number;
  spent: number;
  remaining: number;
  overBudget: boolean;
}

export interface WeeklyTrendPoint {
  weekStart: string;
  income: number;
  expenses: number;
  net: number;
}

export interface MonthlyTrendPoint {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export interface CategoryDistributionPoint {
  category: Category;
  spent: number;
}

export interface SubscriptionSuggestion {
  merchantKey: string;
  exampleDescription: string;
  occurrences: number;
  averageAmount: number;
  lastDate: string;
  averageIntervalDays: number;
}

export interface DashboardMetrics {
  weekStart: string;
  weekEnd: string;
  weeklyIncome: number;
  weeklyExpenses: number;
  weeklyNet: number;
  weeklySavingsTarget: number;
  weeklySavingsDelta: number;
  weeklyTransactions: Transaction[];
  categoryRows: DashboardCategoryRow[];
  weeklyTrend: WeeklyTrendPoint[];
  monthlyTrend: MonthlyTrendPoint[];
  categoryDistribution: CategoryDistributionPoint[];
  subscriptionSuggestions: SubscriptionSuggestion[];
}

export interface AppApi {
  importCsvFiles: (files: ImportFileInput[]) => Promise<ImportCsvResult>;
  getTransactions: (filters?: TransactionFilters) => Promise<Transaction[]>;
  createManualTransaction: (input: CreateManualTransactionInput) => Promise<Transaction>;
  updateTransaction: (input: UpdateTransactionInput) => Promise<Transaction | null>;
  updateTransactions: (input: BulkUpdateTransactionsInput) => Promise<{ updatedCount: number }>;
  softDeleteTransaction: (input: { id: string; reason?: string }) => Promise<void>;
  softDeleteTransactions: (input: BulkSoftDeleteTransactionsInput) => Promise<{ updatedCount: number }>;
  undoDeleteTransaction: (input: { id: string }) => Promise<void>;
  undoDeleteTransactions: (input: BulkUndoDeleteTransactionsInput) => Promise<{ updatedCount: number }>;
  getRules: () => Promise<Rule[]>;
  createRule: (rule: Omit<Rule, 'id' | 'priority'>) => Promise<Rule>;
  updateRule: (rule: Rule) => Promise<Rule | null>;
  deleteRule: (input: { id: string }) => Promise<{ deleted: boolean }>;
  reorderRules: (input: ReorderRulesInput) => Promise<Rule[]>;
  runRules: (scope: 'uncategorized' | 'all') => Promise<{ updatedCount: number }>;
  getBudgets: () => Promise<WeeklyBudgetTarget[]>;
  setBudget: (category: Category, weeklyLimit: number) => Promise<WeeklyBudgetTarget[]>;
  getSettings: () => Promise<Settings>;
  updateSettings: (settings: Partial<Settings>) => Promise<Settings>;
  getDashboardMetrics: (range?: DashboardRange) => Promise<DashboardMetrics>;
  exportTransactionsCsv: (filters?: TransactionFilters) => Promise<string>;
  exportDashboardSummaryCsv: (range?: DashboardRange) => Promise<string>;
  applySubscriptionSuggestion: (merchantKey: string) => Promise<{ updatedCount: number }>;
}

export const DEFAULT_SETTINGS: Settings = {
  week_start_day: 'monday',
  weekly_net_savings_target: 0
};
