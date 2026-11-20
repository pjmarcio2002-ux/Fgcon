import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../data/seedData';
import {
  buildTimelineSeries,
  calculateIdealDailyRate,
  generateAlerts,
  getDayAttendanceSummary,
  getFloorMetrics,
  getLatestFloorDerivedDeadline,
  getRoomMetrics,
  getServiceSummary,
  getWeeklyProgressData,
  sCurveFraction,
} from './calculations';
import { countWorkingDays, addWorkingDays } from './dates';
import { generateDailyPdf, generateMonthlyPdf } from './pdfReports';
import { validateImportedState } from './storage';

test('calculateIdealDailyRate matches user example: 50 m² in 5 days = 10 m²/day', () => {
  assert.equal(calculateIdealDailyRate(50, 5), 10);
  assert.equal(calculateIdealDailyRate(125, 10), 12.5);
  assert.equal(calculateIdealDailyRate(0, 5), 0);
  assert.equal(calculateIdealDailyRate(40, 0), 40);
});

test('working day counters respect mon_fri and mon_sat schedules', () => {
  // 2026-11-02 (Mon) to 2026-11-08 (Sun): 5 weekdays, 6 mon-sat days
  assert.equal(countWorkingDays('2026-11-02', '2026-11-08', 'mon_fri', true), 5);
  assert.equal(countWorkingDays('2026-11-02', '2026-11-08', 'mon_sat', true), 6);
  assert.equal(countWorkingDays('2026-11-02', '2026-11-08', 'all_days', true), 7);

  // Adding 5 working days from Monday 2026-11-02 lands on Monday 2026-11-09
  assert.equal(addWorkingDays('2026-11-02', 5, 'mon_fri'), '2026-11-09');
});

test('negative rework reduces net executed, increases remaining, and raises ideal daily rate', () => {
  const state = createSeedState();
  const before = getServiceSummary(state, 'plano', '2026-11-19');

  const withExtraRework = {
    ...state,
    entries: [
      ...state.entries,
      {
        id: 'rw-test-1',
        date: '2026-11-19',
        roomId: 'rm-301',
        service: 'plano' as const,
        areaM2: -40,
        isRework: true,
        reworkReason: 'chuva' as const,
        notes: 'Teste de retrabalho por chuva',
      },
    ],
  };

  const after = getServiceSummary(withExtraRework, 'plano', '2026-11-19');

  assert.equal(
    Math.round((before.breakdown.netExecutedM2 - after.breakdown.netExecutedM2) * 100) / 100,
    40
  );
  assert.equal(
    Math.round((after.breakdown.remainingM2 - before.breakdown.remainingM2) * 100) / 100,
    40
  );
  assert.ok(after.idealDailyRate > before.idealDailyRate);
  assert.ok(after.averageRealDailyRate < before.averageRealDailyRate);
});

test('S-curve planned trajectory is monotonic and hits 100% on deadline', () => {
  assert.equal(sCurveFraction(0), 0);
  assert.equal(sCurveFraction(1), 1);
  assert.ok(sCurveFraction(0.5) > 0.45 && sCurveFraction(0.5) < 0.55);

  const state = createSeedState();
  const series = buildTimelineSeries(state, 'plano', '2026-11-19');
  const summary = getServiceSummary(state, 'plano', '2026-11-19');

  assert.ok(series.length > 10);
  for (let i = 1; i < series.length; i++) {
    assert.ok(series[i].cumulativePlanned >= series[i - 1].cumulativePlanned);
  }
  const deadlinePt = series.find((p) => p.date === state.project.planoDeadline);
  assert.ok(deadlinePt, 'Deadline point must exist in timeline');
  assert.equal(deadlinePt.cumulativePlanned, summary.breakdown.targetM2);
});

