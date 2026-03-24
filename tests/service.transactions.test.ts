import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'budget-service-transactions-test-'));
  process.env.BUDGET_APP_ROOT = tempRoot;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.BUDGET_APP_ROOT;
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

describe('manual transactions', () => {
  it('creates and persists a manual expense as a negative amount', async () => {
    const { BudgetService } = await import('../src/main/service');
    const service = new BudgetService();

    const created = await service.createManualTransaction({
      date: '2026-03-24',
      source: 'citizens',
      description: '  Farmers Market  ',
      amount: -42.75,
      direction: 'expense',
      category: 'Groceries',
      notes: '  weekend run  '
    });

    expect(created.source_file).toBe('manual-entry');
    expect(created.description).toBe('Farmers Market');
    expect(created.notes).toBe('weekend run');
    expect(created.amount).toBeCloseTo(-42.75, 2);
    expect(created.deleted).toBe(false);
    expect(created.excluded).toBe(false);

    const transactions = await service.getTransactions({ includeDeleted: true, includeExcluded: true });
    const saved = transactions.find((tx) => tx.id === created.id);

    expect(saved).toBeDefined();
    expect(saved?.amount).toBeCloseTo(-42.75, 2);
    expect(saved?.category).toBe('Groceries');
  });

  it('creates a manual discover income as a positive amount', async () => {
    const { BudgetService } = await import('../src/main/service');
    const service = new BudgetService();

    const created = await service.createManualTransaction({
      date: '2026-03-25',
      source: 'discover',
      description: 'Cashback credit',
      amount: -75,
      direction: 'income',
      category: 'Income'
    });

    expect(created.amount).toBe(75);
    expect(created.discover_original_category).toBe('Manual Entry');
  });

  it('rejects invalid manual amounts', async () => {
    const { BudgetService } = await import('../src/main/service');
    const service = new BudgetService();

    await expect(
      service.createManualTransaction({
        date: '2026-03-24',
        source: 'citizens',
        description: 'Invalid amount',
        amount: 0,
        direction: 'expense',
        category: 'Other'
      })
    ).rejects.toThrow('Amount must be greater than 0');
  });
});
