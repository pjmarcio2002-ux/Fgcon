import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AppState } from '../types/project';
import {
  ATTENDANCE_STATUS_LABELS,
  REWORK_REASON_LABELS,
  WEATHER_LABELS,
} from '../types/project';
import {
  buildTimelineSeries,
  generateAlerts,
  getDayAttendanceSummary,
  getFloorMetrics,
  getMonthAttendanceSummary,
  getMonthProductionSummary,
  getRoomMetrics,
  getServiceSummary,
  getWeeklyProgressData,
} from '../utils/calculations';
import {
  formatDateBR,
  formatMonthYearBR,
  formatNumberBR,
  formatShortDateBR,
  getMonthDateRange,
} from '../utils/dates';
import { exportDailyPdfFile, exportMonthlyPdfFile } from '../utils/pdfReports';

interface ReportsViewProps {
  state: AppState;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

type ReportMode = 'daily' | 'monthly';

export function ReportsView({
  state,
  selectedDate,
  onSelectDate,
}: ReportsViewProps) {
  const [mode, setMode] = useState<ReportMode>('daily');
  const [selectedMonth, setSelectedMonth] = useState<string>(
    selectedDate.slice(0, 7)
  );
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const monthRange = useMemo(
    () => getMonthDateRange(selectedMonth),
    [selectedMonth]
  );

  const monthRefDate = useMemo(() => {
    const dates = state.entries
      .filter((e) => e.date >= monthRange.start && e.date <= monthRange.end)
      .map((e) => e.date)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : monthRange.end;
  }, [state.entries, monthRange]);

  const activeRefDate = mode === 'daily' ? selectedDate : monthRefDate;

  const geral = useMemo(
    () => getServiceSummary(state, 'geral', activeRefDate),
    [state, activeRefDate]
  );
  const plano = useMemo(
    () => getServiceSummary(state, 'plano', activeRefDate),
    [state, activeRefDate]
  );
  const requadro = useMemo(
    () => getServiceSummary(state, 'requadro', activeRefDate),
    [state, activeRefDate]
  );
  const weeklyData = useMemo(
    () => getWeeklyProgressData(state, selectedDate),
    [state, selectedDate]
  );
  const timeline = useMemo(
    () => buildTimelineSeries(state, 'geral', activeRefDate),
    [state, activeRefDate]
  );
  const alerts = useMemo(
    () => generateAlerts(state, activeRefDate),
    [state, activeRefDate]
  );
  const roomMetrics = useMemo(
    () => getRoomMetrics(state, activeRefDate),
    [state, activeRefDate]
  );
  const floorMetrics = useMemo(
    () => getFloorMetrics(state, activeRefDate),
    [state, activeRefDate]
  );
  const dayAttendance = useMemo(
    () => getDayAttendanceSummary(state, selectedDate),
    [state, selectedDate]
  );
  const monthAttendance = useMemo(
    () => getMonthAttendanceSummary(state, selectedMonth),
    [state, selectedMonth]
  );
  const monthProd = useMemo(
    () => getMonthProductionSummary(state, selectedMonth),
    [state, selectedMonth]
  );

  const dayMeta = useMemo(
    () => state.dayMetas.find((m) => m.date === selectedDate),
    [state.dayMetas, selectedDate]
  );

  const dayProductionByRoom = useMemo(() => {
    const map = new Map<string, { plano: number; requadro: number }>();
    for (const e of state.entries) {
      if (e.date !== selectedDate) continue;
      const cur = map.get(e.roomId) ?? { plano: 0, requadro: 0 };
      const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
      if (e.service === 'plano') cur.plano += signed;
      else cur.requadro += signed;
      map.set(e.roomId, cur);
    }
    return map;
  }, [state.entries, selectedDate]);

  const dayTotalNet = useMemo(() => {
    return state.entries
      .filter((e) => e.date === selectedDate)
      .reduce((s, e) => s + (e.isRework ? -Math.abs(e.areaM2) : e.areaM2), 0);
  }, [state.entries, selectedDate]);

  const handleExport = () => {
    if (mode === 'daily') {
      exportDailyPdfFile(state, selectedDate);
      setExportStatus(`Relatório Diário (RDO-Emboco-${selectedDate}.pdf) gerado com sucesso.`);
    } else {
      exportMonthlyPdfFile(state, selectedMonth);
      setExportStatus(
        `Relatório Mensal (Relatorio-Mensal-Emboco-${selectedMonth}.pdf) gerado com sucesso.`
      );
    }
    setTimeout(() => setExportStatus(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Clean Single-Row Toolbar */}
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Central de Relatórios PDF
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Visualize e exporte relatórios diários (com progresso semanal gráfico) ou mensais consolidados em PDF para a gestão da obra.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="tablist"
              aria-label="Tipo de relatório PDF"
              className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'daily'}
                onClick={() => setMode('daily')}
                className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'daily'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Relatório Diário (RDO)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'monthly'}
                onClick={() => setMode('monthly')}
                className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'monthly'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Relatório Mensal
              </button>
            </div>

            {mode === 'daily' ? (
              <div>
                <label htmlFor="report-date-picker" className="sr-only">
                  Data do relatório diário
                </label>
                <input
                  id="report-date-picker"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      onSelectDate(e.target.value);
                      setSelectedMonth(e.target.value.slice(0, 7));
                    }
                  }}
                  className="px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="report-month-picker" className="sr-only">
                  Mês do relatório mensal
                </label>
                <input
                  id="report-month-picker"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    if (e.target.value) setSelectedMonth(e.target.value);
                  }}
                  className="px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-md"
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-4 h-4" aria-hidden="true" />
            <span>
              {mode === 'daily' ? 'Baixar PDF Diário' : 'Baixar PDF Mensal'}
            </span>
          </button>
        </div>
      </div>

      {exportStatus && (
        <div
          role="status"
          className="flex items-center gap-2.5 px-4 py-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{exportStatus}</span>
        </div>
      )}

      {/* Visual Document Preview Sheet */}
      <article
        aria-label="Pré-visualização do relatório em PDF"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        {/* Document Masthead */}
        <div className="bg-slate-900 text-white px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold tracking-tight">PlanaObra</p>
            <p className="text-xs sm:text-sm text-slate-300">
              {mode === 'daily'
                ? 'Relatório Diário de Obra (RDO) — Emboço Plano e Requadro'
                : 'Relatório Mensal Consolidado — Gestão de Emboço'}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="font-mono text-base font-semibold">
              {mode === 'daily'
                ? formatDateBR(selectedDate)
                : formatMonthYearBR(selectedMonth)}
            </p>
            <p className="text-xs text-slate-300">
              {mode === 'daily'
                ? `Clima: ${dayMeta ? WEATHER_LABELS[dayMeta.weather] : 'Ensolarado'}`
                : `${monthProd.activeDaysCount} dia(s) com produção · ${monthProd.rainyDays} dia(s) chuva`}
            </p>
          </div>
        </div>

        {/* Project Metadata Strip */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div>
            <strong className="text-slate-900">{state.project.name}</strong>
            {state.project.client && (
              <>
                <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
                <span>{state.project.client}</span>
              </>
            )}
            {state.project.engineer && (
              <>
                <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
                <span>{state.project.engineer}</span>
              </>
            )}
          </div>
          <div className="font-mono tabular-nums">
            Prazos: Plano {formatDateBR(state.project.planoDeadline)} · Requadro{' '}
            {formatDateBR(state.project.requadroDeadline)}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Executive KPIs Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-6 border-b border-slate-200">
            <div>
              <p className="text-xs text-slate-500">
                {mode === 'daily' ? 'Produção Líquida do Dia' : 'Produção Líquida no Mês'}
              </p>
              <p className="mt-1 font-mono text-xl font-semibold text-[#1D4ED8] tabular-nums">
                {formatNumberBR(mode === 'daily' ? dayTotalNet : monthProd.totalNet)} m²
              </p>
              <p className="mt-0.5 text-xs text-slate-500 font-mono">
                {mode === 'daily'
                  ? `Acumulado: ${formatNumberBR(geral.breakdown.netExecutedM2)} m²`
                  : `Plano ${formatNumberBR(monthProd.planoNet)} · Req. ${formatNumberBR(monthProd.requadroNet)}`}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Avanço Global</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {formatNumberBR(geral.breakdown.percentComplete, 1)}%
              </p>
              <p className="mt-0.5 text-xs text-slate-500 font-mono">
                Faltam {formatNumberBR(geral.breakdown.remainingM2)} m²
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Produtividade Real vs Ideal</p>
              <p
                className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                  geral.averageRealDailyRate < geral.idealDailyRate
                    ? 'text-red-700'
                    : 'text-emerald-700'
                }`}
              >
                {formatNumberBR(geral.averageRealDailyRate)} /{' '}
                {formatNumberBR(geral.idealDailyRate)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">m²/dia útil</p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Previsão de Entrega</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {geral.estimatedCompletionDate
                  ? formatDateBR(geral.estimatedCompletionDate)
                  : '—'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 font-mono">
                {geral.remainingWorkDays} dia(s) úteis restantes
              </p>
            </div>
          </div>

          {/* Active Alert Callout inside Preview */}
          {alerts.length > 0 && (
            <div className="px-4 py-3 bg-amber-50/80 border border-amber-200 rounded-md flex items-start gap-2.5 text-xs sm:text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <span className="font-semibold text-amber-950">{alerts[0].title}: </span>
                <span className="text-slate-700">{alerts[0].message}</span>
              </div>
            </div>
          )}

          {/* Embedded Visual Charts Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {mode === 'daily' ? (
              <div className="border border-slate-200 rounded-md p-4">
                <h2 className="font-display text-sm font-semibold text-slate-900 mb-1">
                  Progresso Semanal (Últimos 7 Dias — m²)
                </h2>
                <p className="text-xs text-slate-500 mb-3">
                  Barras empilhadas de Plano + Requadro, retrabalho negativo e linha da Produtividade Ideal.
                </p>
                <div className="h-[230px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={weeklyData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }} />
                      <Tooltip
                        formatter={(v, name) => [
                          `${formatNumberBR(Number(v ?? 0))} m²`,
                          String(name ?? ''),
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <ReferenceLine y={0} stroke="#475569" />
                      <Bar dataKey="planoNet" stackId="pos" name="Plano" fill="#1D4ED8" maxBarSize={24} />
                      <Bar dataKey="requadroNet" stackId="pos" name="Requadro" fill="#0F766E" maxBarSize={24} />
                      <Bar dataKey="reworkNegative" name="Retrabalho" fill="#B91C1C" maxBarSize={24} />
                      <Line
                        type="monotone"
                        dataKey="idealDaily"
                        name="Ideal/dia"
                        stroke="#D97706"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-md p-4">
                <h2 className="font-display text-sm font-semibold text-slate-900 mb-1">
                  Avanço Físico por Pavimento (%)
                </h2>
                <p className="text-xs text-slate-500 mb-3">
                  Comparativo de conclusão de Emboço Plano e Requadro em cada pavimento.
                </p>
                <div className="h-[230px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={floorMetrics.map((fm) => ({
                        name: fm.floor.name,
                        Plano: Math.round(fm.plano.percentComplete),
                        Requadro: Math.round(fm.requadro.percentComplete),
                      }))}
                      margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#334155' }} />
                      <Tooltip formatter={(v, name) => [`${String(v ?? 0)}%`, String(name ?? '')]} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="Plano" fill="#1D4ED8" barSize={10} />
                      <Bar dataKey="Requadro" fill="#0F766E" barSize={10} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="border border-slate-200 rounded-md p-4">
              <h2 className="font-display text-sm font-semibold text-slate-900 mb-1">
                Curva S Acumulada (Consolidado — m²)
              </h2>
              <p className="text-xs text-slate-500 mb-3">
                Evolução acumulada real frente à curva planejada até o prazo contratual.
              </p>
              <div className="h-[230px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={timeline} margin={{ top: 8, right: 24, left: -4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'JetBrains Mono' }} />
                    <Tooltip
                      formatter={(v, name) => [
                        `${formatNumberBR(Number(v ?? 0))} m²`,
                        String(name ?? ''),
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line type="monotone" dataKey="cumulativePlanned" name="Planejado" stroke="#64748B" strokeDasharray="4 4" dot={false} strokeWidth={1.8} />
                    <Line type="monotone" dataKey="cumulativeReal" name="Real Acum." stroke="#1D4ED8" dot={false} strokeWidth={2.5} />
                    <Line type="monotone" dataKey="cumulativeProjected" name="Projeção" stroke="#D97706" strokeDasharray="3 3" dot={false} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Section 1: Service Summary */}
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
              1. Resumo por Serviço (Plano e Requadro)
            </h3>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2 px-3">Serviço</th>
                    <th className="py-2 px-3 text-right">Meta (m²)</th>
                    <th className="py-2 px-3 text-right">Acumulado (m²)</th>
                    <th className="py-2 px-3 text-right">Faltante (m²)</th>
                    <th className="py-2 px-3 text-right">Real/Dia</th>
                    <th className="py-2 px-3 text-right">Ideal/Dia</th>
                    <th className="py-2 px-3 text-right">Previsão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    { name: 'Emboço Plano', s: plano },
                    { name: 'Requadro', s: requadro },
                  ].map((row) => (
                    <tr key={row.name}>
                      <td className="py-2 px-3 font-medium text-slate-900">{row.name}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatNumberBR(row.s.breakdown.targetM2)}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatNumberBR(row.s.breakdown.netExecutedM2)}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatNumberBR(row.s.breakdown.remainingM2)}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatNumberBR(row.s.averageRealDailyRate)} m²</td>
                      <td className="py-2 px-3 text-right font-mono text-amber-700">{formatNumberBR(row.s.idealDailyRate)} m²</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {row.s.estimatedCompletionDate ? formatDateBR(row.s.estimatedCompletionDate) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Room Breakdown */}
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
              2. Detalhamento por Pavimento e Ambiente
            </h3>
            {floorMetrics.some((fm) => fm.derivedDeadline) && (
              <p className="mt-2 text-xs text-slate-600 font-mono tabular-nums">
                Término automático por pavimento:{' '}
                {floorMetrics
                  .filter((fm) => fm.derivedDeadline)
                  .map((fm) => `${fm.floor.name} (${formatShortDateBR(fm.derivedDeadline!)})`)
                  .join(' · ')}
              </p>
            )}
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2 px-3">Pavimento / Ambiente</th>
                    {mode === 'daily' && <th className="py-2 px-2.5 text-right">Plano Dia</th>}
                    <th className="py-2 px-2.5 text-right">Plano Acum.</th>
                    <th className="py-2 px-2.5 text-right">Plano Falta</th>
                    {mode === 'daily' && <th className="py-2 px-2.5 text-right">Req. Dia</th>}
                    <th className="py-2 px-2.5 text-right">Req. Acum.</th>
                    <th className="py-2 px-2.5 text-right">Req. Falta</th>
                    <th className="py-2 px-2.5 text-right">Meta Prazo</th>
                    <th className="py-2 px-3 text-right">% Concl.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roomMetrics.map((rm) => {
                    const td = dayProductionByRoom.get(rm.room.id) ?? { plano: 0, requadro: 0 };
                    return (
                      <tr key={rm.room.id}>
                        <td className="py-2 px-3 text-slate-900">
                          <span className="font-medium">{rm.room.name}</span>
                          <span className="text-slate-400 ml-1.5">· {rm.floorName}</span>
                        </td>
                        {mode === 'daily' && (
                          <td className="py-2 px-2.5 text-right font-mono text-[#1D4ED8]">
                            {td.plano !== 0 ? formatNumberBR(td.plano) : '—'}
                          </td>
                        )}
                        <td className="py-2 px-2.5 text-right font-mono">{formatNumberBR(rm.plano.netExecutedM2)}</td>
                        <td className="py-2 px-2.5 text-right font-mono">{formatNumberBR(rm.plano.remainingM2)}</td>
                        {mode === 'daily' && (
                          <td className="py-2 px-2.5 text-right font-mono text-[#0F766E]">
                            {td.requadro !== 0 ? formatNumberBR(td.requadro) : '—'}
                          </td>
                        )}
                        <td className="py-2 px-2.5 text-right font-mono">{formatNumberBR(rm.requadro.netExecutedM2)}</td>
                        <td className="py-2 px-2.5 text-right font-mono">{formatNumberBR(rm.requadro.remainingM2)}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-slate-700">
                          {rm.effectiveDeadline ? formatShortDateBR(rm.effectiveDeadline) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">
                          {formatNumberBR(rm.total.percentComplete, 0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Rework Summary when present */}
          {mode === 'monthly' && monthProd.reworkEntries.length > 0 && (
            <div>
              <h3 className="font-display text-sm font-semibold text-red-900 pb-2 border-b border-red-200">
                3. Retrabalhos Registrados no Mês (-{formatNumberBR(monthProd.totalRework)} m²)
              </h3>
              <ul className="mt-2 divide-y divide-slate-100 text-xs">
                {monthProd.reworkEntries.map((rw) => {
                  const rm = roomMetrics.find((r) => r.room.id === rw.roomId);
                  return (
                    <li key={rw.id} className="py-2 flex items-center justify-between gap-2">
                      <span>
                        <strong className="font-mono">{formatDateBR(rw.date)}</strong> ·{' '}
                        {rm?.floorName} — {rm?.room.name} ({rw.service === 'plano' ? 'Plano' : 'Requadro'}) ·{' '}
                        {rw.reworkReason ? REWORK_REASON_LABELS[rw.reworkReason] : 'Retrabalho'}
                      </span>
                      <span className="font-mono font-semibold text-red-700 shrink-0">
                        -{formatNumberBR(Math.abs(rw.areaM2))} m²
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* FINAL SECTION OF REPORT: Attendance & Headcount per Environment */}
          <div className="pt-2">
            <h3 className="font-display text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
              {mode === 'monthly' && monthProd.reworkEntries.length > 0 ? '4.' : '3.'} Controle de Frequência e Efetivo por Ambiente (Final do Relatório)
            </h3>

            {mode === 'daily' ? (
              <div className="mt-3 space-y-4">
                <p className="text-xs text-slate-600">
                  {dayAttendance.presentCount} presentes · {dayAttendance.halfDayCount} meio período ·{' '}
                  {dayAttendance.absentCount} falta(s) · {dayAttendance.rainAbsentCount} dispensa chuva ·{' '}
                  <strong className="text-slate-900">
                    {dayAttendance.totalAllocatedHeadcount} pessoa(s) alocadas
                  </strong>
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="overflow-x-auto border border-slate-200 rounded-md">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-3">Ambiente</th>
                          <th className="py-2 px-2 text-center">Pessoas</th>
                          <th className="py-2 px-2 text-right">Dia (m²)</th>
                          <th className="py-2 px-3 text-right">m²/Pessoa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dayAttendance.byRoom
                          .filter((r) => r.effectiveHeadcount > 0 || r.totalDayM2 !== 0)
                          .map((r) => (
                            <tr key={r.roomId}>
                              <td className="py-2 px-3 text-slate-900">
                                {r.floorName} — {r.roomName}
                              </td>
                              <td className="py-2 px-2 text-center font-mono font-semibold">
                                {r.effectiveHeadcount}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {formatNumberBR(r.totalDayM2)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono">
                                {r.effectiveHeadcount > 0
                                  ? formatNumberBR(r.productivityPerWorker)
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-md">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-3">Colaborador</th>
                          <th className="py-2 px-2">Frequência</th>
                          <th className="py-2 px-3">Alocação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dayAttendance.records.map((rec) => (
                          <tr key={rec.workerId}>
                            <td className="py-2 px-3 font-medium text-slate-900">
                              {rec.workerName}
                            </td>
                            <td className="py-2 px-2 text-slate-700">
                              {ATTENDANCE_STATUS_LABELS[rec.status]}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{rec.roomLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-3">Colaborador</th>
                      <th className="py-2 px-3">Função</th>
                      <th className="py-2 px-2 text-center">Presenças</th>
                      <th className="py-2 px-2 text-center">Meio Per.</th>
                      <th className="py-2 px-2 text-center">Faltas</th>
                      <th className="py-2 px-2 text-center">Chuva</th>
                      <th className="py-2 px-3 text-right">H/Dia Efet.</th>
                      <th className="py-2 px-3 text-right">Freq. %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthAttendance.workers.map((w) => (
                      <tr key={w.workerId}>
                        <td className="py-2 px-3 font-medium text-slate-900">{w.name}</td>
                        <td className="py-2 px-3 text-slate-600">{w.role}</td>
                        <td className="py-2 px-2 text-center font-mono">{w.presentDays}</td>
                        <td className="py-2 px-2 text-center font-mono">{w.halfDays}</td>
                        <td className="py-2 px-2 text-center font-mono">{w.absentDays}</td>
                        <td className="py-2 px-2 text-center font-mono">{w.rainAbsentDays}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatNumberBR(w.effectiveManDays)}</td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">
                          {formatNumberBR(w.attendanceRate, 0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
