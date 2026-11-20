import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSeedState } from './src/data/seedData';

const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const BLUEPRINT_PATH = path.resolve(process.cwd(), 'firebase-blueprint.json');
const RULES_TEXT = fs.readFileSync(RULES_PATH, 'utf8');
const BLUEPRINT = JSON.parse(fs.readFileSync(BLUEPRINT_PATH, 'utf8')) as {
  entities: Record<string, { required: string[]; properties: Record<string, unknown> }>;
  firestore: Record<string, unknown>;
};

interface MockAuth {
  uid: string;
  emailVerified: boolean;
}

interface MockTimestamp {
  __isTimestamp: true;
  ms: number;
}

const ts = (ms: number): MockTimestamp => ({ __isTimestamp: true, ms });
const isTimestamp = (v: unknown): v is MockTimestamp =>
  typeof v === 'object' && v !== null && (v as MockTimestamp).__isTimestamp === true;

const ID_RE = /^[a-zA-Z0-9_\-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WORKSPACE_KEYS = [
  'ownerId',
  'version',
  'project',
  'floors',
  'rooms',
  'entries',
  'dayMetas',
  'workers',
  'attendance',
  'roomHeadcounts',
  'createdAt',
  'updatedAt',
];
const MUTABLE_KEYS = new Set([
  'version',
  'project',
  'floors',
  'rooms',
  'entries',
  'dayMetas',
  'workers',
  'attendance',
  'roomHeadcounts',
  'updatedAt',
]);
const PROJECT_KEYS = [
  'name',
  'client',
  'location',
  'engineer',
  'crea',
  'startDate',
  'planoDeadline',
  'requadroDeadline',
  'workWeekMode',
];

function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_RE.test(id);
}

function isBoundedMapList(arr: unknown, maxLen: number): boolean {
  if (!Array.isArray(arr) || arr.length > maxLen) return false;
  if (arr.length === 0) return true;
  return typeof arr[0] === 'object' && arr[0] !== null && !Array.isArray(arr[0]);
}

function isValidProject(p: unknown): boolean {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return false;
  const obj = p as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (!PROJECT_KEYS.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => PROJECT_KEYS.includes(k))) return false;
  return (
    typeof obj.name === 'string' && obj.name.length >= 1 && obj.name.length <= 200 &&
    typeof obj.client === 'string' && obj.client.length <= 200 &&
    typeof obj.location === 'string' && obj.location.length <= 200 &&
    typeof obj.engineer === 'string' && obj.engineer.length <= 200 &&
    typeof obj.crea === 'string' && obj.crea.length <= 100 &&
    typeof obj.startDate === 'string' && obj.startDate.length === 10 && DATE_RE.test(obj.startDate) &&
    typeof obj.planoDeadline === 'string' && obj.planoDeadline.length === 10 && DATE_RE.test(obj.planoDeadline) &&
    typeof obj.requadroDeadline === 'string' && obj.requadroDeadline.length === 10 && DATE_RE.test(obj.requadroDeadline) &&
    typeof obj.workWeekMode === 'string' &&
    ['mon_fri', 'mon_sat', 'all_days'].includes(obj.workWeekMode)
  );
}

function isValidWorkspaceData(data: unknown, auth: MockAuth | null): boolean {
  if (!auth || typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  const keys = Object.keys(d);
  if (!WORKSPACE_KEYS.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => WORKSPACE_KEYS.includes(k))) return false;
  return (
    isValidId(d.ownerId) &&
    d.ownerId === auth.uid &&
    typeof d.version === 'number' && Number.isInteger(d.version) && d.version >= 1 && d.version <= 100 &&
    isValidProject(d.project) &&
    isBoundedMapList(d.floors, 100) &&
    isBoundedMapList(d.rooms, 500) &&
    isBoundedMapList(d.entries, 5000) &&
    isBoundedMapList(d.dayMetas, 1000) &&
    isBoundedMapList(d.workers, 300) &&
    isBoundedMapList(d.attendance, 5000) &&
    isBoundedMapList(d.roomHeadcounts, 5000) &&
    isTimestamp(d.createdAt) &&
    isTimestamp(d.updatedAt)
  );
}

