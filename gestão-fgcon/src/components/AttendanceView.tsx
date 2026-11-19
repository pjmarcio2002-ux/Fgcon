import { useMemo, useState } from 'react';
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type {
  AppState,
  AttendanceRecord,
  AttendanceStatus,
  Worker,
} from '../types/project';
import { ATTENDANCE_STATUS_LABELS } from '../types/project';
import {
  getDayAttendanceSummary,
  getMonthAttendanceSummary,
} from '../utils/calculations';
import {
  addDaysIso,
  formatDateBR,
  formatMonthYearBR,
  formatNumberBR,
  formatWeekdayShortBR,
} from '../utils/dates';

interface AttendanceViewProps {
  state: AppState;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onUpsertAttendance: (record: AttendanceRecord) => void;
  onMarkAllPresent: (date: string, defaultRoomId?: string) => void;
  onSetRoomHeadcount: (date: string, roomId: string, count: number | null) => void;
  onAddWorker: (name: string, role: string) => void;
  onToggleWorkerActive: (workerId: string) => void;
  onDeleteWorker: (workerId: string) => void;
}

const DEFAULT_ROLES = [
  'Pedreiro de Emboço',
  'Pedreiro de Requadro',
  'Servente',
  'Encarregado de Emboço',
  'Mestre de Obras',
];

