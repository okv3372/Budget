import crypto from 'node:crypto';

export function nowIso(): string {
  return new Date().toISOString();
}

export function toBoolean(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = (value ?? '').toString().trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function toNumber(value: string | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = (value ?? '').toString().replace(/[$,]/g, '').trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseUsDate(dateString: string): Date {
  const trimmed = dateString.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00Z`);
  }

  const three = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (three) {
    const [, mm, dd, yy] = three;
    const year = Number.parseInt(yy, 10);
    const fullYear = year >= 70 ? 1900 + year : 2000 + year;
    return new Date(Date.UTC(fullYear, Number.parseInt(mm, 10) - 1, Number.parseInt(dd, 10)));
  }

  const four = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (four) {
    const [, mm, dd, yyyy] = four;
    return new Date(Date.UTC(Number.parseInt(yyyy, 10), Number.parseInt(mm, 10) - 1, Number.parseInt(dd, 10)));
  }

  return new Date('invalid');
}

export function parseDateToIso(dateString: string): string {
  const parsed = parseUsDate(dateString);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${dateString}`);
  }

  return parsed.toISOString().slice(0, 10);
}

export function hashString(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeDescription(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function normalizeMerchant(description: string): string {
  return description
    .toLowerCase()
    .replace(/[0-9]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(inc|llc|corp|co|store|market|ny|pa|ca|ma|fl|tx|wa|apple\s+pay|ending\s+in)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function startOfWeekMonday(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function endOfWeekMonday(dateIso: string): string {
  const start = new Date(`${startOfWeekMonday(dateIso)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 6);
  return start.toISOString().slice(0, 10);
}

export function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function compareIsoDates(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function withinRange(dateIso: string, from?: string, to?: string): boolean {
  if (from && dateIso < from) {
    return false;
  }
  if (to && dateIso > to) {
    return false;
  }
  return true;
}
