import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'budget-service-rules-test-'));
  process.env.BUDGET_APP_ROOT = tempRoot;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.BUDGET_APP_ROOT;
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

describe('rule management', () => {
  it('deletes a rule and re-normalizes priorities', async () => {
    const { BudgetService } = await import('../src/main/service');
    const service = new BudgetService();

    const existing = await service.getRules();
    expect(existing.length).toBeGreaterThan(0);

    const deleteId = existing[Math.floor(existing.length / 2)].id;
    const result = await service.deleteRule({ id: deleteId });

    expect(result.deleted).toBe(true);

    const next = await service.getRules();
    expect(next).toHaveLength(existing.length - 1);
    expect(next.some((rule) => rule.id === deleteId)).toBe(false);
    next.forEach((rule, index) => {
      expect(rule.priority).toBe(index + 1);
    });
  });

  it('returns deleted=false when the rule does not exist', async () => {
    const { BudgetService } = await import('../src/main/service');
    const service = new BudgetService();

    const existing = await service.getRules();
    const result = await service.deleteRule({ id: 'missing-rule-id' });
    const next = await service.getRules();

    expect(result.deleted).toBe(false);
    expect(next).toHaveLength(existing.length);
  });
});