export function AttendanceView({
  state,
  selectedDate,
  onSelectDate,
  onUpsertAttendance,
  onMarkAllPresent,
  onSetRoomHeadcount,
  onAddWorker,
  onToggleWorkerActive,
  onDeleteWorker,
}: AttendanceViewProps) {
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerRole, setNewWorkerRole] = useState(DEFAULT_ROLES[0]);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [showAllRooms, setShowAllRooms] = useState(false);

  const selectedMonth = selectedDate.slice(0, 7);
  const daySummary = useMemo(
    () => getDayAttendanceSummary(state, selectedDate),
    [state, selectedDate]
  );
  const monthSummary = useMemo(
    () => getMonthAttendanceSummary(state, selectedMonth),
    [state, selectedMonth]
  );

  const floorMap = useMemo(
    () => new Map(state.floors.map((f) => [f.id, f])),
    [state.floors]
  );

  const sortedRooms = useMemo(
    () =>
      [...state.rooms].sort((a, b) => {
        const fa = floorMap.get(a.floorId)?.order ?? 999;
        const fb = floorMap.get(b.floorId)?.order ?? 999;
        if (fa !== fb) return fa - fb;
        return a.name.localeCompare(b.name, 'pt-BR');
      }),
    [state.rooms, floorMap]
  );

  const recordMap = useMemo(() => {
    const m = new Map<string, AttendanceRecord>();
    for (const r of state.attendance) {
      if (r.date === selectedDate) {
        m.set(r.workerId, r);
      }
    }
    return m;
  }, [state.attendance, selectedDate]);

  const displayedRooms = useMemo(() => {
    if (showAllRooms) return daySummary.byRoom;
    const active = daySummary.byRoom.filter(
      (r) => r.effectiveHeadcount > 0 || r.totalDayM2 !== 0
    );
    return active.length > 0 ? active : daySummary.byRoom.slice(0, 6);
  }, [daySummary.byRoom, showAllRooms]);

  const handleAddWorkerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim()) {
      setWorkerError('Informe o nome completo do colaborador.');
      return;
    }
    setWorkerError(null);
    onAddWorker(newWorkerName.trim(), newWorkerRole);
    setNewWorkerName('');
  };

  const activeWorkers: Worker[] = state.workers.filter((w) => w.active);

  return (
    <div className="space-y-6">
      {/* Header + Date Controls */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Frequência e Efetivo por Ambiente
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Controle a presença diária da equipe e a quantidade de profissionais em cada ambiente — exibido automaticamente no fim dos relatórios em PDF.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            aria-label="Dia anterior"
            onClick={() => onSelectDate(addDaysIso(selectedDate, -1))}
            className="p-2 border border-slate-300 bg-white rounded-md text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center">
            <label htmlFor="att-date-input" className="sr-only">
              Data da frequência
            </label>
            <input
              id="att-date-input"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) onSelectDate(e.target.value);
              }}
              className="px-3 py-1.5 text-sm font-mono font-medium bg-white border border-slate-300 rounded-md"
            />
          </div>
          <button
            type="button"
            aria-label="Próximo dia"
            onClick={() => onSelectDate(addDaysIso(selectedDate, 1))}
            className="p-2 border border-slate-300 bg-white rounded-md text-slate-700 hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500">Presentes ({formatDateBR(selectedDate)})</span>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {daySummary.presentCount}
            <span className="text-sm font-normal text-slate-400">
              {' '}/ {daySummary.totalActiveWorkers}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Meio período: {daySummary.halfDayCount} · {formatWeekdayShortBR(selectedDate)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500">Ausências e Chuva</span>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {daySummary.absentCount + daySummary.rainAbsentCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {daySummary.absentCount} falta(s) · {daySummary.rainAbsentCount} chuva
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500">Pessoas Alocadas em Ambientes</span>
          <p className="mt-1 font-mono text-2xl font-semibold text-[#1D4ED8] tabular-nums">
            {daySummary.totalAllocatedHeadcount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {daySummary.byRoom.filter((r) => r.effectiveHeadcount > 0).length} frente(s) ativa(s)
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500">Homens-Dia em {formatMonthYearBR(selectedMonth)}</span>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatNumberBR(monthSummary.totalManDays, 1)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {monthSummary.recordedDays} dia(s) com chamada
          </p>
        </div>
      </section>

      {/* Panel 1: Headcount Distribution per Room */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Pessoas por Ambiente — {formatDateBR(selectedDate)}
            </h2>
            <p className="text-xs text-slate-500">
              Calculado automaticamente pelos colaboradores alocados abaixo, ou ajuste manualmente o número de pessoas na frente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAllRooms((v) => !v)}
            className="text-xs font-medium text-[#1D4ED8] hover:underline"
          >
            {showAllRooms
              ? 'Mostrar apenas frentes ativas'
              : `Ver todos os ambientes (${daySummary.byRoom.length})`}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-3 px-4">Pavimento / Ambiente</th>
                <th className="py-3 px-3">Equipe Alocada</th>
                <th className="py-3 px-3 text-center">Nº de Pessoas</th>
                <th className="py-3 px-3 text-right">Produção Dia (m²)</th>
                <th className="py-3 px-4 text-right">Rendimento (m²/pessoa)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedRooms.map((r) => (
                <tr key={r.roomId} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4">
                    <span className="font-medium text-slate-900">{r.roomName}</span>
                    <span className="text-xs text-slate-500 ml-1.5">· {r.floorName}</span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-600">
                    {r.assignedWorkers.length > 0
                      ? r.assignedWorkers.map((w) => w.name.split(' ')[0]).join(', ')
                      : r.manualCount !== null && r.manualCount > 0
                        ? 'Contagem manual informada'
                        : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        aria-label={`Quantidade de pessoas em ${r.roomName}`}
                        value={r.effectiveHeadcount}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          onSetRoomHeadcount(
                            selectedDate,
                            r.roomId,
                            Number.isNaN(v) ? 0 : Math.max(0, v)
                          );
                        }}
                        className="w-16 text-center font-mono text-sm px-2 py-1 bg-white border border-slate-300 rounded-md"
                      />
                      {r.manualCount !== null && (
                        <button
                          type="button"
                          onClick={() => onSetRoomHeadcount(selectedDate, r.roomId, null)}
                          className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                          title="Voltar à contagem automática da chamada nominal"
                        >
                          auto
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                    {formatNumberBR(r.totalDayM2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">
                    {r.effectiveHeadcount > 0
                      ? `${formatNumberBR(r.productivityPerWorker)} m²`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Panel 2: Nominal Attendance Sheet for Selected Day */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Chamada Nominal da Equipe — {formatDateBR(selectedDate)}
            </h2>
            <p className="text-xs text-slate-500">
              Marque a frequência individual e indique em qual ambiente cada colaborador atuou.
            </p>
          </div>
          {activeWorkers.length > 0 && (
            <button
              type="button"
              onClick={() => onMarkAllPresent(selectedDate, sortedRooms[0]?.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
            >
              <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Marcar Todos Presentes</span>
            </button>
          )}
        </div>

        {activeWorkers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Nenhum colaborador cadastrado. Adicione sua equipe abaixo para registrar frequência.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-3 px-4">Colaborador</th>
                  <th className="py-3 px-3">Função</th>
                  <th className="py-3 px-3">Frequência</th>
                  <th className="py-3 px-3">Ambiente Alocado</th>
                  <th className="py-3 px-4">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeWorkers.map((worker) => {
                  const rec = recordMap.get(worker.id);
                  const currentStatus: AttendanceStatus = rec?.status ?? 'presente';
                  const isWorking =
                    currentStatus === 'presente' || currentStatus === 'meio_periodo';

                  return (
                    <tr key={worker.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {worker.name}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                        {worker.role}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          aria-label={`Frequência de ${worker.name}`}
                          value={rec ? rec.status : ''}
                          onChange={(e) => {
                            const status = (e.target.value || 'presente') as AttendanceStatus;
                            onUpsertAttendance({
                              date: selectedDate,
                              workerId: worker.id,
                              status,
                              roomId:
                                status === 'presente' || status === 'meio_periodo'
                                  ? rec?.roomId ?? sortedRooms[0]?.id
                                  : undefined,
                              notes: rec?.notes,
                            });
                          }}
                          className={`px-2.5 py-1.5 text-xs font-medium border rounded-md bg-white ${
                            rec?.status === 'falta'
                              ? 'border-red-300 text-red-800'
                              : rec?.status === 'falta_chuva' || rec?.status === 'meio_periodo'
                                ? 'border-amber-300 text-amber-800'
                                : 'border-slate-300 text-slate-900'
                          }`}
                        >
                          <option value="">Sem registro</option>
                          {(Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[]).map(
                            (st) => (
                              <option key={st} value={st}>
                                {ATTENDANCE_STATUS_LABELS[st]}
                              </option>
                            )
                          )}
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          aria-label={`Ambiente de ${worker.name}`}
                          disabled={!rec || !isWorking}
                          value={rec?.roomId ?? ''}
                          onChange={(e) =>
                            onUpsertAttendance({
                              date: selectedDate,
                              workerId: worker.id,
                              status: rec?.status ?? 'presente',
                              roomId: e.target.value || undefined,
                              notes: rec?.notes,
                            })
                          }
                          className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md disabled:bg-slate-50 disabled:text-slate-400 max-w-[240px]"
                        >
                          <option value="">Não alocado</option>
                          {sortedRooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {floorMap.get(r.floorId)?.name} — {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-4">
                        <input
                          type="text"
                          aria-label={`Observação de frequência para ${worker.name}`}
                          placeholder="Opcional..."
                          value={rec?.notes ?? ''}
                          onChange={(e) =>
                            onUpsertAttendance({
                              date: selectedDate,
                              workerId: worker.id,
                              status: rec?.status ?? 'presente',
                              roomId: rec?.roomId,
                              notes: e.target.value,
                            })
                          }
                          className="w-full min-w-[140px] px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Panel 3: Team Roster & Monthly Attendance Overview */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Add & Manage Team */}
        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Cadastro da Equipe de Emboço
            </h2>
          </div>

          <form onSubmit={handleAddWorkerSubmit} className="mt-4 flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1">
              <label htmlFor="new-worker-name" className="sr-only">
                Nome do colaborador
              </label>
              <input
                id="new-worker-name"
                type="text"
                placeholder="Nome do colaborador"
                value={newWorkerName}
                onChange={(e) => {
                  setNewWorkerName(e.target.value);
                  setWorkerError(null);
                }}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label htmlFor="new-worker-role" className="sr-only">
                Função
              </label>
              <select
                id="new-worker-role"
                value={newWorkerRole}
                onChange={(e) => setNewWorkerRole(e.target.value)}
                className="w-full sm:w-44 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                {DEFAULT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Adicionar</span>
            </button>
          </form>
          {workerError && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-700">
              {workerError}
            </p>
          )}

          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {state.workers.map((w) => (
              <li key={w.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`font-medium truncate ${w.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                    {w.name}
                  </p>
                  <p className="text-xs text-slate-500">{w.role}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleWorkerActive(w.id)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
                  >
                    {w.active ? 'Inativar' : 'Reativar'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover colaborador ${w.name}`}
                    onClick={() => onDeleteWorker(w.id)}
                    className="p-1.5 text-slate-400 hover:text-red-700 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Monthly Attendance Summary */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Consolidado Mensal — {formatMonthYearBR(selectedMonth)}
            </h2>
            <p className="text-xs text-slate-500">
              Resumo pronto para compor a seção final do Relatório Mensal em PDF.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <th className="py-2.5 px-4">Colaborador</th>
                  <th className="py-2.5 px-2 text-center">Pres.</th>
                  <th className="py-2.5 px-2 text-center">1/2</th>
                  <th className="py-2.5 px-2 text-center">Faltas</th>
                  <th className="py-2.5 px-2 text-center">Chuva</th>
                  <th className="py-2.5 px-4 text-right">Freq. %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthSummary.workers.map((w) => (
                  <tr key={w.workerId}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{w.name}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-emerald-700">
                      {w.presentDays}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-amber-700">
                      {w.halfDays}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-red-700">
                      {w.absentDays}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-600">
                      {w.rainAbsentDays}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">
                      {formatNumberBR(w.attendanceRate, 0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
