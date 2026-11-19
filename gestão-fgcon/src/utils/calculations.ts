import type {
  AppState,
  AttendanceRecord,
  Floor,
  ProductionEntry,
  ReworkReason,
  Room,
  ServiceScope,
  ServiceType,
} from '../types/project';
import {
  addDaysIso,
  addWorkingDays,
  countWorkingDays,
  formatDateBR,
  formatNumberBR,
  formatShortDateBR,
  formatWeekdayShortBR,
  getMonthDateRange,
  isWorkingDay,
  listDateRange,
  workingDaysVariance,
} from './dates';

export interface ServiceBreakdown {
  targetM2: number;
  grossExecutedM2: number;
  /** Positive magnitude of rework m² (e.g., 12.5 means -12.5 m² lost) */
  reworkM2: number;
  netExecutedM2: number;
  remainingM2: number;
  percentComplete: number;
}

export interface RoomMetrics {
  room: Room;
  floorName: string;
  plano: ServiceBreakdown;
  requadro: ServiceBreakdown;
  total: ServiceBreakdown;
}

export interface FloorMetrics {
  floor: Floor;
  roomCount: number;
  plano: ServiceBreakdown;
  requadro: ServiceBreakdown;
  total: ServiceBreakdown;
}

export type ScheduleStatus =
  | 'completed'
  | 'on_track'
  | 'warning'
  | 'delayed'
  | 'overdue'
  | 'stalled';

export interface ServiceSummary {
  scope: ServiceScope;
  deadline: string;
  referenceDate: string;
  breakdown: ServiceBreakdown;
  elapsedWorkDays: number;
  remainingWorkDays: number;
  /** Required m²/day based on remaining m² divided by remaining working days */
  idealDailyRate: number;
  /** Historical average net m²/working day up to referenceDate */
  averageRealDailyRate: number;
  /** Rolling 7-day average net m²/working day */
  recent7DayAvgRate: number;
  /** Net m² executed on referenceDate */
  latestDayRate: number;
  /** Ratio averageRealDailyRate / idealDailyRate (1.0 = on pace) */
  paceRatio: number;
  estimatedDaysToFinish: number | null;
  estimatedCompletionDate: string | null;
  /** Working days behind (+) or ahead (-) of deadline */
  daysVariance: number | null;
  scheduleStatus: ScheduleStatus;
}

export interface TimelinePoint {
  date: string;
  label: string;
  weekday: string;
  isWorkDay: boolean;
  isFuture: boolean;
  dailyGross: number;
  /** Stored as negative number (<= 0) for direct plotting below zero axis */
  dailyRework: number;
  dailyNet: number;
  cumulativeReal: number | null;
  cumulativePlanned: number;
  cumulativeProjected: number | null;
  /** Dynamic ideal m²/day required from this day onward */
  idealDaily: number;
  avgRealSoFar: number | null;
}

export interface ProductivityAlert {
  id: string;
  severity: 'critical' | 'warning';
  scope: ServiceScope;
  title: string;
  message: string;
  metricLabel: string;
}

export interface WeeklyBarPoint {
  date: string;
  label: string;
  weekday: string;
  planoNet: number;
  requadroNet: number;
  reworkMagnitude: number;
  reworkNegative: number;
  totalNet: number;
  idealDaily: number;
  weather: string;
}

export interface RoomDayAttendance {
  roomId: string;
  roomName: string;
  floorId: string;
  floorName: string;
  assignedWorkers: { id: string; name: string; role: string; status: AttendanceRecord['status'] }[];
  manualCount: number | null;
  effectiveHeadcount: number;
  planoDayM2: number;
  requadroDayM2: number;
  totalDayM2: number;
  productivityPerWorker: number;
}

export interface DayAttendanceSummary {
  date: string;
  totalActiveWorkers: number;
  presentCount: number;
  halfDayCount: number;
  absentCount: number;
  rainAbsentCount: number;
  effectiveManDays: number;
  totalAllocatedHeadcount: number;
  byRoom: RoomDayAttendance[];
  records: (AttendanceRecord & { workerName: string; workerRole: string; roomLabel: string })[];
}

