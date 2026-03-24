import fs from 'node:fs/promises';

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function parseCsvRows(content: string): string[][] {
  const text = normalizeLineEndings(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      field = '';

      const hasData = row.some((cell) => cell.trim().length > 0);
      if (hasData) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  const trailingHasData = row.some((cell) => cell.trim().length > 0);
  if (trailingHasData) {
    rows.push(row);
  }

  return rows;
}

export function parseCsvObjects(content: string): Array<Record<string, string>> {
  const rows = parseCsvRows(content);
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());

  return rows.slice(1).map((cells) => {
    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header] = cells[index] ?? '';
    });
    return entry;
  });
}

function escapeCsvCell(value: string): string {
  const needsQuoting = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

export function stringifyCsv(headers: readonly string[], rows: Array<Record<string, string>>): string {
  const headerLine = headers.map((header) => escapeCsvCell(header)).join(',');
  const lines = rows.map((row) => headers.map((header) => escapeCsvCell(row[header] ?? '')).join(','));
  return `${headerLine}\n${lines.join('\n')}`;
}

export async function readCsvFile(filePath: string): Promise<Array<Record<string, string>>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseCsvObjects(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function writeCsvFile(
  filePath: string,
  headers: readonly string[],
  rows: Array<Record<string, string>>
): Promise<void> {
  const output = stringifyCsv(headers, rows);
  await fs.writeFile(filePath, output, 'utf-8');
}
