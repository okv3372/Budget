import { describe, expect, it } from 'vitest';
import { applyRulesToTransaction } from '../src/main/rules';
import type { Rule, Transaction } from '../src/shared/types';

const baseTx: Transaction = {
  id: '1',
  source: 'discover',
  source_file: 'a.csv',
  source_row_hash: 'x',
  date: '2026-03-20',
  description: 'ALDI 1234',
  amount: -25,
  category: 'Uncategorized',
  discover_original_category: 'Gasoline',
  excluded: false,
  deleted: false,
  delete_reason: '',
  notes: '',
  created_at: '2026-03-20T00:00:00.000Z',
  updated_at: '2026-03-20T00:00:00.000Z'
};

describe('rule engine', () => {
  it('applies higher priority rule first', () => {
    const rules: Rule[] = [
      {
        id: '2',
        priority: 2,
        enabled: true,
        condition_type: 'description_contains',
        condition_value: 'ALDI',
        target_category: 'Groceries',
        set_excluded: false
      },
      {
        id: '1',
        priority: 1,
        enabled: true,
        condition_type: 'discover_category_equals',
        condition_value: 'Gasoline',
        target_category: 'Gas',
        set_excluded: false
      }
    ];

    const next = applyRulesToTransaction(baseTx, rules);
    expect(next.category).toBe('Gas');
  });

  it('matches description case-insensitively', () => {
    const rules: Rule[] = [
      {
        id: '1',
        priority: 1,
        enabled: true,
        condition_type: 'description_contains',
        condition_value: 'aldi',
        target_category: 'Groceries',
        set_excluded: false
      }
    ];

    const next = applyRulesToTransaction(baseTx, rules);
    expect(next.category).toBe('Groceries');
  });
});
