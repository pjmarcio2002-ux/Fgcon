import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AppState,
  DayMeta,
  ProductionEntry,
  ReworkReason,
  ServiceType,
  WeatherCondition,
} from '../types/project';
import { REWORK_REASON_LABELS, WEATHER_LABELS } from '../types/project';
import {
  getDayAttendanceSummary,
  getRoomMetrics,
  getServiceSummary,
} from '../utils/calculations';
import {
  addDaysIso,
  formatDateBR,
  formatNumberBR,
  formatWeekdayShortBR,
} from '../utils/dates';
import {
  downloadJsonBackup,
  downloadProductionCsv,
  getStorageBytes,
  validateImportedState,
} from '../utils/storage';

interface DailyEntryViewProps {
  state: AppState;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onUpsertProduction: (
    date: string,
    roomId: string,
    service: ServiceType,
    areaM2: number
  ) => void;
  onAddReworkEntry: (entry: Omit<ProductionEntry, 'id'>) => void;
  onDeleteEntry: (entryId: string) => void;
  onUpdateDayMeta: (meta: DayMeta) => void;
  onSetRoomHeadcount: (date: string, roomId: string, count: number | null) => void;
  onReplaceState: (next: AppState) => void;
  onResetDemo: () => void;
  onResetBlank: () => void;
}

type DailySubTab = 'sheet' | 'storage';

