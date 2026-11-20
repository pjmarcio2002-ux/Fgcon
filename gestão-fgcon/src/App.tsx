import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { AttendanceView } from './components/AttendanceView';
import { AuthGate } from './components/AuthGate';
import { DailyEntryView } from './components/DailyEntryView';
import { DashboardView } from './components/DashboardView';
import { Header } from './components/Header';
import { ReportsView } from './components/ReportsView';
import { Sidebar } from './components/Sidebar';
import { StructureView } from './components/StructureView';
import { createBlankState, createSeedState } from './data/seedData';
import {
  auth,
  getFriendlyAuthErrorMessage,
  getFriendlyFirestoreErrorMessage,
  signInWithGoogle,
  signOutUser,
} from './firebase';
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
import {
  loadOrMigrateUserWorkspace,
  saveUserWorkspace,
  subscribeUserWorkspace,
} from './utils/firestoreSync';
import { readLocalStorageState } from './utils/storage';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function App() {
  // Firebase Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Firestore-backed workspace state (never shown before authentication)
  const [state, setState] = useState<AppState | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  // UI navigation state
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Refs for ordered Firestore writes and echo-safe real-time sync
  const stateRef = useRef<AppState | null>(null);
  const activeUidRef = useRef<string | null>(null);
  const docExistsRef = useRef(false);
  const writeInFlightRef = useRef(false);
  const pendingStateRef = useRef<AppState | null>(null);
  const lastSavedJsonRef = useRef('');

  // Listen to Firebase Auth session state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthChecked(true);
      if (nextUser) {
        setAuthError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load workspace from Firestore (with one-time localStorage migration) & subscribe to onSnapshot
  useEffect(() => {
    if (!user) {
      activeUidRef.current = null;
      stateRef.current = null;
      pendingStateRef.current = null;
      writeInFlightRef.current = false;
      docExistsRef.current = false;
      lastSavedJsonRef.current = '';
      setState(null);
      setWorkspaceLoading(false);
      setWorkspaceLoadError(null);
      setSaveError(null);
      return;
    }

    const uid = user.uid;
    let cancelled = false;
    let unsubscribeSnapshot: (() => void) | null = null;

    activeUidRef.current = uid;
    docExistsRef.current = false;
    pendingStateRef.current = null;
    writeInFlightRef.current = false;
    setWorkspaceLoading(true);
    setWorkspaceLoadError(null);
    setSaveError(null);

    const bootstrap = async () => {
      try {
        // Read localStorage read-only for one-time migration (never deletes localStorage)
        const localFallback = readLocalStorageState();
        const result = await loadOrMigrateUserWorkspace(uid, localFallback);

        if (cancelled) return;

        docExistsRef.current = true;
        stateRef.current = result.state;
        lastSavedJsonRef.current = JSON.stringify(result.state);
        setState(result.state);
        setSelectedDate(getReferenceDate(result.state));
        setWorkspaceLoading(false);

        // Subscribe to real-time updates across devices
        unsubscribeSnapshot = subscribeUserWorkspace(
          uid,
          (remoteState, hasPendingWrites) => {
            if (cancelled) return;
            if (
              hasPendingWrites ||
              writeInFlightRef.current ||
              pendingStateRef.current !== null
            ) {
              return;
            }
            const serialized = JSON.stringify(remoteState);
            if (serialized === lastSavedJsonRef.current) {
              return;
            }
            lastSavedJsonRef.current = serialized;
            stateRef.current = remoteState;
            setState(remoteState);
          },
          (syncErr) => {
            if (cancelled) return;
            setSaveError(getFriendlyFirestoreErrorMessage(syncErr, 'sync'));
          }
        );
      } catch (err) {
        if (cancelled) return;
        setWorkspaceLoading(false);
        setWorkspaceLoadError(getFriendlyFirestoreErrorMessage(err, 'load'));
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, [user, loadAttempt]);

  // Serialized Firestore save queue so rapid edits never race or get lost
  const flushWriteQueue = useCallback(async (uid: string) => {
    if (writeInFlightRef.current) return;
    writeInFlightRef.current = true;
    let hadError = false;

    try {
      while (pendingStateRef.current !== null && activeUidRef.current === uid) {
        const nextToSave = pendingStateRef.current;
        pendingStateRef.current = null;
        const saved = await saveUserWorkspace(uid, nextToSave, docExistsRef.current);
        docExistsRef.current = true;
        lastSavedJsonRef.current = JSON.stringify(saved);
        setSaveError(null);
      }
    } catch (error) {
      hadError = true;
      if (stateRef.current && activeUidRef.current === uid) {
        pendingStateRef.current = stateRef.current;
      }
      setSaveError(getFriendlyFirestoreErrorMessage(error, 'save'));
    } finally {
      writeInFlightRef.current = false;
      if (!hadError && pendingStateRef.current !== null && activeUidRef.current === uid) {
        void flushWriteQueue(uid);
      }
    }
  }, []);

  const commitState = useCallback(
    (updater: AppState | ((prev: AppState) => AppState)) => {
      const uid = activeUidRef.current;
      const prev = stateRef.current;
      if (!uid || !prev) return;

      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return;

      stateRef.current = next;
      setState(next);

      pendingStateRef.current = next;
      void flushWriteQueue(uid);
    },
    [flushWriteQueue]
  );

  const handleRetrySave = () => {
    const uid = activeUidRef.current;
    if (!uid || !stateRef.current) return;
    setSaveError(null);
    pendingStateRef.current = stateRef.current;
    void flushWriteQueue(uid);
  };

  const handleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(getFriendlyAuthErrorMessage(err));
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setActiveTab('dashboard');
      setMobileMenuOpen(false);
    } catch (err) {
      setSaveError(getFriendlyAuthErrorMessage(err));
    }
  };

  const refDate = useMemo(() => (state ? getReferenceDate(state) : ''), [state]);
  const overallSummary = useMemo(
    () => (state ? getServiceSummary(state, 'geral', refDate) : null),
    [state, refDate]
  );
  const activeAlerts = useMemo(
    () => (state ? generateAlerts(state, refDate) : []),
    [state, refDate]
  );

  // Auth / Loading Gates (zero project data rendered before login)
  if (!authChecked) {
    return <AuthGate mode="checking_auth" onSignIn={handleSignIn} />;
  }

  if (!user) {
    return (
      <AuthGate
        mode="signed_out"
        signingIn={signingIn}
        errorMessage={authError}
        onSignIn={handleSignIn}
      />
    );
  }

  if (workspaceLoading || !state || !overallSummary) {
    return (
      <AuthGate
        mode="loading_workspace"
        userEmail={user.email}
        errorMessage={workspaceLoadError}
        onSignIn={handleSignIn}
        onRetryLoad={() => setLoadAttempt((n) => n + 1)}
        onSignOut={handleSignOut}
      />
    );
  }

  const effectiveSelectedDate = selectedDate || refDate;

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
    commitState((prev) => {
      if (areaM2 < 0) {
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
    commitState((prev) => ({
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
    commitState((prev) => ({
      ...prev,
      entries: prev.entries.filter((e) => e.id !== entryId),
    }));
  };

  const handleUpdateDayMeta = (meta: DayMeta) => {
    commitState((prev) => {
      const others = prev.dayMetas.filter((m) => m.date !== meta.date);
      return { ...prev, dayMetas: [...others, meta] };
    });
  };

  const handleSetRoomHeadcount = (
    date: string,
    roomId: string,
    count: number | null
  ) => {
    commitState((prev) => {
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
    commitState((prev) => ({ ...prev, project }));
  };

  const handleAddFloor = (name: string, deadline?: string) => {
    commitState((prev) => {
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
    commitState((prev) => {
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
          deadline: undefined,
        }));

      return {
        ...prev,
        floors: [
          ...prev.floors,
          {
            id: newFloorId,
            name: newFloorName,
            order: nextOrder,
          },
        ],
        rooms: [...prev.rooms, ...copiedRooms],
      };
    });
  };

  const handleDeleteFloor = (floorId: string) => {
    commitState((prev) => {
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
    commitState((prev) => ({
      ...prev,
      rooms: [...prev.rooms, { ...room, id: makeId('rm') }],
    }));
  };

  const handleUpdateRoom = (updated: Room) => {
    commitState((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === updated.id ? updated : r)),
    }));
  };

  const handleDeleteRoom = (roomId: string) => {
    commitState((prev) => ({
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
    commitState((prev) => {
      const others = prev.attendance.filter(
        (a) => !(a.date === record.date && a.workerId === record.workerId)
      );
      return { ...prev, attendance: [...others, record] };
    });
  };

  const handleMarkAllPresent = (date: string, defaultRoomId?: string) => {
    commitState((prev) => {
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
    commitState((prev) => ({
      ...prev,
      workers: [...prev.workers, { id: makeId('wk'), name, role, active: true }],
    }));
  };

  const handleToggleWorkerActive = (workerId: string) => {
    commitState((prev) => ({
      ...prev,
      workers: prev.workers.map((w) =>
        w.id === workerId ? { ...w, active: !w.active } : w
      ),
    }));
  };

  const handleDeleteWorker = (workerId: string) => {
    commitState((prev) => ({
      ...prev,
      workers: prev.workers.filter((w) => w.id !== workerId),
      attendance: prev.attendance.filter((a) => a.workerId !== workerId),
    }));
  };

  const handleReplaceState = (next: AppState) => {
    commitState(next);
    setSelectedDate(getReferenceDate(next));
  };

  const handleResetDemo = () => {
    const demo = createSeedState();
    commitState(demo);
    setSelectedDate(getReferenceDate(demo));
  };

  const handleResetBlank = () => {
    const blank = createBlankState();
    commitState(blank);
    setSelectedDate(blank.project.startDate);
  };

  const userLabel = user.displayName || user.email;

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
        userLabel={userLabel}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          activeTab={activeTab}
          projectName={state.project.name}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onQuickLog={() => setActiveTab('daily')}
          onQuickReport={() => setActiveTab('reports')}
          onSignOut={handleSignOut}
        />

        <main className="flex-1 bg-[#cde1cc] px-4 sm:px-6 lg:px-8 py-6 max-w-[1320px] w-full mx-auto">
          {saveError && (
            <div
              role="alert"
              className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs sm:text-sm text-red-900"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertCircle
                  className="w-4 h-4 shrink-0 mt-0.5 text-red-700"
                  aria-hidden="true"
                />
                <span className="break-words">{saveError}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={handleRetrySave}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md transition-colors whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Tentar salvar novamente</span>
                </button>
                <button
                  type="button"
                  aria-label="Fechar mensagem de erro"
                  onClick={() => setSaveError(null)}
                  className="p-1.5 text-red-700 hover:bg-red-100 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView state={state} onNavigate={setActiveTab} />
          )}

          {activeTab === 'daily' && (
            <DailyEntryView
              state={state}
              selectedDate={effectiveSelectedDate}
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
              selectedDate={effectiveSelectedDate}
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
              selectedDate={effectiveSelectedDate}
              onSelectDate={setSelectedDate}
            />
          )}
        </main>
      </div>
    </div>
  );
}
