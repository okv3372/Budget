import { describe, expect, it } from 'vitest';
import { parseCsvObjects, stringifyCsv } from '../src/main/csv';

describe('csv helpers', () => {
  it('parses quoted fields and commas', () => {
    const csv = 'Name,Description\n1,"ALDI, STORE"\n2,"Line ""two"""\n';
    const rows = parseCsvObjects(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.Description).toBe('ALDI, STORE');
    expect(rows[1]?.Description).toBe('Line "two"');
  });

  it('stringifies data safely', () => {
    const output = stringifyCsv(
      ['name', 'description'],
      [
        { name: 'A', description: 'Hello, world' },
        { name: 'B', description: 'Quote "inside"' }
      ]
    );

    expect(output).toContain('"Hello, world"');
    expect(output).toContain('"Quote ""inside"""');
  });
});
