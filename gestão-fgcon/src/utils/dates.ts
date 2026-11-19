import type { WorkWeekMode } from '../types/project';

const PT_MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const PT_WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Parse YYYY-MM-DD into a UTC Date at midnight to avoid local timezone drift */
export function parseIsoDate(iso: string): Date {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return new Date(Date.UTC(2026, 10, 19));
  }
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

/** Format a UTC Date back to YYYY-MM-DD */
export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(iso: string, days: number): string {
  const dt = parseIsoDate(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toIsoDate(dt);
}

export function diffCalendarDays(startIso: string, endIso: string): number {
  const msPerDay = 86_400_000;
  return Math.round(
    (parseIsoDate(endIso).getTime() - parseIsoDate(startIso).getTime()) / msPerDay
  );
}

export function isWorkingDay(iso: string, mode: WorkWeekMode): boolean {
  const dow = parseIsoDate(iso).getUTCDay(); // 0=Sun, 6=Sat
  if (mode === 'all_days') return true;
  if (mode === 'mon_sat') return dow !== 0;
  return dow !== 0 && dow !== 6;
}

/** List all calendar ISO dates from startIso through endIso inclusive */
export function listDateRange(startIso: string, endIso: string): string[] {
  if (startIso > endIso) return [];
  const dates: string[] = [];
  let cursor = startIso;
  let guard = 0;
  while (cursor <= endIso && guard < 1500) {
    dates.push(cursor);
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return dates;
}

/**
 * Count working days between startIso and endIso.
 * By default inclusive of both endpoints when startIso <= endIso.
 * Returns 0 if startIso > endIso.
 */
export function countWorkingDays(
  startIso: string,
  endIso: string,
  mode: WorkWeekMode,
  inclusiveStart = true
): number {
  const actualStart = inclusiveStart ? startIso : addDaysIso(startIso, 1);
  if (actualStart > endIso) return 0;
  let count = 0;
  let cursor = actualStart;
  let guard = 0;
  while (cursor <= endIso && guard < 1500) {
    if (isWorkingDay(cursor, mode)) {
      count += 1;
    }
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return count;
}

/**
 * Advance by `workingDays` working days after `fromIso`.
 * If workingDays <= 0, returns fromIso.
 */
export function addWorkingDays(
  fromIso: string,
  workingDays: number,
  mode: WorkWeekMode
): string {
  if (workingDays <= 0) return fromIso;
  let remaining = Math.ceil(workingDays);
  let cursor = fromIso;
  let guard = 0;
  while (remaining > 0 && guard < 1500) {
    cursor = addDaysIso(cursor, 1);
    if (isWorkingDay(cursor, mode)) {
      remaining -= 1;
    }
    guard += 1;
  }
  return cursor;
}

/** Signed difference in working days: positive means targetIso is AFTER deadlineIso (late) */
export function workingDaysVariance(
  estimatedIso: string,
  deadlineIso: string,
  mode: WorkWeekMode
): number {
  if (estimatedIso === deadlineIso) return 0;
  if (estimatedIso > deadlineIso) {
    return countWorkingDays(deadlineIso, estimatedIso, mode, false);
  }
  return -countWorkingDays(estimatedIso, deadlineIso, mode, false);
}

export function formatDateBR(iso: string): string {
  if (!iso || iso.length < 10) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatShortDateBR(iso: string): string {
  if (!iso || iso.length < 10) return '—';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

export function formatWeekdayShortBR(iso: string): string {
  const dow = parseIsoDate(iso).getUTCDay();
  return PT_WEEKDAYS_SHORT[dow];
}

export function formatMonthYearBR(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return yearMonth;
  return `${PT_MONTHS[m - 1]} de ${y}`;
}

export function getMonthDateRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatNumberBR(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0,0';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSignedNumberBR(value: number, decimals = 1): string {
  const formatted = formatNumberBR(Math.abs(value), decimals);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}
