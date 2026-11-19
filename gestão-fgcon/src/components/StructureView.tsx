import { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import type {
  AppState,
  Floor,
  ProjectConfig,
  Room,
  WorkWeekMode,
} from '../types/project';
import { WORK_WEEK_LABELS } from '../types/project';
import { getFloorMetrics, getRoomMetrics } from '../utils/calculations';
import { formatNumberBR } from '../utils/dates';

interface StructureViewProps {
  state: AppState;
  onUpdateProject: (project: ProjectConfig) => void;
  onAddFloor: (name: string, deadline?: string) => void;
  onDuplicateFloor: (floorId: string) => void;
  onDeleteFloor: (floorId: string) => void;
  onAddRoom: (room: Omit<Room, 'id'>) => void;
  onUpdateRoom: (room: Room) => void;
  onDeleteRoom: (roomId: string) => void;
}

export function StructureView({
  state,
  onUpdateProject,
  onAddFloor,
  onDuplicateFloor,
  onDeleteFloor,
  onAddRoom,
  onUpdateRoom,
  onDeleteRoom,
}: StructureViewProps) {
  // Project Config Form State
  const [configDraft, setConfigDraft] = useState<ProjectConfig>(state.project);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Add Floor Form State
  const [newFloorName, setNewFloorName] = useState('');
  const [newFloorDeadline, setNewFloorDeadline] = useState('');
  const [floorError, setFloorError] = useState<string | null>(null);

  // Add Room per-floor draft
  const [addingRoomFloorId, setAddingRoomFloorId] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPlano, setNewRoomPlano] = useState('');
  const [newRoomRequadro, setNewRoomRequadro] = useState('');
  const [roomError, setRoomError] = useState<string | null>(null);

  // Inline Edit Room
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomPlano, setEditRoomPlano] = useState('');
  const [editRoomRequadro, setEditRoomRequadro] = useState('');

  // Confirm floor delete
  const [confirmDeleteFloorId, setConfirmDeleteFloorId] = useState<string | null>(null);

  const floorMetrics = useMemo(() => getFloorMetrics(state), [state]);
  const roomMetrics = useMemo(() => getRoomMetrics(state), [state]);

  const totalPlanoMeta = useMemo(
    () => state.rooms.reduce((s, r) => s + r.targetPlanoM2, 0),
    [state.rooms]
  );
  const totalReqMeta = useMemo(
    () => state.rooms.reduce((s, r) => s + r.targetRequadroM2, 0),
    [state.rooms]
  );

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!configDraft.name.trim()) {
      setConfigError('Informe o nome da obra.');
      return;
    }
    if (!configDraft.startDate || !configDraft.planoDeadline || !configDraft.requadroDeadline) {
      setConfigError('Preencha a data de início e as datas limites de Plano e Requadro.');
      return;
    }
    if (
      configDraft.planoDeadline < configDraft.startDate ||
      configDraft.requadroDeadline < configDraft.startDate
    ) {
      setConfigError('As datas limites devem ser iguais ou posteriores à data de início.');
      return;
    }
    setConfigError(null);
    onUpdateProject(configDraft);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
  };

  const handleCreateFloor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFloorName.trim()) {
      setFloorError('Digite o nome do pavimento (ex.: 5º Pavimento).');
      return;
    }
    setFloorError(null);
    onAddFloor(newFloorName.trim(), newFloorDeadline || undefined);
    setNewFloorName('');
    setNewFloorDeadline('');
  };

  const handleOpenAddRoom = (floorId: string) => {
    setAddingRoomFloorId(floorId);
    setNewRoomName('');
    setNewRoomPlano('');
    setNewRoomRequadro('');
    setRoomError(null);
  };

  const handleCreateRoom = (e: React.FormEvent, floorId: string) => {
    e.preventDefault();
    if (!newRoomName.trim()) {
      setRoomError('Informe o nome do ambiente.');
      return;
    }
    const plano = parseFloat(newRoomPlano.replace(',', '.') || '0');
    const requadro = parseFloat(newRoomRequadro.replace(',', '.') || '0');
    if (Number.isNaN(plano) || Number.isNaN(requadro) || plano < 0 || requadro < 0) {
      setRoomError('Informe valores numéricos válidos (>= 0) para Plano e Requadro.');
      return;
    }
    if (plano === 0 && requadro === 0) {
      setRoomError('Informe ao menos uma metragem (> 0 m²) para Plano ou Requadro.');
      return;
    }
    setRoomError(null);
    onAddRoom({
      floorId,
      name: newRoomName.trim(),
      targetPlanoM2: Math.round(plano * 100) / 100,
      targetRequadroM2: Math.round(requadro * 100) / 100,
    });
    setAddingRoomFloorId(null);
    setNewRoomName('');
    setNewRoomPlano('');
    setNewRoomRequadro('');
  };

  const startEditRoom = (room: Room) => {
    setEditingRoomId(room.id);
    setEditRoomName(room.name);
    setEditRoomPlano(String(room.targetPlanoM2));
    setEditRoomRequadro(String(room.targetRequadroM2));
  };

  const saveEditRoom = (room: Room) => {
    const plano = parseFloat(editRoomPlano.replace(',', '.') || '0');
    const requadro = parseFloat(editRoomRequadro.replace(',', '.') || '0');
    if (!editRoomName.trim() || Number.isNaN(plano) || Number.isNaN(requadro) || plano < 0 || requadro < 0) {
      return;
    }
    onUpdateRoom({
      ...room,
      name: editRoomName.trim(),
      targetPlanoM2: Math.round(plano * 100) / 100,
      targetRequadroM2: Math.round(requadro * 100) / 100,
    });
    setEditingRoomId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Pavimentos, Ambientes e Prazos
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Defina as datas limites dos serviços e cadastre o levantamento de m² por pavimento e ambiente.
          </p>
        </div>

        <div className="text-xs sm:text-sm font-mono text-slate-600 tabular-nums">
          <span>Escopo total: </span>
          <strong className="text-[#1D4ED8]">{formatNumberBR(totalPlanoMeta)} m²</strong> Plano
          <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
          <strong className="text-[#0F766E]">{formatNumberBR(totalReqMeta)} m²</strong> Requadro
        </div>
      </div>

      {/* Project Schedule & Deadlines Configuration */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Dados da Obra e Datas Limites dos Serviços
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          As datas limites definem a Curva S planejada e o cálculo automático da produtividade ideal diária (Faltante ÷ Dias restantes).
        </p>

        <form onSubmit={handleSaveConfig} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="cfg-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nome da Obra
              </label>
              <input
                id="cfg-name"
                type="text"
                value={configDraft.name}
                onChange={(e) => setConfigDraft({ ...configDraft, name: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label htmlFor="cfg-client" className="block text-xs font-medium text-slate-700 mb-1">
                Construtora / Cliente
              </label>
              <input
                id="cfg-client"
                type="text"
                value={configDraft.client}
                onChange={(e) => setConfigDraft({ ...configDraft, client: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label htmlFor="cfg-engineer" className="block text-xs font-medium text-slate-700 mb-1">
                Engenheiro / Responsável
              </label>
              <input
                id="cfg-engineer"
                type="text"
                value={configDraft.engineer}
                onChange={(e) => setConfigDraft({ ...configDraft, engineer: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label htmlFor="cfg-start" className="block text-xs font-medium text-slate-700 mb-1">
                Início do Serviço
              </label>
              <input
                id="cfg-start"
                type="date"
                value={configDraft.startDate}
                onChange={(e) => setConfigDraft({ ...configDraft, startDate: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label htmlFor="cfg-plano-dl" className="block text-xs font-medium text-slate-700 mb-1">
                Data Limite — Emboço Plano
              </label>
              <input
                id="cfg-plano-dl"
                type="date"
                value={configDraft.planoDeadline}
                onChange={(e) => setConfigDraft({ ...configDraft, planoDeadline: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label htmlFor="cfg-req-dl" className="block text-xs font-medium text-slate-700 mb-1">
                Data Limite — Requadro
              </label>
              <input
                id="cfg-req-dl"
                type="date"
                value={configDraft.requadroDeadline}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, requadroDeadline: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label htmlFor="cfg-week" className="block text-xs font-medium text-slate-700 mb-1">
                Calendário de Trabalho
              </label>
              <select
                id="cfg-week"
                value={configDraft.workWeekMode}
                onChange={(e) =>
                  setConfigDraft({
                    ...configDraft,
                    workWeekMode: e.target.value as WorkWeekMode,
                  })
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
              >
                {(Object.keys(WORK_WEEK_LABELS) as WorkWeekMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {WORK_WEEK_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {configError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {configError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap"
            >
              Salvar Prazos e Configurações
            </button>
            {configSaved && (
              <span role="status" className="text-xs font-medium text-emerald-700">
                Configurações salvas e curva recalculada.
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Add New Floor Bar */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Adicionar Novo Pavimento
        </h2>
        <form onSubmit={handleCreateFloor} className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="new-floor-name" className="block text-xs font-medium text-slate-700 mb-1">
              Nome do Pavimento
            </label>
            <input
              id="new-floor-name"
              type="text"
              placeholder="Ex.: 5º Pavimento (Tipo)"
              value={newFloorName}
              onChange={(e) => {
                setNewFloorName(e.target.value);
                setFloorError(null);
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
            />
          </div>
          <div className="sm:w-48">
            <label htmlFor="new-floor-dl" className="block text-xs font-medium text-slate-700 mb-1">
              Meta do Pavimento (opcional)
            </label>
            <input
              id="new-floor-dl"
              type="date"
              value={newFloorDeadline}
              onChange={(e) => setNewFloorDeadline(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Adicionar Pavimento</span>
          </button>
        </form>
        {floorError && (
          <p role="alert" className="mt-2 text-xs font-medium text-red-700">
            {floorError}
          </p>
        )}
      </section>

      {/* Floors List & Rooms Table */}
      <div className="space-y-4">
        {floorMetrics.map((fm) => {
          const floor: Floor = fm.floor;
          const floorRooms = roomMetrics.filter((r) => r.room.floorId === floor.id);
          const isAddingHere = addingRoomFloorId === floor.id;

          return (
            <section
              key={floor.id}
              className="bg-white border border-slate-200 rounded-lg overflow-hidden"
            >
              {/* Floor Header */}
              <div className="px-5 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {floor.name}
                    </h3>
                    <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                    <span className="text-xs font-mono text-slate-600 tabular-nums">
                      Plano {formatNumberBR(fm.plano.targetM2)} m² ({formatNumberBR(fm.plano.percentComplete, 0)}%)
                    </span>
                    <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                    <span className="text-xs font-mono text-slate-600 tabular-nums">
                      Requadro {formatNumberBR(fm.requadro.targetM2)} m² ({formatNumberBR(fm.requadro.percentComplete, 0)}%)
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddRoom(floor.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Novo Ambiente</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDuplicateFloor(floor.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Duplicar Tipo</span>
                  </button>

                  {confirmDeleteFloorId === floor.id ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteFloor(floor.id);
                          setConfirmDeleteFloorId(null);
                        }}
                        className="px-2.5 py-1.5 bg-red-700 text-white rounded font-medium"
                      >
                        Confirmar exclusão
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteFloorId(null)}
                        className="px-2 py-1.5 border border-slate-300 rounded text-slate-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Excluir pavimento ${floor.name}`}
                      onClick={() => setConfirmDeleteFloorId(floor.id)}
                      className="p-1.5 text-slate-400 hover:text-red-700 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Add Room Inline Form */}
              {isAddingHere && (
                <form
                  onSubmit={(e) => handleCreateRoom(e, floor.id)}
                  className="p-4 bg-blue-50/40 border-b border-slate-200 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label htmlFor={`room-name-${floor.id}`} className="block text-xs font-medium text-slate-700 mb-1">
                        Nome do Ambiente
                      </label>
                      <input
                        id={`room-name-${floor.id}`}
                        type="text"
                        placeholder="Ex.: Sala Integrada, Banheiro Social..."
                        value={newRoomName}
                        onChange={(e) => {
                          setNewRoomName(e.target.value);
                          setRoomError(null);
                        }}
                        className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label htmlFor={`room-plano-${floor.id}`} className="block text-xs font-medium text-slate-700 mb-1">
                        Levantamento Plano (m²)
                      </label>
                      <input
                        id={`room-plano-${floor.id}`}
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Ex.: 85"
                        value={newRoomPlano}
                        onChange={(e) => {
                          setNewRoomPlano(e.target.value);
                          setRoomError(null);
                        }}
                        className="w-full px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label htmlFor={`room-req-${floor.id}`} className="block text-xs font-medium text-slate-700 mb-1">
                        Levantamento Requadro (m²)
                      </label>
                      <input
                        id={`room-req-${floor.id}`}
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Ex.: 24"
                        value={newRoomRequadro}
                        onChange={(e) => {
                          setNewRoomRequadro(e.target.value);
                          setRoomError(null);
                        }}
                        className="w-full px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>
                  {roomError && (
                    <p role="alert" className="text-xs font-medium text-red-700">
                      {roomError}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md"
                    >
                      Salvar Ambiente
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingRoomFloorId(null)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {/* Rooms Table */}
              {floorRooms.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Nenhum ambiente neste pavimento. Clique em &ldquo;Novo Ambiente&rdquo; para cadastrar o levantamento de m².
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                        <th className="py-2.5 px-5">Ambiente</th>
                        <th className="py-2.5 px-3 text-right">Plano Meta</th>
                        <th className="py-2.5 px-3 text-right">Plano Exec.</th>
                        <th className="py-2.5 px-3 text-right">Plano Falta</th>
                        <th className="py-2.5 px-3 text-right">Req. Meta</th>
                        <th className="py-2.5 px-3 text-right">Req. Exec.</th>
                        <th className="py-2.5 px-3 text-right">Req. Falta</th>
                        <th className="py-2.5 px-5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {floorRooms.map((rm) => {
                        const isEditing = editingRoomId === rm.room.id;
                        return (
                          <tr key={rm.room.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-5 font-medium text-slate-900">
                              {isEditing ? (
                                <input
                                  type="text"
                                  aria-label="Editar nome do ambiente"
                                  value={editRoomName}
                                  onChange={(e) => setEditRoomName(e.target.value)}
                                  className="px-2 py-1 text-sm border border-slate-300 rounded w-full max-w-[220px]"
                                />
                              ) : (
                                rm.room.name
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  aria-label="Editar meta de Emboço Plano"
                                  value={editRoomPlano}
                                  onChange={(e) => setEditRoomPlano(e.target.value)}
                                  className="w-20 text-right px-2 py-1 text-sm font-mono border border-slate-300 rounded"
                                />
                              ) : (
                                formatNumberBR(rm.plano.targetM2)
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {formatNumberBR(rm.plano.netExecutedM2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                              {formatNumberBR(rm.plano.remainingM2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  aria-label="Editar meta de Requadro"
                                  value={editRoomRequadro}
                                  onChange={(e) => setEditRoomRequadro(e.target.value)}
                                  className="w-20 text-right px-2 py-1 text-sm font-mono border border-slate-300 rounded"
                                />
                              ) : (
                                formatNumberBR(rm.requadro.targetM2)
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {formatNumberBR(rm.requadro.netExecutedM2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                              {formatNumberBR(rm.requadro.remainingM2)}
                            </td>
                            <td className="py-2.5 px-5 text-right whitespace-nowrap">
                              {isEditing ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    aria-label={`Salvar edição de ${rm.room.name}`}
                                    onClick={() => saveEditRoom(rm.room)}
                                    className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Cancelar edição"
                                    onClick={() => setEditingRoomId(null)}
                                    className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    aria-label={`Editar ambiente ${rm.room.name}`}
                                    onClick={() => startEditRoom(rm.room)}
                                    className="p-1.5 text-slate-400 hover:text-slate-900 rounded"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Excluir ambiente ${rm.room.name}`}
                                    onClick={() => onDeleteRoom(rm.room.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-700 rounded"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