test('seed data triggers real productivity below ideal alert for Plano', () => {
  const state = createSeedState();
  const plano = getServiceSummary(state, 'plano', '2026-11-19');
  const alerts = generateAlerts(state, '2026-11-19');

  assert.ok(
    plano.averageRealDailyRate < plano.idealDailyRate,
    `Expected Plano real (${plano.averageRealDailyRate}) < ideal (${plano.idealDailyRate})`
  );
  assert.ok(
    alerts.some((a) => a.scope === 'plano' && a.id === 'pace-plano'),
    'Expected active pace alert for Emboço Plano'
  );
  assert.ok(
    alerts.some((a) => a.id === 'recent-rework'),
    'Expected recent rain rework alert'
  );
});

test('room and floor metrics roll up consistently', () => {
  const state = createSeedState();
  const rooms = getRoomMetrics(state, '2026-11-19');
  const floors = getFloorMetrics(state, '2026-11-19');

  const roomsSumPlano = Math.round(
    rooms.reduce((s, r) => s + r.plano.netExecutedM2, 0) * 100
  ) / 100;
  const floorsSumPlano = Math.round(
    floors.reduce((s, f) => s + f.plano.netExecutedM2, 0) * 100
  ) / 100;

  assert.equal(roomsSumPlano, floorsSumPlano);
  assert.equal(floors.length, 4);
  assert.equal(rooms.length, 15);
});

test('daily attendance summary respects worker assignment and manual headcount overrides', () => {
  const state = createSeedState();
  const day = getDayAttendanceSummary(state, '2026-11-19');
  assert.equal(day.presentCount, 7);
  assert.equal(day.absentCount, 1);

  const rm301 = day.byRoom.find((r) => r.roomId === 'rm-301');
  assert.ok(rm301);
  assert.equal(rm301.effectiveHeadcount, 5);
  assert.ok(rm301.productivityPerWorker > 0);

  // Manual override takes precedence on that room
  const overridden = {
    ...state,
    roomHeadcounts: [{ date: '2026-11-19', roomId: 'rm-301', count: 6 }],
  };
  const dayOver = getDayAttendanceSummary(overridden, '2026-11-19');
  const rm301Over = dayOver.byRoom.find((r) => r.roomId === 'rm-301');
  assert.equal(rm301Over?.effectiveHeadcount, 6);
});

test('weekly progress data returns 7 consecutive days ending on targetDate', () => {
  const state = createSeedState();
  const weekly = getWeeklyProgressData(state, '2026-11-19');
  assert.equal(weekly.length, 7);
  assert.equal(weekly[0].date, '2026-11-13');
  assert.equal(weekly[6].date, '2026-11-19');
  // 2026-11-17 has -11 m² rework
  const nov17 = weekly.find((w) => w.date === '2026-11-17');
  assert.equal(nov17?.reworkMagnitude, 11);
});

test('PDF generators produce valid non-empty PDF documents for Daily and Monthly reports', () => {
  const state = createSeedState();
  const dailyDoc = generateDailyPdf(state, '2026-11-19');
  const dailyBytes = new Uint8Array(dailyDoc.output('arraybuffer'));
  const dailyHeader = new TextDecoder().decode(dailyBytes.slice(0, 5));
  assert.equal(dailyHeader, '%PDF-');
  assert.ok(dailyBytes.byteLength > 5000);

  const monthlyDoc = generateMonthlyPdf(state, '2026-11');
  const monthlyBytes = new Uint8Array(monthlyDoc.output('arraybuffer'));
  const monthlyHeader = new TextDecoder().decode(monthlyBytes.slice(0, 5));
  assert.equal(monthlyHeader, '%PDF-');
  assert.ok(monthlyBytes.byteLength > 5000);
});

test('storage import validator rejects malformed payloads and accepts valid backups', () => {
  const bad = validateImportedState('{"foo":"bar"}');
  assert.equal(bad.ok, false);

  const state = createSeedState();
  const good = validateImportedState(JSON.stringify(state));
  assert.equal(good.ok, true);
});