function evaluateDadosRule(params: {
  op: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: MockAuth | null;
  userId?: string;
  incoming?: Record<string, unknown>;
  existing?: Record<string, unknown>;
  requestTime: MockTimestamp;
}): 'ALLOWED' | 'PERMISSION_DENIED' {
  const { op, auth, userId, incoming, existing, requestTime } = params;
  const verified = auth !== null && auth.emailVerified === true;
  const owner = auth !== null && auth.uid === userId;

  if (op === 'list' || op === 'delete') return 'PERMISSION_DENIED';
  if (op === 'get') {
    return verified && isValidId(userId) && owner ? 'ALLOWED' : 'PERMISSION_DENIED';
  }
  if (op === 'create') {
    if (!verified || !isValidId(userId) || !owner) return 'PERMISSION_DENIED';
    if (!isValidWorkspaceData(incoming, auth)) return 'PERMISSION_DENIED';
    if (
      !isTimestamp(incoming?.createdAt) ||
      !isTimestamp(incoming?.updatedAt) ||
      incoming.createdAt.ms !== requestTime.ms ||
      incoming.updatedAt.ms !== requestTime.ms
    ) {
      return 'PERMISSION_DENIED';
    }
    return 'ALLOWED';
  }
  if (op === 'update') {
    if (!verified || !isValidId(userId) || !owner || !existing || !incoming) {
      return 'PERMISSION_DENIED';
    }
    if (!isValidWorkspaceData(incoming, auth)) return 'PERMISSION_DENIED';
    if (incoming.ownerId !== existing.ownerId) return 'PERMISSION_DENIED';
    if (
      !isTimestamp(incoming.createdAt) ||
      !isTimestamp(existing.createdAt) ||
      incoming.createdAt.ms !== existing.createdAt.ms
    ) {
      return 'PERMISSION_DENIED';
    }
    if (!isTimestamp(incoming.updatedAt) || incoming.updatedAt.ms !== requestTime.ms) {
      return 'PERMISSION_DENIED';
    }
    const allKeys = new Set([...Object.keys(incoming), ...Object.keys(existing)]);
    const affected: string[] = [];
    for (const k of allKeys) {
      if (JSON.stringify(incoming[k]) !== JSON.stringify(existing[k])) {
        affected.push(k);
      }
    }
    if (!affected.every((k) => MUTABLE_KEYS.has(k))) return 'PERMISSION_DENIED';
    return 'ALLOWED';
  }
  return 'PERMISSION_DENIED';
}

function makeValidDoc(uid: string, createdMs: number, updatedMs: number): Record<string, unknown> {
  const seed = createSeedState();
  return {
    ...seed,
    ownerId: uid,
    createdAt: ts(createdMs),
    updatedAt: ts(updatedMs),
  };
}

test('firestore.rules enforces default-deny catch-all, Blueprint path coverage, and Eight Pillars clauses', () => {
  assert.ok(RULES_TEXT.includes("rules_version = '2';"));
  assert.ok(RULES_TEXT.includes('match /{document=**} {\n      allow read, write: if false;'));
  assert.ok(RULES_TEXT.includes('match /dados/{userId}'));
  assert.ok(RULES_TEXT.includes('allow list: if false;'));
  assert.ok(RULES_TEXT.includes('allow delete: if false;'));
  assert.ok(RULES_TEXT.includes('request.auth.token.email_verified == true'));
  assert.ok(RULES_TEXT.includes('isValidWorkspaceData(incoming())'));
  assert.ok(RULES_TEXT.includes('affectedKeys().hasOnly('));
  assert.ok(RULES_TEXT.includes('incoming().createdAt == existing().createdAt'));
  assert.ok(RULES_TEXT.includes('incoming().updatedAt == request.time'));
  assert.ok('/dados/{userId}' in BLUEPRINT.firestore);
  assert.deepEqual(
    [...BLUEPRINT.entities.WorkspaceData.required].sort(),
    [...WORKSPACE_KEYS].sort()
  );
});

test('legitimate verified owner can get, create, and update their own /dados/{uid} document', () => {
  const t1 = ts(1000);
  const t2 = ts(2000);
  const auth: MockAuth = { uid: 'user-a', emailVerified: true };
  const initialDoc = makeValidDoc('user-a', 1000, 1000);

  assert.equal(evaluateDadosRule({ op: 'get', auth, userId: 'user-a', requestTime: t1 }), 'ALLOWED');
  assert.equal(
    evaluateDadosRule({ op: 'create', auth, userId: 'user-a', incoming: initialDoc, requestTime: t1 }),
    'ALLOWED'
  );

  const updatedDoc = {
    ...initialDoc,
    project: { ...(initialDoc.project as Record<string, unknown>), name: 'Torre B — Atualizada' },
    updatedAt: t2,
  };
  assert.equal(
    evaluateDadosRule({
      op: 'update',
      auth,
      userId: 'user-a',
      existing: initialDoc,
      incoming: updatedDoc,
      requestTime: t2,
    }),
    'ALLOWED'
  );
});

