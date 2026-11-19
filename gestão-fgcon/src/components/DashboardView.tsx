import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudRain,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ActiveTab, AppState, ServiceScope } from '../types/project';
import { SERVICE_LABELS } from '../types/project';
import {
  buildTimelineSeries,
  generateAlerts,
  getDayAttendanceSummary,
  getFloorMetrics,
  getReferenceDate,
  getRoomMetrics,
  getServiceSummary,
} from '../utils/calculations';
import {
  formatDateBR,
  formatNumberBR,
  formatShortDateBR,
} from '../utils/dates';

interface DashboardViewProps {
  state: AppState;
  onNavigate: (tab: ActiveTab) => void;
}

const SCOPE_OPTIONS: { id: ServiceScope; label: string }[] = [
  { id: 'geral', label: 'Consolidado' },
  { id: 'plano', label: 'Emboço Plano' },
  { id: 'requadro', label: 'Requadro' },
];

export function DashboardView({ state, onNavigate }: DashboardViewProps) {
  const [scope, setScope] = useState<ServiceScope>('geral');
  const [expandedFloorIds, setExpandedFloorIds] = useState<Record<string, boolean>>({});

  const refDate = useMemo(() => getReferenceDate(state), [state]);
  const summary = useMemo(
    () => getServiceSummary(state, scope, refDate),
    [state, scope, refDate]
  );
  const planoSummary = useMemo(
    () => getServiceSummary(state, 'plano', refDate),
    [state, refDate]
  );
  const requadroSummary = useMemo(
    () => getServiceSummary(state, 'requadro', refDate),
    [state, refDate]
  );
  const timeline = useMemo(
    () => buildTimelineSeries(state, scope, refDate),
    [state, scope, refDate]
  );
  const alerts = useMemo(() => generateAlerts(state, refDate), [state, refDate]);
  const floorMetrics = useMemo(() => getFloorMetrics(state, refDate), [state, refDate]);
  const roomMetrics = useMemo(() => getRoomMetrics(state, refDate), [state, refDate]);
  const latestAttendance = useMemo(
    () => getDayAttendanceSummary(state, refDate),
    [state, refDate]
  );

  const visibleAlerts = useMemo(() => {
    if (scope === 'geral') return alerts;
    return alerts.filter((a) => a.scope === scope || a.scope === 'geral');
  }, [alerts, scope]);

  // Productivity chart only shows elapsed days (startDate -> refDate) so daily bars are crisp and readable
  const productivitySeries = useMemo(
    () => timeline.filter((pt) => !pt.isFuture && (pt.isWorkDay || pt.dailyNet !== 0)),
    [timeline]
  );

  const deadlineChartLabel = useMemo(() => {
    const match = timeline.find((p) => p.date === summary.deadline);
    return match ? match.label : formatShortDateBR(summary.deadline);
  }, [timeline, summary.deadline]);

  const toggleFloor = (floorId: string) => {
    setExpandedFloorIds((prev) => ({ ...prev, [floorId]: !prev[floorId] }));
  };

  const hasRooms = state.rooms.length > 0;

  const scheduleStatusMeta = (() => {
    switch (summary.scheduleStatus) {
      case 'completed':
        return {
          label: 'Serviço concluído',
          color: 'text-emerald-700',
          icon: CheckCircle2,
          detail: `Concluído em ${formatDateBR(refDate)}`,
        };
      case 'on_track':
        return {
          label: 'Dentro do cronograma',
          color: 'text-emerald-700',
          icon: TrendingUp,
          detail:
            summary.daysVariance !== null && summary.daysVariance < 0
              ? `${Math.abs(summary.daysVariance)} dia(s) útil(eis) adiantado`
              : 'Ritmo compatível com o prazo',
        };
      case 'warning':
        return {
          label: 'Atenção ao ritmo',
          color: 'text-amber-700',
          icon: AlertTriangle,
          detail:
            summary.daysVariance && summary.daysVariance > 0
              ? `Risco de atraso de ${summary.daysVariance} dia(s) útil(eis)`
              : 'Produtividade ligeiramente abaixo da ideal',
        };
      case 'overdue':
        return {
          label: 'Prazo ultrapassado',
          color: 'text-red-700',
          icon: AlertTriangle,
          detail: `Saldo pendente após ${formatDateBR(summary.deadline)}`,
        };
      case 'stalled':
        return {
          label: 'Sem ritmo produtivo',
          color: 'text-red-700',
          icon: TrendingDown,
          detail: 'Registre produção positiva para projetar entrega',
        };
      default:
        return {
          label: 'Atraso previsto',
          color: 'text-red-700',
          icon: TrendingDown,
          detail:
            summary.daysVariance && summary.daysVariance > 0
              ? `Atraso estimado de ${summary.daysVariance} dia(s) útil(eis)`
              : 'Ritmo abaixo da meta diária ideal',
        };
    }
  })();

  const StatusIcon = scheduleStatusMeta.icon;

  return (
    <div className="space-y-6">
      {/* Page Title Row + Service Scope Segmented Control */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Acompanhamento de Produção
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            <span>{SERVICE_LABELS[scope]}</span>
            <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
            <span>Último registro: {formatDateBR(refDate)}</span>
            <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
            <span>Data limite: {formatDateBR(summary.deadline)}</span>
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Filtrar por tipo de serviço"
          className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 self-start md:self-auto"
        >
          {SCOPE_OPTIONS.map((opt) => {
            const active = scope === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setScope(opt.id)}
                className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty State when no rooms configured */}
      {!hasRooms ? (
        <section className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Nenhum pavimento ou ambiente cadastrado
          </h2>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
            Cadastre os pavimentos, ambientes e o levantamento de m² para Emboço Plano e Requadro para gerar a Curva S e acompanhar a produtividade.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('structure')}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors"
          >
            <span>Cadastrar Pavimentos e Ambientes</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </section>
      ) : (
        <>
          {/* Automatic Productivity & Rework Alerts */}
          {visibleAlerts.length > 0 && (
            <section aria-label="Alertas de produtividade e cronograma" className="space-y-2.5">
              {visibleAlerts.map((alert) => {
                const isCrit = alert.severity === 'critical';
                return (
                  <div
                    key={alert.id}
                    role="alert"
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 rounded-lg border ${
                      isCrit
                        ? 'bg-red-50/70 border-red-200 text-red-950'
                        : 'bg-amber-50/70 border-amber-200 text-amber-950'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <AlertTriangle
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          isCrit ? 'text-red-700' : 'text-amber-700'
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span
                            className={`text-xs font-semibold ${
                              isCrit ? 'text-red-700' : 'text-amber-800'
                            }`}
                          >
                            {isCrit ? 'Alerta crítico' : 'Atenção'}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <p className="text-sm font-semibold text-slate-900">
                            {alert.title}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs sm:text-sm text-slate-700">
                          {alert.message}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 pl-7 sm:pl-0">
                      <span
                        className={`text-xs font-mono font-semibold tabular-nums whitespace-nowrap ${
                          isCrit ? 'text-red-800' : 'text-amber-900'
                        }`}
                      >
                        {alert.metricLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate('daily')}
                        className="text-xs font-medium text-slate-900 underline underline-offset-4 hover:text-[#1D4ED8] whitespace-nowrap"
                      >
                        Lançar produção
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* 4-Column Executive KPI Grid (Flat hairline panels, zero nested cards) */}
          <section
            aria-label="Indicadores principais"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
          >
            {/* KPI 1: Executed vs Remaining */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Executado vs Faltante</span>
                <span className="font-mono font-medium text-[#1D4ED8] tabular-nums">
                  {formatNumberBR(summary.breakdown.percentComplete, 1)}%
                </span>
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {formatNumberBR(summary.breakdown.netExecutedM2, 1)}{' '}
                <span className="text-sm font-normal text-slate-500">m²</span>
              </p>
              <div className="mt-2.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1D4ED8]"
                  style={{ width: `${summary.breakdown.percentComplete}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
                Faltam <strong className="text-slate-900">{formatNumberBR(summary.breakdown.remainingM2, 1)} m²</strong> de{' '}
                {formatNumberBR(summary.breakdown.targetM2, 1)} m²
              </p>
            </div>

            {/* KPI 2: Real vs Ideal Productivity */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="whitespace-nowrap">Real vs Ideal</span>
                <span
                  className={`font-mono font-semibold tabular-nums whitespace-nowrap shrink-0 ${
                    summary.averageRealDailyRate < summary.idealDailyRate &&
                    summary.breakdown.remainingM2 > 0
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {summary.idealDailyRate > 0
                    ? `${Math.round(summary.paceRatio * 100)}% da meta`
                    : 'Concluído'}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-2xl font-semibold text-slate-900">
                  {formatNumberBR(summary.averageRealDailyRate, 1)}
                </span>
                <span className="text-sm text-slate-400">/</span>
                <span className="text-lg font-medium text-amber-700">
                  {formatNumberBR(summary.idealDailyRate, 1)}
                </span>
                <span className="text-xs text-slate-500">m²/dia</span>
              </div>
              <p className="mt-2.5 text-xs text-slate-600">
                Ideal = {formatNumberBR(summary.breakdown.remainingM2, 1)} m² ÷{' '}
                <span className="font-mono tabular-nums">{summary.remainingWorkDays}</span> dias úteis
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                Média 7 dias: {formatNumberBR(summary.recent7DayAvgRate, 1)} m²/dia
              </p>
            </div>

            {/* KPI 3: Schedule Forecast */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Previsão de Entrega</span>
                <CalendarClock className="w-4 h-4 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {summary.estimatedCompletionDate
                  ? formatDateBR(summary.estimatedCompletionDate)
                  : 'Indefinida'}
              </p>
              <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${scheduleStatusMeta.color}`}>
                <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{scheduleStatusMeta.label}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {scheduleStatusMeta.detail}
              </p>
            </div>

            {/* KPI 4: Rework & Latest Headcount */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Retrabalho & Efetivo</span>
                <CloudRain className="w-4 h-4 text-slate-400" aria-hidden="true" />
              </div>
              <p
                className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                  summary.breakdown.reworkM2 > 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {summary.breakdown.reworkM2 > 0
                  ? `-${formatNumberBR(summary.breakdown.reworkM2, 1)}`
                  : '0,0'}{' '}
                <span className="text-sm font-normal text-slate-500">m²</span>
              </p>
              <p className="mt-2.5 text-xs text-slate-600">
                Bruto: <span className="font-mono tabular-nums">{formatNumberBR(summary.breakdown.grossExecutedM2, 1)} m²</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Efetivo ({formatShortDateBR(refDate)}):{' '}
                <span className="font-mono font-medium text-slate-800 tabular-nums">
                  {latestAttendance.totalAllocatedHeadcount} pessoa(s)
                </span>
              </p>
            </div>
          </section>

          {/* Service Dual Summary Strip (Always compares Plano vs Requadro side by side) */}
          <section
            aria-label="Comparativo Emboço Plano e Requadro"
            className="bg-white border border-slate-200 rounded-lg divide-y md:divide-y-0 md:divide-x divide-slate-200 grid grid-cols-1 md:grid-cols-2"
          >
            {[
              { title: 'Emboço Plano', data: planoSummary, barColor: 'bg-[#1D4ED8]' },
              { title: 'Requadro', data: requadroSummary, barColor: 'bg-[#0F766E]' },
            ].map((item) => {
              const behind =
                item.data.averageRealDailyRate < item.data.idealDailyRate &&
                item.data.breakdown.remainingM2 > 0;
              return (
                <div key={item.title} className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-sm font-semibold text-slate-900">
                      {item.title}
                    </h2>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      Prazo {formatDateBR(item.data.deadline)} · {item.data.remainingWorkDays}d úteis
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
                    <span>
                      Exec. <strong className="text-slate-900">{formatNumberBR(item.data.breakdown.netExecutedM2)} m²</strong>
                    </span>
                    <span>
                      Falta <strong className="text-slate-900">{formatNumberBR(item.data.breakdown.remainingM2)} m²</strong>
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatNumberBR(item.data.breakdown.percentComplete, 1)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.barColor}`}
                      style={{ width: `${item.data.breakdown.percentComplete}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600 font-mono tabular-nums">
                      Real: <strong className={behind ? 'text-red-700' : 'text-emerald-700'}>{formatNumberBR(item.data.averageRealDailyRate)} m²/dia</strong>
                      <span className="mx-1.5 text-slate-300">|</span>
                      Ideal: <strong className="text-amber-700">{formatNumberBR(item.data.idealDailyRate)} m²/dia</strong>
                    </span>
                    <span className={`font-medium ${behind ? 'text-red-700' : 'text-emerald-700'}`}>
                      {item.data.estimatedCompletionDate
                        ? `Prev. ${formatDateBR(item.data.estimatedCompletionDate)}`
                        : 'Sem projeção'}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Primary Focal Anchor: Curva S (Acumulado Planejado vs Real vs Projeção) */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                  Curva S — Evolução Acumulada ({scope === 'geral' ? 'Consolidado' : scope === 'plano' ? 'Emboço Plano' : 'Requadro'})
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  Comparativo entre curva planejada, metragem líquida executada e projeção linear no ritmo real atual.
                </p>
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap shrink-0">
                Meta total: <strong className="text-slate-900">{formatNumberBR(summary.breakdown.targetM2)} m²</strong>
              </div>
            </div>

            <div className="h-[320px] w-full" data-testid="scurve-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={timeline}
                  margin={{ top: 10, right: 24, left: 4, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
                    tickLine={false}
                    axisLine={{ stroke: '#CBD5E1' }}
                    minTickGap={22}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v} m²`}
                    width={74}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                    }}
                    formatter={(value, name) => {
                      const num = typeof value === 'number' ? value : Number(value ?? 0);
                      return [`${formatNumberBR(num, 1)} m²`, String(name ?? '')];
                    }}
                    labelFormatter={(label) => `Data: ${String(label ?? '')}`}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                  />
                  <ReferenceLine
                    x={deadlineChartLabel}
                    stroke="#B91C1C"
                    strokeDasharray="4 4"
                    label={{
                      value: `Prazo (${formatShortDateBR(summary.deadline)})`,
                      position: 'insideTopRight',
                      fill: '#B91C1C',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativePlanned"
                    name="Curva S Planejada"
                    stroke="#64748B"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeReal"
                    name="Acumulado Real"
                    stroke="#1D4ED8"
                    strokeWidth={3}
                    dot={{ r: 2.5, fill: '#1D4ED8' }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeProjected"
                    name="Projeção no Ritmo Atual"
                    stroke="#B45309"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Productivity Comparison Chart: Ideal Daily vs Real Daily (+ Negative Rework Bars) */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                  Produtividade Diária: Real vs Ideal (m²/dia)
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  A linha âmbar mostra a produtividade ideal diária recalculada pelo saldo faltante ÷ dias restantes. Barras vermelhas abaixo de zero indicam retrabalho.
                </p>
              </div>
              <div className="text-xs font-mono text-slate-600 tabular-nums whitespace-nowrap shrink-0">
                Ideal hoje: <strong className="text-amber-700">{formatNumberBR(summary.idealDailyRate)} m²/dia</strong>
              </div>
            </div>

            <div className="h-[300px] w-full" data-testid="productivity-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={productivitySeries}
                  margin={{ top: 10, right: 24, left: 4, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
                    tickLine={false}
                    axisLine={{ stroke: '#CBD5E1' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v} m²`}
                    width={66}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                    }}
                    formatter={(value, name) => {
                      const num = typeof value === 'number' ? value : Number(value ?? 0);
                      return [`${formatNumberBR(num, 1)} m²`, String(name ?? '')];
                    }}
                    labelFormatter={(label) => `Dia ${String(label ?? '')}`}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
                  <Bar
                    dataKey="dailyNet"
                    name="Produtividade Real (Líquida)"
                    maxBarSize={28}
                    radius={[3, 3, 0, 0]}
                  >
                    {productivitySeries.map((pt) => (
                      <Cell
                        key={pt.date}
                        fill={
                          pt.dailyNet < 0
                            ? '#B91C1C'
                            : pt.dailyNet < pt.idealDaily
                              ? '#64748B'
                              : '#1D4ED8'
                        }
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="dailyRework"
                    name="Retrabalho (-m²)"
                    fill="#DC2626"
                    maxBarSize={18}
                    radius={[0, 0, 3, 3]}
                  />
                  <Line
                    type="monotone"
                    dataKey="idealDaily"
                    name="Produtividade Ideal Diária"
                    stroke="#D97706"
                    strokeWidth={2.5}
                    dot={{ r: 2.5, fill: '#D97706' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgRealSoFar"
                    name="Média Real Acumulada"
                    stroke="#0F766E"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Floor-by-Floor & Room Breakdown Matrix */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Avanço por Pavimento e Ambiente
                </h2>
                <p className="text-xs text-slate-500">
                  Clique em um pavimento para detalhar cada ambiente (Executado, Retrabalho e Saldo Faltante).
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('structure')}
                className="text-xs font-medium text-[#1D4ED8] hover:underline self-start sm:self-auto"
              >
                Gerenciar levantamentos
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-3 px-4">Pavimento / Ambiente</th>
                    <th className="py-3 px-3 text-right">Plano Meta</th>
                    <th className="py-3 px-3 text-right">Plano Exec.</th>
                    <th className="py-3 px-3 text-right">Plano Falta</th>
                    <th className="py-3 px-3 text-right">Req. Meta</th>
                    <th className="py-3 px-3 text-right">Req. Exec.</th>
                    <th className="py-3 px-3 text-right">Req. Falta</th>
                    <th className="py-3 px-4 text-right">Conclusão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {floorMetrics.map((fm) => {
                    const isOpen = !!expandedFloorIds[fm.floor.id];
                    const roomsInFloor = roomMetrics.filter(
                      (rm) => rm.room.floorId === fm.floor.id
                    );
                    return (
                      <FragmentFloorRows
                        key={fm.floor.id}
                        fm={fm}
                        rooms={roomsInFloor}
                        isOpen={isOpen}
                        onToggle={() => toggleFloor(fm.floor.id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

interface FragmentFloorRowsProps {
  fm: ReturnType<typeof getFloorMetrics>[number];
  rooms: ReturnType<typeof getRoomMetrics>;
  isOpen: boolean;
  onToggle: () => void;
}

function FragmentFloorRows({
  fm,
  rooms,
  isOpen,
  onToggle,
}: FragmentFloorRowsProps) {
  return (
    <>
      <tr className="hover:bg-slate-50/80 transition-colors">
        <td className="py-3 px-4 font-semibold text-slate-900">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="inline-flex items-center gap-2 text-left hover:text-[#1D4ED8] focus-visible:outline-2 rounded"
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            )}
            <span>{fm.floor.name}</span>
            <span className="text-xs font-normal text-slate-400">
              · {fm.roomCount} amb.
            </span>
          </button>
        </td>
        <td className="py-3 px-3 text-right font-mono text-slate-600">
          {formatNumberBR(fm.plano.targetM2)}
        </td>
        <td className="py-3 px-3 text-right font-mono font-medium text-slate-900">
          {formatNumberBR(fm.plano.netExecutedM2)}
        </td>
        <td className="py-3 px-3 text-right font-mono text-slate-700">
          {formatNumberBR(fm.plano.remainingM2)}
        </td>
        <td className="py-3 px-3 text-right font-mono text-slate-600">
          {formatNumberBR(fm.requadro.targetM2)}
        </td>
        <td className="py-3 px-3 text-right font-mono font-medium text-slate-900">
          {formatNumberBR(fm.requadro.netExecutedM2)}
        </td>
        <td className="py-3 px-3 text-right font-mono text-slate-700">
          {formatNumberBR(fm.requadro.remainingM2)}
        </td>
        <td className="py-3 px-4 text-right">
          <div className="inline-flex items-center gap-2.5 justify-end">
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
              <div
                className="h-full bg-[#1D4ED8]"
                style={{ width: `${fm.total.percentComplete}%` }}
              />
            </div>
            <span className="font-mono font-semibold text-slate-900 w-11 text-right">
              {formatNumberBR(fm.total.percentComplete, 0)}%
            </span>
          </div>
        </td>
      </tr>

      {isOpen &&
        rooms.map((rm) => (
          <tr key={rm.room.id} className="bg-slate-50/50 text-xs">
            <td className="py-2.5 pl-10 pr-4 text-slate-700">
              <span>{rm.room.name}</span>
              {rm.total.reworkM2 > 0 && (
                <span className="ml-2 text-red-700 font-mono">
                  (Retrabalho -{formatNumberBR(rm.total.reworkM2)} m²)
                </span>
              )}
            </td>
            <td className="py-2.5 px-3 text-right font-mono text-slate-500">
              {formatNumberBR(rm.plano.targetM2)}
            </td>
            <td className="py-2.5 px-3 text-right font-mono text-slate-800">
              {formatNumberBR(rm.plano.netExecutedM2)}
            </td>
            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
              {formatNumberBR(rm.plano.remainingM2)}
            </td>
            <td className="py-2.5 px-3 text-right font-mono text-slate-500">
              {formatNumberBR(rm.requadro.targetM2)}
            </td>
            <td className="py-2.5 px-3 text-right font-mono text-slate-800">
              {formatNumberBR(rm.requadro.netExecutedM2)}
            </td>
            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
              {formatNumberBR(rm.requadro.remainingM2)}
            </td>
            <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-700">
              {formatNumberBR(rm.total.percentComplete, 0)}%
            </td>
          </tr>
        ))}
    </>
  );
}