test('floor completion date is automatically pulled from the latest room deadline', () => {
  const state = createSeedState();
  const floors = getFloorMetrics(state, '2026-11-19');

  const fl1 = floors.find((f) => f.floor.id === 'fl-1');
  const fl2 = floors.find((f) => f.floor.id === 'fl-2');
  const fl4 = floors.find((f) => f.floor.id === 'fl-4');

  assert.equal(fl1?.deadlineSource, 'rooms_auto');
  assert.equal(fl1?.derivedDeadline, '2026-11-13');
  assert.equal(fl1?.controllingRoomName, 'Varanda Gourmet');
  assert.equal(fl1?.roomsWithGoalsCount, 4);

  assert.equal(fl2?.deadlineSource, 'rooms_auto');
  assert.equal(fl2?.derivedDeadline, '2026-11-25');
  assert.equal(fl2?.controllingRoomName, 'Varanda e Hall Social');

  assert.equal(fl4?.deadlineSource, 'rooms_auto');
  assert.equal(fl4?.derivedDeadline, '2026-12-10');
  assert.equal(fl4?.controllingRoomName, 'Hall e Casa de Máquinas');

  assert.equal(getLatestFloorDerivedDeadline(floors), '2026-12-10');
});

test('room with only dailyGoalM2 computes finish date in working days and drives floor auto deadline', () => {
  const state = createSeedState();
  const rooms = getRoomMetrics(state, '2026-11-19');
  const floors = getFloorMetrics(state, '2026-11-19');

  // rm-304 has 76 + 24 = 100 m² remaining, dailyGoalM2 = 10 -> 10 working days after 2026-11-19 (Thu) = 2026-12-03
  const rm304 = rooms.find((r) => r.room.id === 'rm-304');
  assert.ok(rm304);
  assert.equal(rm304.deadlineSource, 'daily_goal');
  assert.equal(rm304.effectiveDeadline, '2026-12-03');

  const fl3 = floors.find((f) => f.floor.id === 'fl-3');
  assert.equal(fl3?.deadlineSource, 'rooms_auto');
  assert.equal(fl3?.derivedDeadline, '2026-12-03');
  assert.equal(fl3?.controllingRoomId, 'rm-304');
  assert.equal(fl3?.controllingRoomName, 'Varanda e Circulação');
});

test('updating a room deadline immediately shifts the floor derived finish date and controlling room', () => {
  const state = createSeedState();
  const updated = {
    ...state,
    rooms: state.rooms.map((r) =>
      r.id === 'rm-201' ? { ...r, deadline: '2026-12-04' } : r
    ),
  };

  const floors = getFloorMetrics(updated, '2026-11-19');
  const fl2 = floors.find((f) => f.floor.id === 'fl-2');
  assert.equal(fl2?.derivedDeadline, '2026-12-04');
  assert.equal(fl2?.controllingRoomId, 'rm-201');
  assert.equal(fl2?.controllingRoomName, 'Sala de Estar / Jantar');
});

test('floor with zero room goals falls back to none or legacy floor deadline cleanly', () => {
  const state = createSeedState();
  const withEmptyFloor = {
    ...state,
    floors: [
      ...state.floors,
      { id: 'fl-empty', name: '5º Pavimento', order: 5 },
      { id: 'fl-legacy', name: '6º Pavimento', order: 6, deadline: '2026-12-18' },
    ],
    rooms: [
      ...state.rooms,
      { id: 'rm-501', floorId: 'fl-empty', name: 'Sala', targetPlanoM2: 80, targetRequadroM2: 20 },
    ],
  };

  const floors = getFloorMetrics(withEmptyFloor, '2026-11-19');
  const flEmpty = floors.find((f) => f.floor.id === 'fl-empty');
  const flLegacy = floors.find((f) => f.floor.id === 'fl-legacy');

  assert.equal(flEmpty?.derivedDeadline, null);
  assert.equal(flEmpty?.deadlineSource, 'none');
  assert.equal(flEmpty?.controllingRoomName, null);

  assert.equal(flLegacy?.derivedDeadline, '2026-12-18');
  assert.equal(flLegacy?.deadlineSource, 'floor_manual');
});
