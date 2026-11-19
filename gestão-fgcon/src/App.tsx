import { useEffect, useMemo, useState } from 'react';
import { AttendanceView } from './components/AttendanceView';
import { DailyEntryView } from './components/DailyEntryView';
import { DashboardView } from './components/DashboardView';
import { Header } from './components/Header';
import { ReportsView } from './components/ReportsView';
import { Sidebar } from './components/Sidebar';
import { StructureView } from './components/StructureView';
import { createBlankState, createSeedState } from './data/seedData';
import type {
  ActiveTab,
  AppState,
  AttendanceRecord,
  DayMeta,
  ProductionEntry,
  ProjectConfig,
  Room,
  ServiceType,
} from './types/project';
import {
  generateAlerts,
  getReferenceDate,
  getServiceSummary,
} from './utils/calculations';
import { loadState, saveState } from './utils/storage';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getReferenceDate(loadState())
  );

  // Persist to localStorage whenever state updates
  useEffect(() => {
    saveState(state);
  }, [state]);

  const refDate = useMemo(() => getReferenceDate(state), [state]);
  const overallSummary = useMemo(
    () => getServiceSummary(state, 'geral', refDate),
    [state, refDate]
  );
  const activeAlerts = useMemo(
    () => generateAlerts(state, refDate),
    [state, refDate]
  );

  /**
   * Upsert daily production value for (date, roomId, service).
   * - Positive value updates/creates the normal production entry for that day+room+service.
   * - Negative value creates an explicit rework entry (rain/rework adjustment) and clears normal positive if needed.
   * - Zero removes the normal positive entry for that day+room+service.
   */
  const handleUpsertProduction = (
    date: string,
    roomId: string,
    service: ServiceType,
    areaM2: number
  ) => {
    setState((prev) => {
      if (areaM2 < 0) {
        // User typed a negative number directly into the daily field -> store as rework entry
        const withoutExistingNormal = prev.entries.filter(
          (e) =>
            !(
              e.date === date &&
              e.roomId === roomId &&
              e.service === service &&
              !e.isRework &&
              e.areaM2 >= 0
            )
        );
        const reworkEntry: ProductionEntry = {
          id: makeId('rw'),
          date,
          roomId,
          service,
          areaM2: -Math.abs(Math.round(areaM2 * 100) / 100),
          isRework: true,
          reworkReason: 'chuva',
          notes: 'Produtividade negativa lançada na planilha diária',
        };
        return {
          ...prev,
          entries: [...withoutExistingNormal, reworkEntry],
        };
      }

      const filtered = prev.entries.filter(
        (e) =>
          !(
            e.date === date &&
            e.roomId === roomId &&
            e.service === service &&
            !e.isRework &&
            e.areaM2 >= 0
          )
      );

      if (areaM2 === 0) {
        return { ...prev, entries: filtered };
      }

      const newEntry: ProductionEntry = {
        id: makeId('en'),
        date,
        roomId,
        service,
        areaM2: Math.round(areaM2 * 100) / 100,
        isRework: false,
      };

      return {
        ...prev,
        entries: [...filtered, newEntry],
      };
    });
  };

  const handleAddReworkEntry = (entry: Omit<ProductionEntry, 'id'>) => {
    setState((prev) => ({
      ...prev,
      entries: [
        ...prev.entries,
        {
          ...entry,
          id: makeId('rw'),
          areaM2: -Math.abs(Math.round(entry.areaM2 * 100) / 100),
          isRework: true,
        },
      ],
    }));
  };

  const handleDeleteEntry = (entryId: string) => {
    setState((prev) => ({
      ...prev,
      entries: prev.entries.filter((e) => e.id !== entryId),
    }));
  };

  const handleUpdateDayMeta = (meta: DayMeta) => {
    setState((prev) => {
      const others = prev.dayMetas.filter((m) => m.date !== meta.date);
      return { ...prev, dayMetas: [...others, meta] };
    });
  };

  const handleSetRoomHeadcount = (
    date: string,
    roomId: string,
    count: number | null
  ) => {
    setState((prev) => {
      const others = prev.roomHeadcounts.filter(
        (r) => !(r.date === date && r.roomId === roomId)
      );
      if (count === null) {
        return { ...prev, roomHeadcounts: others };
      }
      return {
        ...prev,
        roomHeadcounts: [...others, { date, roomId, count }],
      };
    });
  };

  const handleUpdateProject = (project: ProjectConfig) => {
    setState((prev) => ({ ...prev, project }));
  };

  const handleAddFloor = (name: string, deadline?: string) => {
    setState((prev) => {
      const nextOrder =
        prev.floors.reduce((max, f) => Math.max(max, f.order), 0) + 1;
      return {
        ...prev,
        floors: [
          ...prev.floors,
          { id: makeId('fl'), name, order: nextOrder, deadline },
        ],
      };
    });
  };

  const handleDuplicateFloor = (floorId: string) => {
    setState((prev) => {
      const sourceFloor = prev.floors.find((f) => f.id === floorId);
      if (!sourceFloor) return prev;
      const nextOrder =
        prev.floors.reduce((max, f) => Math.max(max, f.order), 0) + 1;
      const newFloorId = makeId('fl');
      const newFloorName = `${nextOrder}º Pavimento (Cópia)`;

      const copiedRooms: Room[] = prev.rooms
        .filter((r) => r.floorId === floorId)
        .map((r) => ({
          ...r,
          id: makeId('rm'),
          floorId: newFloorId,
        }));

      return {
        ...prev,
        floors: [
          ...prev.floors,
          {
            id: newFloorId,
            name: newFloorName,
            order: nextOrder,
            deadline: sourceFloor.deadline,
          },
        ],
        rooms: [...prev.rooms, ...copiedRooms],
      };
    });
  };

  const handleDeleteFloor = (floorId: string) => {
    setState((prev) => {
      const removedRoomIds = new Set(
        prev.rooms.filter((r) => r.floorId === floorId).map((r) => r.id)
      );
      return {
        ...prev,
        floors: prev.floors.filter((f) => f.id !== floorId),
        rooms: prev.rooms.filter((r) => r.floorId !== floorId),
        entries: prev.entries.filter((e) => !removedRoomIds.has(e.roomId)),
        roomHeadcounts: prev.roomHeadcounts.filter(
          (rh) => !removedRoomIds.has(rh.roomId)
        ),
        attendance: prev.attendance.map((a) =>
          a.roomId && removedRoomIds.has(a.roomId)
            ? { ...a, roomId: undefined }
            : a
        ),
      };
    });
  };

  const handleAddRoom = (room: Omit<Room, 'id'>) => {
    setState((prev) => ({
      ...prev,
      rooms: [...prev.rooms, { ...room, id: makeId('rm') }],
    }));
  };

  const handleUpdateRoom = (updated: Room) => {
    setState((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === updated.id ? updated : r)),
    }));
  };

  const handleDeleteRoom = (roomId: string) => {
    setState((prev) => ({
      ...prev,
      rooms: prev.rooms.filter((r) => r.id !== roomId),
      entries: prev.entries.filter((e) => e.roomId !== roomId),
      roomHeadcounts: prev.roomHeadcounts.filter((rh) => rh.roomId !== roomId),
      attendance: prev.attendance.map((a) =>
        a.roomId === roomId ? { ...a, roomId: undefined } : a
      ),
    }));
  };

  const handleUpsertAttendance = (record: AttendanceRecord) => {
    setState((prev) => {
      const others = prev.attendance.filter(
        (a) => !(a.date === record.date && a.workerId === record.workerId)
      );
      return { ...prev, attendance: [...others, record] };
    });
  };

  const handleMarkAllPresent = (date: string, defaultRoomId?: string) => {
    setState((prev) => {
      const activeWorkers = prev.workers.filter((w) => w.active);
      const existingByWorker = new Map(
        prev.attendance
          .filter((a) => a.date === date)
          .map((a) => [a.workerId, a])
      );
      const others = prev.attendance.filter((a) => a.date !== date);
      const updatedForDay: AttendanceRecord[] = activeWorkers.map((w) => {
        const existing = existingByWorker.get(w.id);
        return {
          date,
          workerId: w.id,
          status: 'presente',
          roomId: existing?.roomId ?? defaultRoomId,
          notes: existing?.notes,
        };
      });
      return { ...prev, attendance: [...others, ...updatedForDay] };
    });
  };

  const handleAddWorker = (name: string, role: string) => {
    setState((prev) => ({
      ...prev,
      workers: [...prev.workers, { id: makeId('wk'), name, role, active: true }],
    }));
  };

  const handleToggleWorkerActive = (workerId: string) => {
    setState((prev) => ({
      ...prev,
      workers: prev.workers.map((w) =>
        w.id === workerId ? { ...w, active: !w.active } : w
      ),
    }));
  };

  const handleDeleteWorker = (workerId: string) => {
    setState((prev) => ({
      ...prev,
      workers: prev.workers.filter((w) => w.id !== workerId),
      attendance: prev.attendance.filter((a) => a.workerId !== workerId),
    }));
  };

  const handleReplaceState = (next: AppState) => {
    setState(next);
    setSelectedDate(getReferenceDate(next));
  };

  const handleResetDemo = () => {
    const demo = createSeedState();
    setState(demo);
    setSelectedDate(getReferenceDate(demo));
  };

  const handleResetBlank = () => {
    const blank = createBlankState();
    setState(blank);
    setSelectedDate(blank.project.startDate);
  };

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A]">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        projectName={state.project.name}
        overallPercent={overallSummary.breakdown.percentComplete}
        remainingM2={overallSummary.breakdown.remainingM2}
        alertCount={activeAlerts.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          activeTab={activeTab}
          projectName={state.project.name}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onQuickLog={() => setActiveTab('daily')}
          onQuickReport={() => setActiveTab('reports')}
        />

        <main className="flex-1 bg-[#cde1cc] px-4 sm:px-6 lg:px-8 py-6 max-w-[1320px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView state={state} onNavigate={setActiveTab} />
          )}

          {activeTab === 'daily' && (
            <DailyEntryView
              state={state}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onUpsertProduction={handleUpsertProduction}
              onAddReworkEntry={handleAddReworkEntry}
              onDeleteEntry={handleDeleteEntry}
              onUpdateDayMeta={handleUpdateDayMeta}
              onSetRoomHeadcount={handleSetRoomHeadcount}
              onReplaceState={handleReplaceState}
              onResetDemo={handleResetDemo}
              onResetBlank={handleResetBlank}
            />
          )}

          {activeTab === 'structure' && (
            <StructureView
              state={state}
              onUpdateProject={handleUpdateProject}
              onAddFloor={handleAddFloor}
              onDuplicateFloor={handleDuplicateFloor}
              onDeleteFloor={handleDeleteFloor}
              onAddRoom={handleAddRoom}
              onUpdateRoom={handleUpdateRoom}
              onDeleteRoom={handleDeleteRoom}
            />
          )}

          {activeTab === 'attendance' && (
            <AttendanceView
              state={state}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onUpsertAttendance={handleUpsertAttendance}
              onMarkAllPresent={handleMarkAllPresent}
              onSetRoomHeadcount={handleSetRoomHeadcount}
              onAddWorker={handleAddWorker}
              onToggleWorkerActive={handleToggleWorkerActive}
              onDeleteWorker={handleDeleteWorker}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              state={state}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}
        </main>
      </div>
    </div>
  );
}
