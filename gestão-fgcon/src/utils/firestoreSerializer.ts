import type {
  AppState,
  AttendanceRecord,
  DayMeta,
  Floor,
  ProductionEntry,
  ProjectConfig,
  Room,
  RoomHeadcountOverride,
  WorkWeekMode,
  Worker,
} from '../types/project';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_WORK_WEEKS = new Set<WorkWeekMode>(['mon_fri', 'mon_sat', 'all_days']);

export const WORKSPACE_ARRAY_LIMITS = {
  floors: 100,
  rooms: 500,
  entries: 5000,
  dayMetas: 1000,
  workers: 300,
  attendance: 5000,
  roomHeadcounts: 5000,
} as const;

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.slice(0, maxLen);
}

function ensureNonEmptyString(val: unknown, maxLen: number, fallback: string): string {
  const str = typeof val === 'string' ? val.trim() : '';
  if (!str) return fallback.slice(0, maxLen);
  return str.slice(0, maxLen);
}

function ensureIsoDate(val: unknown, fallback: string): string {
  if (typeof val === 'string' && ISO_DATE_RE.test(val)) {
    return val;
  }
  return ISO_DATE_RE.test(fallback) ? fallback : todayIso();
}

function ensureFiniteNumber(val: unknown, fallback = 0): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

/**
 * Recursively strips `undefined` values from objects/arrays because Firestore
 * rejects documents containing any `undefined` field values.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

/**
 * Sanitizes an AppState payload so it strictly conforms to the Firestore
 * security rules schema (exact project keys, ISO dates, string limits, array
 * bounds, valid version integer, and zero `undefined` values).
 */
export function sanitizeAppStateForFirestore(state: AppState): AppState {
  const fallbackDate = todayIso();
  const rawProject = (state.project ?? {}) as Partial<ProjectConfig>;

  const startDate = ensureIsoDate(rawProject.startDate, fallbackDate);
  const planoDeadline = ensureIsoDate(rawProject.planoDeadline, startDate);
  const requadroDeadline = ensureIsoDate(rawProject.requadroDeadline, planoDeadline);
  const workWeekMode: WorkWeekMode = VALID_WORK_WEEKS.has(
    rawProject.workWeekMode as WorkWeekMode
  )
    ? (rawProject.workWeekMode as WorkWeekMode)
    : 'mon_sat';

  const project: ProjectConfig = {
    name: ensureNonEmptyString(rawProject.name, 200, 'Obra sem título'),
    client: clampString(rawProject.client, 200, ''),
    location: clampString(rawProject.location, 200, ''),
    engineer: clampString(rawProject.engineer, 200, ''),
    crea: clampString(rawProject.crea, 100, ''),
    startDate,
    planoDeadline,
    requadroDeadline,
    workWeekMode,
  };

  const rawVersion = Math.trunc(ensureFiniteNumber(state.version, 1));
  const version = Math.min(100, Math.max(1, rawVersion));

  const floors: Floor[] = (Array.isArray(state.floors) ? state.floors : [])
    .filter((f): f is Floor => Boolean(f && typeof f === 'object'))
    .slice(0, WORKSPACE_ARRAY_LIMITS.floors)
    .map((f) => stripUndefinedDeep(f));

  const rooms: Room[] = (Array.isArray(state.rooms) ? state.rooms : [])
    .filter((r): r is Room => Boolean(r && typeof r === 'object'))
    .slice(0, WORKSPACE_ARRAY_LIMITS.rooms)
    .map((r) => stripUndefinedDeep(r));

  const entries: ProductionEntry[] = (Array.isArray(state.entries) ? state.entries : [])
    .filter((e): e is ProductionEntry => Boolean(e && typeof e === 'object'))
    .slice(0, WORKSPACE_ARRAY_LIMITS.entries)
    .map((e) => stripUndefinedDeep(e));

  const dayMetas: DayMeta[] = (Array.isArray(state.dayMetas) ? state.dayMetas : [])
    .filter((m): m is DayMeta => Boolean(m && typeof m === 'object'))
    .slice(0, WORKSPACE_ARRAY_LIMITS.dayMetas)
    .map((m) => stripUndefinedDeep(m));

  const workers: Worker[] = (Array.isArray(state.workers) ? state.workers : [])
    .filter((w): w is Worker => Boolean(w && typeof w === 'object'))
    .slice(0, WORKSPACE_ARRAY_LIMITS.workers)
    .map((w) => stripUndefinedDeep(w));

  const attendance: AttendanceRecord[] = (
    Array.isArray(state.attendance) ? state.attendance : []
  )
    .filter((a): a is AttendanceRecord => Boolean(a && typeof a === 'object'))
    .slice(0, WORKSPACE_ARRAY_LIMITS.attendance)
    .map((a) => stripUndefinedDeep(a));

  const roomHeadcounts: RoomHeadcountOverride[] = (
    Array.isArray(state.roomHeadcounts) ? state.roomHeadcounts : []
  )
    .filter((rh): rh is RoomHeadcountOverride => Boolean(rh && typeof rh === 'object'))
    .slice(0, WORKSPACE_ARRAY_LIMITS.roomHeadcounts)
    .map((rh) => stripUndefinedDeep(rh));

  return {
    version,
    project,
    floors,
    rooms,
    entries,
    dayMetas,
    workers,
    attendance,
    roomHeadcounts,
  };
}

/**
 * Extracts a clean AppState from a raw Firestore document map (ignoring
 * Firestore metadata fields like ownerId, createdAt, updatedAt).
 */
export function extractAppStateFromDoc(
  data: Record<string, unknown> | undefined
): AppState | null {
  if (!data || typeof data !== 'object') return null;
  if (!data.project || typeof data.project !== 'object') return null;
  if (!Array.isArray(data.floors) || !Array.isArray(data.rooms)) return null;

  return sanitizeAppStateForFirestore({
    version: typeof data.version === 'number' ? data.version : 1,
    project: data.project as ProjectConfig,
    floors: data.floors as Floor[],
    rooms: data.rooms as Room[],
    entries: Array.isArray(data.entries) ? (data.entries as ProductionEntry[]) : [],
    dayMetas: Array.isArray(data.dayMetas) ? (data.dayMetas as DayMeta[]) : [],
    workers: Array.isArray(data.workers) ? (data.workers as Worker[]) : [],
    attendance: Array.isArray(data.attendance)
      ? (data.attendance as AttendanceRecord[])
      : [],
    roomHeadcounts: Array.isArray(data.roomHeadcounts)
      ? (data.roomHeadcounts as RoomHeadcountOverride[])
      : [],
  });
}