export function DailyEntryView({
  state,
  selectedDate,
  onSelectDate,
  onUpsertProduction,
  onAddReworkEntry,
  onDeleteEntry,
  onUpdateDayMeta,
  onSetRoomHeadcount,
  onReplaceState,
  onResetDemo,
  onResetBlank,
}: DailyEntryViewProps) {
  const [subTab, setSubTab] = useState<DailySubTab>('sheet');
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({});

  // Rework inline modal/drawer state
  const [reworkRoomId, setReworkRoomId] = useState<string | null>(null);
  const [reworkService, setReworkService] = useState<ServiceType>('plano');
  const [reworkArea, setReworkArea] = useState('');
  const [reworkReason, setReworkReason] = useState<ReworkReason>('chuva');
  const [reworkNotes, setReworkNotes] = useState('');
  const [reworkError, setReworkError] = useState<string | null>(null);

  // Storage feedback & confirmation state
  const [importMessage, setImportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<'demo' | 'blank' | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'rework'>('all');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dayMeta = useMemo<DayMeta>(() => {
    return (
      state.dayMetas.find((m) => m.date === selectedDate) ?? {
        date: selectedDate,
        weather: 'ensolarado',
        notes: '',
      }
    );
  }, [state.dayMetas, selectedDate]);

  const sortedFloors = useMemo(
    () => [...state.floors].sort((a, b) => a.order - b.order),
    [state.floors]
  );

  // Room cumulative metrics strictly BEFORE selectedDate and THROUGH selectedDate
  const prevDate = addDaysIso(selectedDate, -1);
  const metricsBefore = useMemo(() => {
    const list = getRoomMetrics(state, prevDate);
    return new Map(list.map((m) => [m.room.id, m]));
  }, [state, prevDate]);

  const metricsThrough = useMemo(() => {
    const list = getRoomMetrics(state, selectedDate);
    return new Map(list.map((m) => [m.room.id, m]));
  }, [state, selectedDate]);

  const dayAttendance = useMemo(
    () => getDayAttendanceSummary(state, selectedDate),
    [state, selectedDate]
  );

  const attendanceByRoom = useMemo(
    () => new Map(dayAttendance.byRoom.map((r) => [r.roomId, r])),
    [dayAttendance]
  );

  // Sum of positive production entries & rework entries on selectedDate per room/service
  const dayProductionMap = useMemo(() => {
    const map = new Map<
      string,
      {
        planoNormal: number;
        planoRework: number;
        requadroNormal: number;
        requadroRework: number;
      }
    >();

    for (const e of state.entries) {
      if (e.date !== selectedDate) continue;
      const rec = map.get(e.roomId) ?? {
        planoNormal: 0,
        planoRework: 0,
        requadroNormal: 0,
        requadroRework: 0,
      };
      if (e.service === 'plano') {
        if (e.isRework || e.areaM2 < 0) rec.planoRework += Math.abs(e.areaM2);
        else rec.planoNormal += e.areaM2;
      } else {
        if (e.isRework || e.areaM2 < 0) rec.requadroRework += Math.abs(e.areaM2);
        else rec.requadroNormal += e.areaM2;
      }
      map.set(e.roomId, rec);
    }
    return map;
  }, [state.entries, selectedDate]);

  const dayReworkEntries = useMemo(
    () =>
      state.entries.filter(
        (e) => e.date === selectedDate && (e.isRework || e.areaM2 < 0)
      ),
    [state.entries, selectedDate]
  );

  // Day totals vs Ideal Productivity
  const dayTotals = useMemo(() => {
    let planoPos = 0;
    let requadroPos = 0;
    let reworkMag = 0;
    for (const e of state.entries) {
      if (e.date !== selectedDate) continue;
      const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
      if (signed < 0) reworkMag += Math.abs(signed);
      else if (e.service === 'plano') planoPos += signed;
      else requadroPos += signed;
    }
    const netTotal = Math.round((planoPos + requadroPos - reworkMag) * 100) / 100;
    return { planoPos, requadroPos, reworkMag, netTotal };
  }, [state.entries, selectedDate]);

  const geralSummary = useMemo(
    () => getServiceSummary(state, 'geral', selectedDate),
    [state, selectedDate]
  );

  const filteredRooms = useMemo(() => {
    const floorMap = new Map(state.floors.map((f) => [f.id, f]));
    const q = searchQuery.trim().toLowerCase();
    return [...state.rooms]
      .filter((r) => {
        if (floorFilter !== 'all' && r.floorId !== floorFilter) return false;
        if (!q) return true;
        const floorName = floorMap.get(r.floorId)?.name.toLowerCase() ?? '';
        return r.name.toLowerCase().includes(q) || floorName.includes(q);
      })
      .sort((a, b) => {
        const fa = floorMap.get(a.floorId)?.order ?? 999;
        const fb = floorMap.get(b.floorId)?.order ?? 999;
        if (fa !== fb) return fa - fb;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [state.rooms, state.floors, floorFilter, searchQuery]);

  const roomLookup = useMemo(() => {
    const floorMap = new Map(state.floors.map((f) => [f.id, f.name]));
    return new Map(
      state.rooms.map((r) => [
        r.id,
        { roomName: r.name, floorName: floorMap.get(r.floorId) ?? '' },
      ])
    );
  }, [state.rooms, state.floors]);

  const storageBytes = useMemo(() => getStorageBytes(state), [state]);

  const sortedHistory = useMemo(() => {
    return [...state.entries]
      .filter((e) =>
        historyFilter === 'rework' ? e.isRework || e.areaM2 < 0 : true
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.entries, historyFilter]);

  const handleOpenRework = (roomId: string) => {
    setReworkRoomId(roomId);
    setReworkService('plano');
    setReworkArea('');
    setReworkReason('chuva');
    setReworkNotes('');
    setReworkError(null);
  };

  const handleSubmitRework = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!reworkRoomId) return;
    const parsed = parseFloat(reworkArea.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setReworkError('Informe uma metragem positiva (m²) para o retrabalho.');
      return;
    }
    onAddReworkEntry({
      date: selectedDate,
      roomId: reworkRoomId,
      service: reworkService,
      areaM2: -Math.abs(parsed),
      isRework: true,
      reworkReason,
      notes: reworkNotes.trim() || undefined,
    });
    setReworkRoomId(null);
    setReworkError(null);
  };

  const handleFileImport = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = validateImportedState(String(reader.result ?? ''));
      if (result.ok) {
        onReplaceState(result.state);
        setImportMessage({
          type: 'success',
          text: `Backup "${file.name}" restaurado com sucesso (${result.state.entries.length} lançamentos).`,
        });
      } else {
        setImportMessage({ type: 'error', text: result.error });
      }
    };
    reader.readAsText(file);
    ev.target.value = '';
  };

  const belowIdealToday =
    geralSummary.idealDailyRate > 0 &&
    dayTotals.netTotal < geralSummary.idealDailyRate &&
    dayTotals.netTotal !== 0;

  return (
    <div className="space-y-6">
      {/* Header + Sub-tab Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Lançamento Diário e Armazenamento
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Informe diretamente a metragem executada (ou negativa para retrabalho) em cada ambiente; os saldos e a Curva S atualizam na hora.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Modo de lançamento e armazenamento"
          className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 self-start md:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'sheet'}
            onClick={() => setSubTab('sheet')}
            className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'sheet'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Planilha do Dia
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'storage'}
            onClick={() => setSubTab('storage')}
            className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'storage'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Histórico e Backup ({state.entries.length})
          </button>
        </div>
      </div>

      {subTab === 'sheet' ? (
        <>
          {/* Day Toolbar: Date Navigator + Weather + Filters */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Date controls */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label="Dia anterior"
                  onClick={() => onSelectDate(addDaysIso(selectedDate, -1))}
                  className="p-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center">
                  <label htmlFor="daily-date-input" className="sr-only">
                    Data do lançamento
                  </label>
                  <input
                    id="daily-date-input"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setCellDrafts({});
                        onSelectDate(e.target.value);
                      }
                    }}
                    className="px-3 py-1.5 text-sm font-mono font-medium text-slate-900 bg-white border border-slate-300 rounded-md focus:border-[#1D4ED8]"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Próximo dia"
                  onClick={() => onSelectDate(addDaysIso(selectedDate, 1))}
                  className="p-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-slate-500 ml-1">
                  {formatWeekdayShortBR(selectedDate)} · {formatDateBR(selectedDate)}
                </span>
              </div>

              {/* Weather & Floor Filter */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="day-weather" className="text-xs font-medium text-slate-600">
                    Clima:
                  </label>
                  <select
                    id="day-weather"
                    value={dayMeta.weather}
                    onChange={(e) =>
                      onUpdateDayMeta({
                        ...dayMeta,
                        weather: e.target.value as WeatherCondition,
                      })
                    }
                    className="px-2.5 py-1.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900"
                  >
                    {(Object.keys(WEATHER_LABELS) as WeatherCondition[]).map((w) => (
                      <option key={w} value={w}>
                        {WEATHER_LABELS[w]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="floor-filter" className="text-xs font-medium text-slate-600">
                    Pavimento:
                  </label>
                  <select
                    id="floor-filter"
                    value={floorFilter}
                    onChange={(e) => setFloorFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900"
                  >
                    <option value="all">Todos os pavimentos</option>
                    {sortedFloors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <label htmlFor="room-search" className="sr-only">
                    Buscar ambiente
                  </label>
                  <input
                    id="room-search"
                    type="search"
                    placeholder="Buscar ambiente..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 w-44 sm:w-52"
                  />
                </div>
              </div>
            </div>

            {/* Live Day Totals Strip */}
            <div className="pt-3.5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Plano hoje</span>
                <p className="mt-0.5 font-mono text-base font-semibold text-[#1D4ED8] tabular-nums">
                  {formatNumberBR(dayTotals.planoPos)} m²
                </p>
              </div>
              <div>
                <span className="text-slate-500">Requadro hoje</span>
                <p className="mt-0.5 font-mono text-base font-semibold text-[#0F766E] tabular-nums">
                  {formatNumberBR(dayTotals.requadroPos)} m²
                </p>
              </div>
              <div>
                <span className="text-slate-500">Retrabalho hoje</span>
                <p
                  className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                    dayTotals.reworkMag > 0 ? 'text-red-700' : 'text-slate-500'
                  }`}
                >
                  {dayTotals.reworkMag > 0
                    ? `-${formatNumberBR(dayTotals.reworkMag)} m²`
                    : '0,0 m²'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Líquido vs Ideal/dia</span>
                <p
                  className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                    belowIdealToday ? 'text-amber-700' : 'text-slate-900'
                  }`}
                >
                  {formatNumberBR(dayTotals.netTotal)} /{' '}
                  <span className="text-amber-700">
                    {formatNumberBR(geralSummary.idealDailyRate)}
                  </span>{' '}
                  m²
                </p>
              </div>
              <div>
                <span className="text-slate-500">Efetivo alocado</span>
                <p className="mt-0.5 font-mono text-base font-semibold text-slate-900 tabular-nums">
                  {dayAttendance.totalAllocatedHeadcount} pessoa(s)
                </p>
              </div>
            </div>
          </section>

          {/* Explicit Rework Form Panel (rendered prominently above matrix whenever triggered) */}
          {reworkRoomId && (
            <section
              aria-label="Registrar retrabalho ou perda por chuva"
              className="bg-red-50/70 border border-red-200 rounded-lg p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-red-950">
                    Registrar Retrabalho — {roomLookup.get(reworkRoomId)?.floorName} ·{' '}
                    {roomLookup.get(reworkRoomId)?.roomName}
                  </h3>
                  <p className="mt-0.5 text-xs text-red-900/80">
                    A área informada será lançada como produtividade negativa (-m²), devolvendo a metragem ao saldo faltante e recalculando a produtividade ideal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReworkRoomId(null)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
              </div>

              <form
                noValidate
                onSubmit={handleSubmitRework}
                className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
              >
                <div>
                  <label htmlFor="rw-service" className="block text-xs font-medium text-slate-700 mb-1">
                    Serviço afetado
                  </label>
                  <select
                    id="rw-service"
                    value={reworkService}
                    onChange={(e) => setReworkService(e.target.value as ServiceType)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  >
                    <option value="plano">Emboço Plano</option>
                    <option value="requadro">Requadro</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="rw-area" className="block text-xs font-medium text-slate-700 mb-1">
                    Área perdida (m²)
                  </label>
                  <input
                    id="rw-area"
                    type="number"
                    step="any"
                    min="0.1"
                    placeholder="Ex: 12,5"
                    value={reworkArea}
                    onChange={(e) => {
                      setReworkArea(e.target.value);
                      setReworkError(null);
                    }}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label htmlFor="rw-reason" className="block text-xs font-medium text-slate-700 mb-1">
                    Causa do retrabalho
                  </label>
                  <select
                    id="rw-reason"
                    value={reworkReason}
                    onChange={(e) => setReworkReason(e.target.value as ReworkReason)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  >
                    {(Object.keys(REWORK_REASON_LABELS) as ReworkReason[]).map((r) => (
                      <option key={r} value={r}>
                        {REWORK_REASON_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rw-notes" className="block text-xs font-medium text-slate-700 mb-1">
                    Observação (opcional)
                  </label>
                  <input
                    id="rw-notes"
                    type="text"
                    placeholder="Ex: Chuva forte lavou parede"
                    value={reworkNotes}
                    onChange={(e) => setReworkNotes(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-md transition-colors whitespace-nowrap"
                  >
                    Salvar Retrabalho (-m²)
                  </button>
                </div>
              </form>

              {reworkError && (
                <p role="alert" className="mt-2 text-xs font-medium text-red-700">
                  {reworkError}
                </p>
              )}
            </section>
          )}

          {/* Fast Inline Spreadsheet Matrix */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Matriz Rápida de Produção — {formatDateBR(selectedDate)}
              </h2>
              <p className="text-xs text-slate-500">
                Digite a metragem executada (ou valor negativo, ex.: -10) ou use o botão Retrabalho.
              </p>
            </div>

            {filteredRooms.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Nenhum ambiente encontrado com os filtros atuais.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                      <th className="py-3 px-4 min-w-[190px]">Pavimento / Ambiente</th>
                      <th className="py-3 px-2.5 text-right whitespace-nowrap">Plano Meta</th>
                      <th className="py-3 px-2.5 text-right whitespace-nowrap">Plano Hoje (m²)</th>
                      <th className="py-3 px-2.5 text-right whitespace-nowrap">Plano Falta</th>
                      <th className="py-3 px-2.5 text-right whitespace-nowrap">Req. Meta</th>
                      <th className="py-3 px-2.5 text-right whitespace-nowrap">Req. Hoje (m²)</th>
                      <th className="py-3 px-2.5 text-right whitespace-nowrap">Req. Falta</th>
                      <th className="py-3 px-2.5 text-center whitespace-nowrap">Pessoas</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Retrabalho</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRooms.map((room) => {
                      const info = roomLookup.get(room.id);
                      const through = metricsThrough.get(room.id);
                      const before = metricsBefore.get(room.id);
                      const dayVals = dayProductionMap.get(room.id) ?? {
                        planoNormal: 0,
                        planoRework: 0,
                        requadroNormal: 0,
                        requadroRework: 0,
                      };
                      const roomAtt = attendanceByRoom.get(room.id);

                      const planoKey = `${selectedDate}:${room.id}:plano`;
                      const reqKey = `${selectedDate}:${room.id}:requadro`;

                      const planoTodayValue =
                        planoKey in cellDrafts
                          ? cellDrafts[planoKey]
                          : dayVals.planoNormal !== 0
                            ? String(dayVals.planoNormal)
                            : '';
                      const reqTodayValue =
                        reqKey in cellDrafts
                          ? cellDrafts[reqKey]
                          : dayVals.requadroNormal !== 0
                            ? String(dayVals.requadroNormal)
                            : '';

                      const commitCell = (key: string, service: ServiceType, raw: string) => {
                        const normalized = raw.trim().replace(',', '.');
                        setCellDrafts((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                        if (normalized === '' || normalized === '-') {
                          onUpsertProduction(selectedDate, room.id, service, 0);
                          return;
                        }
                        const num = parseFloat(normalized);
                        if (Number.isFinite(num)) {
                          onUpsertProduction(selectedDate, room.id, service, num);
                        }
                      };

                      return (
                        <tr
                          key={room.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-2.5 px-4">
                            <p className="font-medium text-slate-900 leading-tight">
                              {room.name}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {info?.floorName}
                              {(dayVals.planoRework > 0 || dayVals.requadroRework > 0) && (
                                <span className="ml-2 text-red-700 font-mono">
                                  · Retrabalho -{formatNumberBR(dayVals.planoRework + dayVals.requadroRework)} m²
                                </span>
                              )}
                            </p>
                          </td>

                          <td className="py-2.5 px-2.5 text-right font-mono text-xs text-slate-500">
                            <div>{formatNumberBR(room.targetPlanoM2)}</div>
                            <div className="text-[11px] text-slate-400">
                              ant. {formatNumberBR(before?.plano.netExecutedM2 ?? 0)}
                            </div>
                          </td>

                          <td className="py-2.5 px-2.5 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Plano executado em ${room.name} (${info?.floorName})`}
                              placeholder="0,0"
                              value={planoTodayValue}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setCellDrafts((prev) => ({ ...prev, [planoKey]: raw }));
                                const num = parseFloat(raw.trim().replace(',', '.'));
                                if (Number.isFinite(num) && num >= 0 && !raw.trim().endsWith('.') && !raw.trim().endsWith(',')) {
                                  onUpsertProduction(selectedDate, room.id, 'plano', num);
                                } else if (raw.trim() === '') {
                                  onUpsertProduction(selectedDate, room.id, 'plano', 0);
                                }
                              }}
                              onBlur={(e) => commitCell(planoKey, 'plano', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  commitCell(planoKey, 'plano', e.currentTarget.value);
                                }
                              }}
                              className="w-24 text-right font-mono text-sm px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:border-[#1D4ED8] text-slate-900"
                            />
                          </td>

                          <td className="py-2.5 px-2.5 text-right font-mono text-xs font-medium text-slate-800">
                            {formatNumberBR(through?.plano.remainingM2 ?? room.targetPlanoM2)}
                          </td>

                          <td className="py-2.5 px-2.5 text-right font-mono text-xs text-slate-500">
                            <div>{formatNumberBR(room.targetRequadroM2)}</div>
                            <div className="text-[11px] text-slate-400">
                              ant. {formatNumberBR(before?.requadro.netExecutedM2 ?? 0)}
                            </div>
                          </td>

                          <td className="py-2.5 px-2.5 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Requadro executado em ${room.name} (${info?.floorName})`}
                              placeholder="0,0"
                              value={reqTodayValue}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setCellDrafts((prev) => ({ ...prev, [reqKey]: raw }));
                                const num = parseFloat(raw.trim().replace(',', '.'));
                                if (Number.isFinite(num) && num >= 0 && !raw.trim().endsWith('.') && !raw.trim().endsWith(',')) {
                                  onUpsertProduction(selectedDate, room.id, 'requadro', num);
                                } else if (raw.trim() === '') {
                                  onUpsertProduction(selectedDate, room.id, 'requadro', 0);
                                }
                              }}
                              onBlur={(e) => commitCell(reqKey, 'requadro', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  commitCell(reqKey, 'requadro', e.currentTarget.value);
                                }
                              }}
                              className="w-24 text-right font-mono text-sm px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:border-[#0F766E] text-slate-900"
                            />
                          </td>

                          <td className="py-2.5 px-2.5 text-right font-mono text-xs font-medium text-slate-800">
                            {formatNumberBR(
                              through?.requadro.remainingM2 ?? room.targetRequadroM2
                            )}
                          </td>

                          <td className="py-2.5 px-2.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={99}
                              step={1}
                              aria-label={`Número de pessoas em ${room.name} (${info?.floorName})`}
                              value={roomAtt?.effectiveHeadcount ?? 0}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                onSetRoomHeadcount(
                                  selectedDate,
                                  room.id,
                                  Number.isNaN(v) ? 0 : Math.max(0, v)
                                );
                              }}
                              className="w-16 text-center font-mono text-sm px-2 py-1.5 bg-white border border-slate-300 rounded-md focus:border-[#1D4ED8] text-slate-900"
                            />
                          </td>

                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenRework(room.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap"
                            >
                              <CloudRain className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Retrabalho</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Active Day Rework Records List */}
          {dayReworkEntries.length > 0 && (
            <section className="bg-white border border-red-200 rounded-lg p-5">
              <h3 className="font-display text-sm font-semibold text-red-900 mb-3">
                Retrabalhos registrados em {formatDateBR(selectedDate)}
              </h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {dayReworkEntries.map((rw) => {
                  const info = roomLookup.get(rw.roomId);
                  return (
                    <li
                      key={rw.id}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-medium text-slate-900">
                          {info?.floorName} — {info?.roomName}
                        </span>
                        <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
                        <span className="text-xs text-slate-600">
                          {rw.service === 'plano' ? 'Emboço Plano' : 'Requadro'}
                        </span>
                        <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
                        <span className="text-xs text-red-700">
                          {rw.reworkReason ? REWORK_REASON_LABELS[rw.reworkReason] : 'Retrabalho'}
                        </span>
                        {rw.notes && (
                          <p className="text-xs text-slate-500 mt-0.5">{rw.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono font-semibold text-red-700">
                          -{formatNumberBR(Math.abs(rw.areaM2))} m²
                        </span>
                        <button
                          type="button"
                          aria-label={`Remover retrabalho de ${info?.roomName ?? 'ambiente'}`}
                          onClick={() => onDeleteEntry(rw.id)}
                          className="p-1.5 text-slate-400 hover:text-red-700 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Daily Observations for RDO */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <label
              htmlFor="daily-notes-textarea"
              className="block font-display text-sm font-semibold text-slate-900"
            >
              Observações de Campo ({formatDateBR(selectedDate)})
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Anotações sobre abastecimento de argamassa, chuvas ou liberações — incluídas automaticamente no Relatório Diário em PDF.
            </p>
            <textarea
              id="daily-notes-textarea"
              rows={2}
              value={dayMeta.notes}
              onChange={(e) =>
                onUpdateDayMeta({ ...dayMeta, notes: e.target.value })
              }
              placeholder="Ex.: Liberação da frente do 3º pavimento após conferência de prumo..."
              className="mt-2.5 w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:border-[#1D4ED8]"
            />
          </section>
        </>
      ) : (
        /* Storage, Full Ledger History & Backup Tab */
        <div className="space-y-6">
          {/* Backup & Persistence Management Panel */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Armazenamento Local e Backup da Obra
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-600">
                  <span>{state.entries.length} lançamentos salvos</span>
                  <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
                  <span>{state.rooms.length} ambientes</span>
                  <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {(storageBytes / 1024).toFixed(1)} KB ocupados
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => downloadJsonBackup(state)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Exportar Backup JSON</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                >
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  <span>Importar JSON</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileImport}
                  className="hidden"
                  aria-label="Selecionar arquivo JSON de backup"
                />

                <button
                  type="button"
                  onClick={() => downloadProductionCsv(state)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                  <span>Exportar CSV</span>
                </button>
              </div>
            </div>

            {importMessage && (
              <div
                role="status"
                className={`mt-4 px-4 py-2.5 text-xs sm:text-sm rounded-md border ${
                  importMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {importMessage.text}
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Gerenciamento rápido da base de dados local:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {confirmAction === 'demo' ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-700">Substituir pelos dados de exemplo?</span>
                    <button
                      type="button"
                      onClick={() => {
                        onResetDemo();
                        setConfirmAction(null);
                      }}
                      className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction(null)}
                      className="px-2.5 py-1 border border-slate-300 rounded text-slate-600"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmAction('demo')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-md"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Restaurar Exemplo</span>
                  </button>
                )}

                {confirmAction === 'blank' ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-red-700 font-medium">Limpar toda a obra?</span>
                    <button
                      type="button"
                      onClick={() => {
                        onResetBlank();
                        setConfirmAction(null);
                      }}
                      className="px-2.5 py-1 bg-red-700 text-white rounded font-medium"
                    >
                      Limpar Tudo
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction(null)}
                      className="px-2.5 py-1 border border-slate-300 rounded text-slate-600"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmAction('blank')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-md"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Iniciar Obra Limpa</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Complete Chronological Ledger */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Histórico Completo de Lançamentos
              </h2>
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setHistoryFilter('all')}
                  className={`px-3 py-1 text-xs font-medium rounded-md ${
                    historyFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Todos ({state.entries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('rework')}
                  className={`px-3 py-1 text-xs font-medium rounded-md ${
                    historyFilter === 'rework'
                      ? 'bg-white text-red-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Apenas Retrabalhos
                </button>
              </div>
            </div>

            {sortedHistory.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Nenhum lançamento registrado neste filtro.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-3">Pavimento / Ambiente</th>
                      <th className="py-3 px-3">Serviço</th>
                      <th className="py-3 px-3 text-right">Metragem (m²)</th>
                      <th className="py-3 px-3">Classificação / Motivo</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedHistory.map((entry) => {
                      const info = roomLookup.get(entry.roomId);
                      const isNeg = entry.isRework || entry.areaM2 < 0;
                      const signed = isNeg ? -Math.abs(entry.areaM2) : entry.areaM2;
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectDate(entry.date);
                                setSubTab('sheet');
                              }}
                              className="hover:text-[#1D4ED8] hover:underline"
                            >
                              {formatDateBR(entry.date)}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-slate-900">
                            <span className="font-medium">{info?.roomName ?? 'Ambiente'}</span>
                            <span className="text-xs text-slate-500 ml-1.5">
                              · {info?.floorName ?? ''}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-700">
                            {entry.service === 'plano' ? 'Emboço Plano' : 'Requadro'}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-semibold ${
                              isNeg ? 'text-red-700' : 'text-slate-900'
                            }`}
                          >
                            {isNeg ? '-' : '+'}
                            {formatNumberBR(Math.abs(signed))} m²
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">
                            {isNeg
                              ? entry.reworkReason
                                ? REWORK_REASON_LABELS[entry.reworkReason]
                                : 'Retrabalho'
                              : 'Execução normal'}
                            {entry.notes ? ` — ${entry.notes}` : ''}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              aria-label={`Excluir lançamento de ${formatDateBR(entry.date)} em ${info?.roomName ?? ''}`}
                              onClick={() => onDeleteEntry(entry.id)}
                              className="p-1.5 text-slate-400 hover:text-red-700 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