export interface MonthlyWorkerAttendance {
  workerId: string;
  name: string;
  role: string;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  rainAbsentDays: number;
  effectiveManDays: number;
  attendanceRate: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function makeBreakdown(
  targetM2: number,
  grossExecutedM2: number,
  reworkMagnitudeM2: number
): ServiceBreakdown {
  const safeTarget = Math.max(0, round2(targetM2));
  const safeGross = round2(grossExecutedM2);
  const safeRework = Math.max(0, round2(reworkMagnitudeM2));
  const netExecutedM2 = round2(safeGross - safeRework);
  const remainingM2 = round2(Math.max(0, safeTarget - netExecutedM2));
  const percentComplete =
    safeTarget > 0
      ? round2(Math.min(100, Math.max(0, (netExecutedM2 / safeTarget) * 100)))
      : 0;

  return {
    targetM2: safeTarget,
    grossExecutedM2: safeGross,
    reworkM2: safeRework,
    netExecutedM2,
    remainingM2,
    percentComplete,
  };
}

export function filterEntriesByScope(
  entries: ProductionEntry[],
  scope: ServiceScope
): ProductionEntry[] {
  if (scope === 'geral') return entries;
  return entries.filter((e) => e.service === scope);
}

export function getScopeTarget(rooms: Room[], scope: ServiceScope): number {
  return round2(
    rooms.reduce((sum, room) => {
      if (scope === 'plano') return sum + room.targetPlanoM2;
      if (scope === 'requadro') return sum + room.targetRequadroM2;
      return sum + room.targetPlanoM2 + room.targetRequadroM2;
    }, 0)
  );
}

export function getScopeDeadline(state: AppState, scope: ServiceScope): string {
  if (scope === 'plano') return state.project.planoDeadline;
  if (scope === 'requadro') return state.project.requadroDeadline;
  return state.project.planoDeadline >= state.project.requadroDeadline
    ? state.project.planoDeadline
    : state.project.requadroDeadline;
}

/**
 * Determine the operational reference date:
 * latest logged entry date (or project startDate if no entries yet).
 */
export function getReferenceDate(state: AppState, explicitDate?: string): string {
  if (explicitDate) return explicitDate;
  const allDates = [
    ...state.entries.map((e) => e.date),
    ...state.dayMetas.map((m) => m.date),
  ].sort();
  if (allDates.length > 0) {
    return allDates[allDates.length - 1];
  }
  return state.project.startDate;
}

/**
 * Pure formula for Ideal Daily Productivity:
 * Remaining m² divided by remaining working days up to deadline.
 * Example from user brief: 50 m² remaining, 5 days to deadline -> 10.0 m²/day.
 */
export function calculateIdealDailyRate(
  remainingM2: number,
  remainingWorkDays: number
): number {
  const safeRemaining = Math.max(0, remainingM2);
  if (safeRemaining === 0) return 0;
  if (remainingWorkDays <= 0) return round2(safeRemaining);
  return round2(safeRemaining / remainingWorkDays);
}

/**
 * Smooth S-Curve cumulative weight (0..1) for fraction t in [0..1].
 * Uses normalized logistic curve with mild steepness so ramp-up, cruise,
 * and taper mirror real civil construction emboço production curves.
 */
export function sCurveFraction(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const k = 6.5;
  const raw = 1 / (1 + Math.exp(-k * (t - 0.5)));
  const min = 1 / (1 + Math.exp(k * 0.5));
  const max = 1 / (1 + Math.exp(-k * 0.5));
  return (raw - min) / (max - min);
}

export function getRoomMetrics(
  state: AppState,
  upToDate?: string
): RoomMetrics[] {
  const floorMap = new Map(state.floors.map((f) => [f.id, f]));
  const entries = upToDate
    ? state.entries.filter((e) => e.date <= upToDate)
    : state.entries;

  const sortedRooms = [...state.rooms].sort((a, b) => {
    const fa = floorMap.get(a.floorId)?.order ?? 999;
    const fb = floorMap.get(b.floorId)?.order ?? 999;
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  return sortedRooms.map((room) => {
    const roomEntries = entries.filter((e) => e.roomId === room.id);

    const calcFor = (service: ServiceType, target: number) => {
      let gross = 0;
      let rework = 0;
      for (const e of roomEntries) {
        if (e.service !== service) continue;
        if (e.areaM2 < 0 || e.isRework) {
          rework += Math.abs(e.areaM2);
        } else {
          gross += e.areaM2;
        }
      }
      return makeBreakdown(target, gross, rework);
    };

    const plano = calcFor('plano', room.targetPlanoM2);
    const requadro = calcFor('requadro', room.targetRequadroM2);
    const total = makeBreakdown(
      room.targetPlanoM2 + room.targetRequadroM2,
      plano.grossExecutedM2 + requadro.grossExecutedM2,
      plano.reworkM2 + requadro.reworkM2
    );

    return {
      room,
      floorName: floorMap.get(room.floorId)?.name ?? 'Sem Pavimento',
      plano,
      requadro,
      total,
    };
  });
}

export function getFloorMetrics(
  state: AppState,
  upToDate?: string
): FloorMetrics[] {
  const roomMetrics = getRoomMetrics(state, upToDate);
  const sortedFloors = [...state.floors].sort((a, b) => a.order - b.order);

  return sortedFloors.map((floor) => {
    const floorRooms = roomMetrics.filter((rm) => rm.room.floorId === floor.id);
    const sumBreakdowns = (pick: (rm: RoomMetrics) => ServiceBreakdown) => {
      let target = 0;
      let gross = 0;
      let rework = 0;
      for (const rm of floorRooms) {
        const b = pick(rm);
        target += b.targetM2;
        gross += b.grossExecutedM2;
        rework += b.reworkM2;
      }
      return makeBreakdown(target, gross, rework);
    };

    return {
      floor,
      roomCount: floorRooms.length,
      plano: sumBreakdowns((r) => r.plano),
      requadro: sumBreakdowns((r) => r.requadro),
      total: sumBreakdowns((r) => r.total),
    };
  });
}

export function getServiceSummary(
  state: AppState,
  scope: ServiceScope,
  explicitRefDate?: string
): ServiceSummary {
  const referenceDate = getReferenceDate(state, explicitRefDate);
  const deadline = getScopeDeadline(state, scope);
  const mode = state.project.workWeekMode;
  const targetM2 = getScopeTarget(state.rooms, scope);

  const scopedEntries = filterEntriesByScope(state.entries, scope).filter(
    (e) => e.date <= referenceDate
  );

  let gross = 0;
  let rework = 0;
  let latestDayRate = 0;

  for (const e of scopedEntries) {
    const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
    if (signed < 0) {
      rework += Math.abs(signed);
    } else {
      gross += signed;
    }
    if (e.date === referenceDate) {
      latestDayRate += signed;
    }
  }

  const breakdown = makeBreakdown(targetM2, gross, rework);

  const elapsedWorkDays = Math.max(
    1,
    countWorkingDays(state.project.startDate, referenceDate, mode, true)
  );

  // Remaining execution working days strictly AFTER referenceDate up through deadline
  // (because work logged on referenceDate is already accounted in netExecutedM2)
  const remainingWorkDays = countWorkingDays(
    referenceDate,
    deadline,
    mode,
    false
  );

  const idealDailyRate = calculateIdealDailyRate(
    breakdown.remainingM2,
    remainingWorkDays
  );

  const averageRealDailyRate = round2(breakdown.netExecutedM2 / elapsedWorkDays);

  // 7-day rolling window ending on referenceDate
  const weekStart = addDaysIso(referenceDate, -6);
  const effectiveWeekStart =
    weekStart < state.project.startDate ? state.project.startDate : weekStart;
  const weekWorkDays = Math.max(
    1,
    countWorkingDays(effectiveWeekStart, referenceDate, mode, true)
  );
  const weekNet = scopedEntries
    .filter((e) => e.date >= effectiveWeekStart && e.date <= referenceDate)
    .reduce((sum, e) => sum + (e.isRework ? -Math.abs(e.areaM2) : e.areaM2), 0);
  const recent7DayAvgRate = round2(weekNet / weekWorkDays);

  let estimatedDaysToFinish: number | null = null;
  let estimatedCompletionDate: string | null = null;
  let daysVariance: number | null = null;
  let scheduleStatus: ScheduleStatus = 'on_track';

  if (breakdown.remainingM2 <= 0 && breakdown.targetM2 > 0) {
    estimatedDaysToFinish = 0;
    estimatedCompletionDate = referenceDate;
    daysVariance = workingDaysVariance(referenceDate, deadline, mode);
    scheduleStatus = 'completed';
  } else if (breakdown.targetM2 === 0) {
    scheduleStatus = 'on_track';
  } else if (remainingWorkDays <= 0 && referenceDate >= deadline) {
    scheduleStatus = 'overdue';
    if (averageRealDailyRate > 0) {
      estimatedDaysToFinish = Math.ceil(breakdown.remainingM2 / averageRealDailyRate);
      estimatedCompletionDate = addWorkingDays(
        referenceDate,
        estimatedDaysToFinish,
        mode
      );
      daysVariance = workingDaysVariance(estimatedCompletionDate, deadline, mode);
    }
  } else if (averageRealDailyRate <= 0) {
    scheduleStatus = 'stalled';
  } else {
    estimatedDaysToFinish = Math.ceil(breakdown.remainingM2 / averageRealDailyRate);
    estimatedCompletionDate = addWorkingDays(
      referenceDate,
      estimatedDaysToFinish,
      mode
    );
    daysVariance = workingDaysVariance(estimatedCompletionDate, deadline, mode);

    if (daysVariance > 2 || averageRealDailyRate < idealDailyRate * 0.85) {
      scheduleStatus = 'delayed';
    } else if (daysVariance > 0 || averageRealDailyRate < idealDailyRate) {
      scheduleStatus = 'warning';
    } else {
      scheduleStatus = 'on_track';
    }
  }

  const paceRatio =
    idealDailyRate > 0
      ? round2(averageRealDailyRate / idealDailyRate)
      : breakdown.remainingM2 === 0
        ? 1
        : 0;

  return {
    scope,
    deadline,
    referenceDate,
    breakdown,
    elapsedWorkDays,
    remainingWorkDays,
    idealDailyRate,
    averageRealDailyRate,
    recent7DayAvgRate,
    latestDayRate: round2(latestDayRate),
    paceRatio,
    estimatedDaysToFinish,
    estimatedCompletionDate,
    daysVariance,
    scheduleStatus,
  };
}

/**
 * Build day-by-day S-Curve and Ideal vs Real Productivity timeline.
 */
export function buildTimelineSeries(
  state: AppState,
  scope: ServiceScope,
  explicitRefDate?: string
): TimelinePoint[] {
  const summary = getServiceSummary(state, scope, explicitRefDate);
  const { startDate, workWeekMode } = state.project;
  const deadline = summary.deadline;
  const referenceDate = summary.referenceDate;
  const targetM2 = summary.breakdown.targetM2;

  // Determine chart end date (at least deadline, capped cleanly to avoid runaway projections)
  let endDate = deadline >= referenceDate ? deadline : referenceDate;
  if (summary.estimatedCompletionDate && summary.estimatedCompletionDate > endDate) {
    const capDate = addDaysIso(deadline, 45);
    endDate =
      summary.estimatedCompletionDate <= capDate
        ? summary.estimatedCompletionDate
        : capDate;
  }

  const dates = listDateRange(startDate, endDate);
  const scopedEntries = filterEntriesByScope(state.entries, scope);

  // Map daily totals
  const dailyMap = new Map<string, { gross: number; rework: number; net: number }>();
  for (const e of scopedEntries) {
    const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
    const prev = dailyMap.get(e.date) ?? { gross: 0, rework: 0, net: 0 };
    if (signed < 0) {
      prev.rework += signed; // negative
    } else {
      prev.gross += signed;
    }
    prev.net += signed;
    dailyMap.set(e.date, prev);
  }

  // Working day index up to deadline for S-Curve planned trajectory
  const totalPlannedWorkDays = Math.max(
    1,
    countWorkingDays(startDate, deadline, workWeekMode, true)
  );

  let cumulativeRealRunning = 0;
  let elapsedWorkDaysRunning = 0;
  let plannedWorkDayIndex = 0;
  let projectedRunning = summary.breakdown.netExecutedM2;

  const points: TimelinePoint[] = [];

  for (const date of dates) {
    const workDay = isWorkingDay(date, workWeekMode);
    const isFuture = date > referenceDate;

    if (workDay && date <= deadline) {
      plannedWorkDayIndex += 1;
    }

    const plannedT =
      date >= deadline
        ? 1
        : Math.min(1, plannedWorkDayIndex / totalPlannedWorkDays);
    const cumulativePlanned = round2(targetM2 * sCurveFraction(plannedT));

    // Dynamic ideal daily rate at start of this day:
    // remaining before today's execution divided by remaining working days (including today) up to deadline
    const remainingBeforeDay = Math.max(
      0,
      targetM2 - (isFuture ? projectedRunning : cumulativeRealRunning)
    );
    const workDaysLeftIncludingToday = countWorkingDays(
      date,
      deadline,
      workWeekMode,
      true
    );
    const idealDaily =
      date <= deadline
        ? calculateIdealDailyRate(remainingBeforeDay, workDaysLeftIncludingToday)
        : summary.idealDailyRate;

    const dayRec = dailyMap.get(date) ?? { gross: 0, rework: 0, net: 0 };

    let cumulativeReal: number | null = null;
    let avgRealSoFar: number | null = null;
    let cumulativeProjected: number | null = null;

    if (!isFuture) {
      if (workDay) {
        elapsedWorkDaysRunning += 1;
      }
      cumulativeRealRunning = round2(cumulativeRealRunning + dayRec.net);
      cumulativeReal = cumulativeRealRunning;
      avgRealSoFar =
        elapsedWorkDaysRunning > 0
          ? round2(cumulativeRealRunning / elapsedWorkDaysRunning)
          : 0;

      // Anchor projected curve at referenceDate so lines connect seamlessly
      if (date === referenceDate) {
        cumulativeProjected = cumulativeRealRunning;
      }
    } else {
      if (summary.averageRealDailyRate > 0) {
        if (workDay) {
          projectedRunning = round2(
            Math.min(targetM2, projectedRunning + summary.averageRealDailyRate)
          );
        }
        cumulativeProjected = projectedRunning;
      }
    }

    points.push({
      date,
      label: formatShortDateBR(date),
      weekday: formatWeekdayShortBR(date),
      isWorkDay: workDay,
      isFuture,
      dailyGross: isFuture ? 0 : round2(dayRec.gross),
      dailyRework: isFuture ? 0 : round2(dayRec.rework),
      dailyNet: isFuture ? 0 : round2(dayRec.net),
      cumulativeReal,
      cumulativePlanned,
      cumulativeProjected,
      idealDaily,
      avgRealSoFar,
    });
  }

  return points;
}

export function generateAlerts(
  state: AppState,
  explicitRefDate?: string
): ProductivityAlert[] {
  const alerts: ProductivityAlert[] = [];
  const scopes: ServiceType[] = ['plano', 'requadro'];

  for (const scope of scopes) {
    const summary = getServiceSummary(state, scope, explicitRefDate);
    const label = scope === 'plano' ? 'Emboço Plano' : 'Requadro';

    if (summary.breakdown.targetM2 === 0 || summary.scheduleStatus === 'completed') {
      continue;
    }

    if (summary.scheduleStatus === 'overdue') {
      alerts.push({
        id: `overdue-${scope}`,
        severity: 'critical',
        scope,
        title: `${label} ultrapassou a data limite (${formatDateBR(summary.deadline)})`,
        message: `Restam ${formatNumberBR(summary.breakdown.remainingM2)} m² pendentes após o prazo contratual.`,
        metricLabel: `Faltam ${formatNumberBR(summary.breakdown.remainingM2)} m²`,
      });
      continue;
    }

    if (summary.scheduleStatus === 'stalled') {
      alerts.push({
        id: `stalled-${scope}`,
        severity: 'critical',
        scope,
        title: `${label} sem produção líquida positiva`,
        message: `Necessário atingir ${formatNumberBR(summary.idealDailyRate)} m²/dia nos próximos ${summary.remainingWorkDays} dias úteis.`,
        metricLabel: `Meta: ${formatNumberBR(summary.idealDailyRate)} m²/dia`,
      });
      continue;
    }

    if (summary.averageRealDailyRate < summary.idealDailyRate) {
      const gapPct =
        summary.idealDailyRate > 0
          ? Math.round(
              ((summary.idealDailyRate - summary.averageRealDailyRate) /
                summary.idealDailyRate) *
                100
            )
          : 0;
      const delayText =
        summary.daysVariance && summary.daysVariance > 0
          ? ` Projeção indica atraso de ${summary.daysVariance} dia(s) útil(eis) (entrega estimada em ${formatDateBR(summary.estimatedCompletionDate ?? '')}).`
          : '';

      alerts.push({
        id: `pace-${scope}`,
        severity: gapPct >= 15 || (summary.daysVariance ?? 0) >= 3 ? 'critical' : 'warning',
        scope,
        title: `Produtividade Real de ${label} abaixo da Ideal (-${gapPct}%)`,
        message: `Ritmo médio real de ${formatNumberBR(summary.averageRealDailyRate)} m²/dia frente à ideal necessária de ${formatNumberBR(summary.idealDailyRate)} m²/dia.${delayText}`,
        metricLabel: `${formatNumberBR(summary.averageRealDailyRate)} vs ${formatNumberBR(summary.idealDailyRate)} m²/dia`,
      });
    }
  }

  // Recent rework alert (within last 7 days from referenceDate)
  const refDate = getReferenceDate(state, explicitRefDate);
  const weekStart = addDaysIso(refDate, -6);
  const recentReworks = state.entries.filter(
    (e) =>
      (e.isRework || e.areaM2 < 0) &&
      e.date >= weekStart &&
      e.date <= refDate
  );

  if (recentReworks.length > 0) {
    const totalLoss = round2(
      recentReworks.reduce((sum, e) => sum + Math.abs(e.areaM2), 0)
    );
    const rainCount = recentReworks.filter((e) => e.reworkReason === 'chuva').length;
    const causeNote =
      rainCount > 0 ? 'com impacto direto de chuva' : 'registrado na semana';

    alerts.push({
      id: 'recent-rework',
      severity: totalLoss >= 15 ? 'critical' : 'warning',
      scope: 'geral',
      title: `Retrabalho recente impactou a curva (-${formatNumberBR(totalLoss)} m²)`,
      message: `${recentReworks.length} ocorrência(s) nos últimos 7 dias ${causeNote}. O saldo faltante e a produtividade ideal diária foram recalculados automaticamente.`,
      metricLabel: `-${formatNumberBR(totalLoss)} m² na semana`,
    });
  }

  return alerts;
}

/**
 * Build 7-day weekly progress array ending on targetDate (ideal for Daily PDF & preview).
 */
export function getWeeklyProgressData(
  state: AppState,
  targetDate: string
): WeeklyBarPoint[] {
  const start = addDaysIso(targetDate, -6);
  const dates = listDateRange(start, targetDate);
  const geralSummary = getServiceSummary(state, 'geral', targetDate);
  const metaMap = new Map(state.dayMetas.map((m) => [m.date, m]));

  return dates.map((date) => {
    const dayEntries = state.entries.filter((e) => e.date === date);
    let planoPos = 0;
    let requadroPos = 0;
    let reworkMag = 0;

    for (const e of dayEntries) {
      const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
      if (signed < 0) {
        reworkMag += Math.abs(signed);
      } else if (e.service === 'plano') {
        planoPos += signed;
      } else {
        requadroPos += signed;
      }
    }

    const totalNet = round2(planoPos + requadroPos - reworkMag);

    return {
      date,
      label: formatShortDateBR(date),
      weekday: formatWeekdayShortBR(date),
      planoNet: round2(planoPos),
      requadroNet: round2(requadroPos),
      reworkMagnitude: round2(reworkMag),
      reworkNegative: round2(-reworkMag),
      totalNet,
      idealDaily: geralSummary.idealDailyRate,
      weather: metaMap.get(date)?.weather ?? 'ensolarado',
    };
  });
}

export function getDayAttendanceSummary(
  state: AppState,
  date: string
): DayAttendanceSummary {
  const floorMap = new Map(state.floors.map((f) => [f.id, f]));
  const roomMap = new Map(state.rooms.map((r) => [r.id, r]));
  const activeWorkers = state.workers.filter((w) => w.active);

  const dayRecords = state.attendance.filter((a) => a.date === date);
  const recordByWorker = new Map(dayRecords.map((a) => [a.workerId, a]));

  let presentCount = 0;
  let halfDayCount = 0;
  let absentCount = 0;
  let rainAbsentCount = 0;
  let effectiveManDays = 0;

  const enrichedRecords: DayAttendanceSummary['records'] = activeWorkers.map(
    (worker) => {
      const rec = recordByWorker.get(worker.id);
      const status = rec?.status ?? 'presente';
      if (rec) {
        if (status === 'presente') {
          presentCount += 1;
          effectiveManDays += 1;
        } else if (status === 'meio_periodo') {
          halfDayCount += 1;
          effectiveManDays += 0.5;
        } else if (status === 'falta_chuva') {
          rainAbsentCount += 1;
        } else {
          absentCount += 1;
        }
      }

      const room = rec?.roomId ? roomMap.get(rec.roomId) : undefined;
      const floor = room ? floorMap.get(room.floorId) : undefined;
      const roomLabel = room
        ? `${floor?.name ?? ''} — ${room.name}`
        : 'Não alocado';

      return {
        date,
        workerId: worker.id,
        status: rec?.status ?? 'falta',
        roomId: rec?.roomId,
        notes: rec?.notes,
        workerName: worker.name,
        workerRole: worker.role,
        roomLabel: rec ? roomLabel : 'Sem registro no dia',
      };
    }
  );

  // Room headcount + day production per room
  const overrideMap = new Map(
    state.roomHeadcounts
      .filter((rh) => rh.date === date)
      .map((rh) => [rh.roomId, rh.count])
  );
  const dayEntries = state.entries.filter((e) => e.date === date);

  const sortedRooms = [...state.rooms].sort((a, b) => {
    const fa = floorMap.get(a.floorId)?.order ?? 999;
    const fb = floorMap.get(b.floorId)?.order ?? 999;
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  const byRoom: RoomDayAttendance[] = sortedRooms.map((room) => {
    const assignedWorkers = dayRecords
      .filter(
        (rec) =>
          rec.roomId === room.id &&
          (rec.status === 'presente' || rec.status === 'meio_periodo')
      )
      .map((rec) => {
        const w = state.workers.find((wk) => wk.id === rec.workerId);
        return {
          id: rec.workerId,
          name: w?.name ?? 'Colaborador',
          role: w?.role ?? '',
          status: rec.status,
        };
      });

    const manualCount = overrideMap.has(room.id)
      ? (overrideMap.get(room.id) ?? 0)
      : null;
    const effectiveHeadcount =
      manualCount !== null ? manualCount : assignedWorkers.length;

    let planoDayM2 = 0;
    let requadroDayM2 = 0;
    for (const e of dayEntries) {
      if (e.roomId !== room.id) continue;
      const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
      if (e.service === 'plano') planoDayM2 += signed;
      else requadroDayM2 += signed;
    }

    const totalDayM2 = round2(planoDayM2 + requadroDayM2);
    const productivityPerWorker =
      effectiveHeadcount > 0 ? round2(totalDayM2 / effectiveHeadcount) : 0;

    return {
      roomId: room.id,
      roomName: room.name,
      floorId: room.floorId,
      floorName: floorMap.get(room.floorId)?.name ?? '',
      assignedWorkers,
      manualCount,
      effectiveHeadcount,
      planoDayM2: round2(planoDayM2),
      requadroDayM2: round2(requadroDayM2),
      totalDayM2,
      productivityPerWorker,
    };
  });

  const totalAllocatedHeadcount = byRoom.reduce(
    (sum, r) => sum + r.effectiveHeadcount,
    0
  );

  return {
    date,
    totalActiveWorkers: activeWorkers.length,
    presentCount,
    halfDayCount,
    absentCount,
    rainAbsentCount,
    effectiveManDays: round2(effectiveManDays),
    totalAllocatedHeadcount,
    byRoom,
    records: enrichedRecords,
  };
}

export function getMonthAttendanceSummary(
  state: AppState,
  yearMonth: string
): {
  workers: MonthlyWorkerAttendance[];
  totalManDays: number;
  recordedDays: number;
  roomAverages: {
    roomId: string;
    floorName: string;
    roomName: string;
    daysWithTeam: number;
    avgHeadcount: number;
    monthM2: number;
  }[];
} {
  const { start, end } = getMonthDateRange(yearMonth);
  const monthRecords = state.attendance.filter(
    (a) => a.date >= start && a.date <= end
  );
  const monthOverrides = state.roomHeadcounts.filter(
    (r) => r.date >= start && r.date <= end
  );
  const monthEntries = state.entries.filter(
    (e) => e.date >= start && e.date <= end
  );

  const uniqueDates = new Set<string>([
    ...monthRecords.map((r) => r.date),
    ...monthOverrides.map((r) => r.date),
  ]);

  const workers: MonthlyWorkerAttendance[] = state.workers.map((worker) => {
    const recs = monthRecords.filter((r) => r.workerId === worker.id);
    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let rainAbsentDays = 0;

    for (const r of recs) {
      if (r.status === 'presente') presentDays += 1;
      else if (r.status === 'meio_periodo') halfDays += 1;
      else if (r.status === 'falta_chuva') rainAbsentDays += 1;
      else absentDays += 1;
    }

    const effectiveManDays = round2(presentDays + halfDays * 0.5);
    const totalMarked = recs.length;
    const attendanceRate =
      totalMarked > 0 ? round2((effectiveManDays / totalMarked) * 100) : 0;

    return {
      workerId: worker.id,
      name: worker.name,
      role: worker.role,
      presentDays,
      halfDays,
      absentDays,
      rainAbsentDays,
      effectiveManDays,
      attendanceRate,
    };
  });

  const totalManDays = round2(
    workers.reduce((sum, w) => sum + w.effectiveManDays, 0)
  );

  const floorMap = new Map(state.floors.map((f) => [f.id, f]));
  const roomAverages = state.rooms.map((room) => {
    let headcountSum = 0;
    let daysWithTeam = 0;

    for (const date of uniqueDates) {
      const ov = monthOverrides.find(
        (o) => o.date === date && o.roomId === room.id
      );
      const assigned = monthRecords.filter(
        (r) =>
          r.date === date &&
          r.roomId === room.id &&
          (r.status === 'presente' || r.status === 'meio_periodo')
      ).length;
      const eff = ov ? ov.count : assigned;
      if (eff > 0) {
        headcountSum += eff;
        daysWithTeam += 1;
      }
    }

    const monthM2 = round2(
      monthEntries
        .filter((e) => e.roomId === room.id)
        .reduce((sum, e) => sum + (e.isRework ? -Math.abs(e.areaM2) : e.areaM2), 0)
    );

    return {
      roomId: room.id,
      floorName: floorMap.get(room.floorId)?.name ?? '',
      roomName: room.name,
      daysWithTeam,
      avgHeadcount: daysWithTeam > 0 ? round2(headcountSum / daysWithTeam) : 0,
      monthM2,
    };
  });

  return {
    workers,
    totalManDays,
    recordedDays: uniqueDates.size,
    roomAverages,
  };
}

export function getMonthProductionSummary(state: AppState, yearMonth: string) {
  const { start, end } = getMonthDateRange(yearMonth);
  const monthEntries = state.entries.filter(
    (e) => e.date >= start && e.date <= end
  );
  const monthMetas = state.dayMetas.filter(
    (m) => m.date >= start && m.date <= end
  );

  let planoGross = 0;
  let planoRework = 0;
  let requadroGross = 0;
  let requadroRework = 0;

  for (const e of monthEntries) {
    const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
    if (e.service === 'plano') {
      if (signed < 0) planoRework += Math.abs(signed);
      else planoGross += signed;
    } else {
      if (signed < 0) requadroRework += Math.abs(signed);
      else requadroGross += signed;
    }
  }

  const rainyDays = monthMetas.filter(
    (m) => m.weather === 'chuva_leve' || m.weather === 'chuva_forte'
  ).length;
  const activeDates = new Set(monthEntries.map((e) => e.date));
  const reworkEntries = monthEntries.filter((e) => e.isRework || e.areaM2 < 0);

  return {
    yearMonth,
    start,
    end,
    activeDaysCount: activeDates.size,
    rainyDays,
    planoGross: round2(planoGross),
    planoRework: round2(planoRework),
    planoNet: round2(planoGross - planoRework),
    requadroGross: round2(requadroGross),
    requadroRework: round2(requadroRework),
    requadroNet: round2(requadroGross - requadroRework),
    totalGross: round2(planoGross + requadroGross),
    totalRework: round2(planoRework + requadroRework),
    totalNet: round2(planoGross + requadroGross - planoRework - requadroRework),
    reworkEntries,
  };
}

export function getReworkSummaryByReason(
  entries: ProductionEntry[]
): { reason: ReworkReason; count: number; totalM2: number }[] {
  const map = new Map<ReworkReason, { count: number; totalM2: number }>();
  for (const e of entries) {
    if (!e.isRework && e.areaM2 >= 0) continue;
    const reason: ReworkReason = e.reworkReason ?? 'outro';
    const curr = map.get(reason) ?? { count: 0, totalM2: 0 };
    curr.count += 1;
    curr.totalM2 = round2(curr.totalM2 + Math.abs(e.areaM2));
    map.set(reason, curr);
  }
  return Array.from(map.entries())
    .map(([reason, data]) => ({ reason, ...data }))
    .sort((a, b) => b.totalM2 - a.totalM2);
}
