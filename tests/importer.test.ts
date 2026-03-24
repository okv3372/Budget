import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'budget-app-test-'));
  process.env.BUDGET_APP_ROOT = tempRoot;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.BUDGET_APP_ROOT;
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

describe('import pipeline', () => {
  it('dedupes by matching date and amount while still importing older unique rows', async () => {
    const { BudgetService } = await import('../src/main/service');
    const service = new BudgetService();

    const csvA = `"Transaction Type","Date","Account Type","Description","Amount","Reference No.","Credits","Debits"\nPOS DEBIT,3/24/26,Checking,"ALDI",-59.58,"",,$59.58\nDIRECT DEPOSIT,3/25/26,Checking,"PAYROLL",440.70,"",$440.70,\n`;

    const csvB = `"Transaction Type","Date","Account Type","Description","Amount","Reference No.","Credits","Debits"\nPOS DEBIT,3/24/26,Checking,"ALDI STORE",-59.58,"",,$59.58\nPOS DEBIT,3/20/26,Checking,"TOPS",-22.10,"",,$22.10\nPOS DEBIT,3/25/26,Checking,"WALMART",-12.00,"",,$12.00\n`;

    const first = await service.importCsvFiles([{ name: 'first.csv', content: csvA }]);
    expect(first.importedCount).toBe(2);

    const second = await service.importCsvFiles([{ name: 'second.csv', content: csvB }]);
    expect(second.importedCount).toBe(2);
    expect(second.skippedCount).toBe(1);

    const transactions = await service.getTransactions({ includeDeleted: true, includeExcluded: true });
    expect(transactions).toHaveLength(4);
    expect(transactions.some((tx) => tx.date === '2026-03-20' && tx.amount === -22.1)).toBe(true);
  });

  it('normalizes discover amounts to spending negative and payments positive', async () => {
    const { BudgetService } = await import('../src/main/service');
    const service = new BudgetService();

    const discoverCsv = `Trans. Date,Post Date,Description,Amount,Category\n03/06/2024,03/06/2024,"TARGET",48.11,"Supermarkets"\n03/12/2024,03/12/2024,"INTERNET PAYMENT - THANK YOU",-303.70,"Payments and Credits"\n`;

    const result = await service.importCsvFiles([{ name: 'discover.csv', content: discoverCsv }]);
    expect(result.importedCount).toBe(2);

    const txs = await service.getTransactions({ includeDeleted: true, includeExcluded: true });
    const target = txs.find((tx) => tx.description === 'TARGET');
    const payment = txs.find((tx) => tx.description.includes('INTERNET PAYMENT'));

    expect(target?.amount).toBeCloseTo(-48.11, 2);
    expect(payment?.amount).toBeCloseTo(303.7, 2);
  });
});
