import crypto from 'node:crypto';
import type { ImportCsvResult, ImportFileInput, Rule, SourceType, Transaction } from '../shared/types.js';
import { parseCsvObjects } from './csv.js';
import { BudgetStore } from './store.js';
import { applyRulesToTransaction } from './rules.js';
import { hashString, normalizeDescription, nowIso, parseDateToIso, toNumber } from './utils.js';

type DetectResult =
  | { source: 'citizens'; records: Array<Record<string, string>> }
  | { source: 'discover'; records: Array<Record<string, string>> };

function detectSource(content: string): DetectResult {
  const records = parseCsvObjects(content);
  const first = records[0] ?? {};
  const keys = Object.keys(first);

  const isCitizens =
    keys.includes('Transaction Type') &&
    keys.includes('Date') &&
    keys.includes('Description') &&
    keys.includes('Amount');

  const isDiscover =
    keys.includes('Trans. Date') && keys.includes('Description') && keys.includes('Amount') && keys.includes('Category');

  if (isCitizens) {
    return { source: 'citizens', records };
  }

  if (isDiscover) {
    return { source: 'discover', records };
  }

  throw new Error('Unsupported CSV format. Expected Citizens or Discover export headers.');
}

function normalizeCitizensRow(
  row: Record<string, string>,
  sourceFile: string,
  rowIndex: number,
  rules: Rule[]
): Transaction {
  const date = parseDateToIso(row.Date || '');
  const amount = toNumber(row.Amount || '0');
  const description = normalizeDescription(row.Description || '');
  const now = nowIso();

  const seed = `citizens|${date}|${description}|${amount.toFixed(2)}|${rowIndex}`;

  const transaction: Transaction = {
    id: crypto.randomUUID(),
    source: 'citizens',
    source_file: sourceFile,
    source_row_hash: hashString(seed),
    date,
    description,
    amount,
    category: 'Uncategorized',
    discover_original_category: '',
    excluded: false,
    deleted: false,
    delete_reason: '',
    notes: '',
    created_at: now,
    updated_at: now
  };

  return applyRulesToTransaction(transaction, rules);
}

function normalizeDiscoverRow(
  row: Record<string, string>,
  sourceFile: string,
  rowIndex: number,
  rules: Rule[]
): Transaction {
  const date = parseDateToIso(row['Trans. Date'] || '');
  const rawAmount = toNumber(row.Amount || '0');
  const amount = rawAmount * -1;
  const description = normalizeDescription(row.Description || '');
  const originalCategory = normalizeDescription(row.Category || '');
  const now = nowIso();

  const seed = `discover|${date}|${description}|${rawAmount.toFixed(2)}|${originalCategory}|${rowIndex}`;

  const transaction: Transaction = {
    id: crypto.randomUUID(),
    source: 'discover',
    source_file: sourceFile,
    source_row_hash: hashString(seed),
    date,
    description,
    amount,
    category: 'Uncategorized',
    discover_original_category: originalCategory,
    excluded: false,
    deleted: false,
    delete_reason: '',
    notes: '',
    created_at: now,
    updated_at: now
  };

  return applyRulesToTransaction(transaction, rules);
}

function transactionDateAmountKey(tx: Pick<Transaction, 'date' | 'amount'>): string {
  return `${tx.date}|${tx.amount.toFixed(2)}`;
}

function splitByDateAndAmount(
  incoming: Transaction[],
  existing: Transaction[]
): { toImport: Transaction[]; skippedCount: number } {
  const existingKeys = new Set(existing.map((tx) => transactionDateAmountKey(tx)));

  const toImport: Transaction[] = [];
  let skippedCount = 0;

  for (const tx of incoming) {
    const key = transactionDateAmountKey(tx);
    if (existingKeys.has(key)) {
      skippedCount += 1;
      continue;
    }

    toImport.push(tx);
    existingKeys.add(key);
  }

  return { toImport, skippedCount };
}

export async function importCsvFiles(
  store: BudgetStore,
  files: ImportFileInput[],
  rules: Rule[]
): Promise<ImportCsvResult> {
  const existing = await store.getTransactions();

  const warnings: string[] = [];
  const importedFiles: string[] = [];
  const sourceBreakdown: Record<SourceType, number> = { citizens: 0, discover: 0 };

  const parsedTransactions: Transaction[] = [];

  for (const file of files) {
    try {
      const detected = detectSource(file.content);
      const savedPath = await store.writeImportedRaw(detected.source, file.name, file.content);
      importedFiles.push(savedPath);

      detected.records.forEach((row, rowIndex) => {
        try {
          if (detected.source === 'citizens') {
            parsedTransactions.push(normalizeCitizensRow(row, file.name, rowIndex, rules));
            sourceBreakdown.citizens += 1;
          } else {
            parsedTransactions.push(normalizeDiscoverRow(row, file.name, rowIndex, rules));
            sourceBreakdown.discover += 1;
          }
        } catch (error) {
          warnings.push(`Skipped row ${rowIndex + 2} in ${file.name}: ${(error as Error).message}`);
        }
      });
    } catch (error) {
      warnings.push(`Skipped file ${file.name}: ${(error as Error).message}`);
    }
  }

  const { toImport, skippedCount } = splitByDateAndAmount(parsedTransactions, existing);
  await store.saveTransactions([...existing, ...toImport]);

  return {
    importedCount: toImport.length,
    skippedCount,
    importedFiles,
    sourceBreakdown,
    warnings
  };
}