test('Dirty Dozen #1-#4: blocks unauthenticated read, cross-user read, collection list, and unverified email write', () => {
  const t1 = ts(1000);
  const docA = makeValidDoc('user-a', 1000, 1000);

  // 1. Unauthenticated read
  assert.equal(evaluateDadosRule({ op: 'get', auth: null, userId: 'user-a', requestTime: t1 }), 'PERMISSION_DENIED');
  // 2. Cross-user read
  assert.equal(
    evaluateDadosRule({ op: 'get', auth: { uid: 'user-a', emailVerified: true }, userId: 'user-b', requestTime: t1 }),
    'PERMISSION_DENIED'
  );
  // 3. Collection list enumeration
  assert.equal(
    evaluateDadosRule({ op: 'list', auth: { uid: 'user-a', emailVerified: true }, requestTime: t1 }),
    'PERMISSION_DENIED'
  );
  // 4. Unverified email spoofed write
  assert.equal(
    evaluateDadosRule({
      op: 'create',
      auth: { uid: 'user-a', emailVerified: false },
      userId: 'user-a',
      incoming: docA,
      requestTime: t1,
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen #5-#8: blocks identity spoofing, shadow fields on create/update, and ownerId mutation', () => {
  const t1 = ts(1000);
  const t2 = ts(2000);
  const auth: MockAuth = { uid: 'user-a', emailVerified: true };
  const docA = makeValidDoc('user-a', 1000, 1000);

  // 5. Identity spoofing on create
  assert.equal(
    evaluateDadosRule({
      op: 'create',
      auth,
      userId: 'user-a',
      incoming: { ...docA, ownerId: 'user-b' },
      requestTime: t1,
    }),
    'PERMISSION_DENIED'
  );
  // 6. Shadow field on create
  assert.equal(
    evaluateDadosRule({
      op: 'create',
      auth,
      userId: 'user-a',
      incoming: { ...docA, isAdmin: true },
      requestTime: t1,
    }),
    'PERMISSION_DENIED'
  );
  // 7. Shadow field on update
  assert.equal(
    evaluateDadosRule({
      op: 'update',
      auth,
      userId: 'user-a',
      existing: docA,
      incoming: { ...docA, updatedAt: t2, role: 'superadmin' },
      requestTime: t2,
    }),
    'PERMISSION_DENIED'
  );
  // 8. Immortal ownerId mutation
  assert.equal(
    evaluateDadosRule({
      op: 'update',
      auth,
      userId: 'user-a',
      existing: docA,
      incoming: { ...docA, ownerId: 'user-c', updatedAt: t2 },
      requestTime: t2,
    }),
    'PERMISSION_DENIED'
  );
});

test('Dirty Dozen #9-#12: blocks createdAt forgery, client timestamps, value/date poisoning, and array/ID poisoning', () => {
  const t1 = ts(1000);
  const t2 = ts(2000);
  const auth: MockAuth = { uid: 'user-a', emailVerified: true };
  const docA = makeValidDoc('user-a', 1000, 1000);

  // 9. Immortal createdAt mutation
  assert.equal(
    evaluateDadosRule({
      op: 'update',
      auth,
      userId: 'user-a',
      existing: docA,
      incoming: { ...docA, createdAt: t2, updatedAt: t2 },
      requestTime: t2,
    }),
    'PERMISSION_DENIED'
  );
  // 10. Client-forged updatedAt != request.time
  assert.equal(
    evaluateDadosRule({
      op: 'update',
      auth,
      userId: 'user-a',
      existing: docA,
      incoming: { ...docA, updatedAt: ts(999999) },
      requestTime: t2,
    }),
    'PERMISSION_DENIED'
  );
  // 11. Value & date poisoning (oversized name & invalid date)
  assert.equal(
    evaluateDadosRule({
      op: 'update',
      auth,
      userId: 'user-a',
      existing: docA,
      incoming: {
        ...docA,
        project: { ...(docA.project as Record<string, unknown>), name: 'X'.repeat(250) },
        updatedAt: t2,
      },
      requestTime: t2,
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateDadosRule({
      op: 'update',
      auth,
      userId: 'user-a',
      existing: docA,
      incoming: {
        ...docA,
        project: { ...(docA.project as Record<string, unknown>), startDate: 'not-a-date' },
        updatedAt: t2,
      },
      requestTime: t2,
    }),
    'PERMISSION_DENIED'
  );
  // 12. Array type / volumetric poisoning & poisoned path ID
  assert.equal(
    evaluateDadosRule({
      op: 'update',
      auth,
      userId: 'user-a',
      existing: docA,
      incoming: { ...docA, floors: ['not-a-map'], updatedAt: t2 },
      requestTime: t2,
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateDadosRule({
      op: 'update',
      auth,
      userId: 'user-a',
      existing: docA,
      incoming: { ...docA, floors: Array.from({ length: 101 }, () => ({ id: 'f' })), updatedAt: t2 },
      requestTime: t2,
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateDadosRule({
      op: 'get',
      auth: { uid: 'a'.repeat(150), emailVerified: true },
      userId: 'a'.repeat(150),
      requestTime: t1,
    }),
    'PERMISSION_DENIED'
  );
});
