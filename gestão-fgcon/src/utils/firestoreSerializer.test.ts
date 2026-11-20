import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedState } from '../data/seedData.ts';
import type { AppState } from '../types/project.ts';
import {
  extractAppStateFromDoc,
  sanitizeAppStateForFirestore,
  stripUndefinedDeep,
  WORKSPACE_ARRAY_LIMITS,
} from './firestoreSerializer.ts';

test('stripUndefinedDeep removes undefined keys recursively while preserving valid values', () => {
  const cleaned = stripUndefinedDeep({
    id: 'rm-1',
    deadline: undefined,
    dailyGoalM2: 35,
    nested: { a: 1, b: undefined, list: [1, undefined, { x: 'ok', y: undefined }] },
  });

  assert.equal('deadline' in cleaned, false);
  assert.equal(cleaned.dailyGoalM2, 35);
  assert.deepEqual(cleaned.nested, { a: 1, list: [1, { x: 'ok' }] });
});

test('sanitizeAppStateForFirestore enforces rules-aligned project schema, defaults, and bounds', () => {
  const seed = createSeedState();
  const dirty: AppState = {
    ...seed,
    version: 999,
    project: {
      name: '   ',
      client: 'C'.repeat(300),
      location: 'L'.repeat(250),
      engineer: 'E'.repeat(220),
      crea: 'R'.repeat(150),
      startDate: 'invalid',
      planoDeadline: '2026-06-30',
      requadroDeadline: '',
      workWeekMode: 'invalid_mode' as AppState['project']['workWeekMode'],
      ...({ shadowField: 'injected' } as Record<string, unknown>),
    },
    floors: Array.from({ length: 120 }, (_, i) => ({
      id: `fl-${i}`,
      name: `Pav ${i}`,
      order: i + 1,
      deadline: undefined,
    })),
    rooms: [
      {
        id: 'rm-1',
        floorId: 'fl-0',
        name: 'Apto 101',
        targetPlanoM2: 200,
        targetRequadroM2: 50,
        deadline: '2026-07-10',
        dailyGoalM2: 40,
      },
      {
        id: 'rm-2',
        floorId: 'fl-0',
        name: 'Apto 102',
        targetPlanoM2: 180,
        targetRequadroM2: 40,
        deadline: undefined,
        dailyGoalM2: undefined,
      },
    ],
  };

  const sanitized = sanitizeAppStateForFirestore(dirty);

  assert.equal(sanitized.version, 100);
  assert.equal(sanitized.project.name, 'Obra sem título');
  assert.equal(sanitized.project.client.length, 200);
  assert.equal(sanitized.project.location.length, 200);
  assert.equal(sanitized.project.engineer.length, 200);
  assert.equal(sanitized.project.crea.length, 100);
  assert.match(sanitized.project.startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(sanitized.project.planoDeadline, '2026-06-30');
  assert.equal(sanitized.project.requadroDeadline, '2026-06-30');
  assert.equal(sanitized.project.workWeekMode, 'mon_sat');
  assert.equal(Object.keys(sanitized.project).length, 9);
  assert.equal('shadowField' in sanitized.project, false);
  assert.equal(sanitized.floors.length, WORKSPACE_ARRAY_LIMITS.floors);
  assert.equal('deadline' in sanitized.floors[0], false);
  assert.equal(sanitized.rooms[0].deadline, '2026-07-10');
  assert.equal(sanitized.rooms[0].dailyGoalM2, 40);
  assert.equal('deadline' in sanitized.rooms[1], false);
  assert.equal('dailyGoalM2' in sanitized.rooms[1], false);
});

test('extractAppStateFromDoc strips Firestore metadata fields and rejects malformed docs', () => {
  const seed = createSeedState();
  const docMap = {
    ...seed,
    ownerId: 'uid_abc123',
    createdAt: { seconds: 1700000000 },
    updatedAt: { seconds: 1700000100 },
  };

  const extracted = extractAppStateFromDoc(docMap);
  assert.ok(extracted);
  assert.equal('ownerId' in extracted, false);
  assert.equal('createdAt' in extracted, false);
  assert.equal('updatedAt' in extracted, false);
  assert.equal(extracted.project.name, seed.project.name);
  assert.equal(extracted.rooms.length, seed.rooms.length);

  assert.equal(extractAppStateFromDoc(undefined), null);
  assert.equal(extractAppStateFromDoc({ ownerId: 'uid_abc' }), null);
});
