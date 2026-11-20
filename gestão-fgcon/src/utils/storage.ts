import type { AppState } from '../types/project';
import { createSeedState } from '../data/seedData';
import { REWORK_REASON_LABELS } from '../types/project';

const STORAGE_KEY = 'planaobra_emboco_state_v1';

export function readLocalStorageState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed || !parsed.project || !Array.isArray(parsed.floors) || !Array.isArray(parsed.rooms)) {
      return null;
    }
    return {
      version: parsed.version ?? 1,
      project: parsed.project,
      floors: parsed.floors,
      rooms: parsed.rooms,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      dayMetas: Array.isArray(parsed.dayMetas) ? parsed.dayMetas : [],
      workers: Array.isArray(parsed.workers) ? parsed.workers : [],
      attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
      roomHeadcounts: Array.isArray(parsed.roomHeadcounts) ? parsed.roomHeadcounts : [],
    };
  } catch {
    return null;
  }
}

export function loadState(): AppState {
  return readLocalStorageState() ?? createSeedState();
}

export function saveState(state: AppState): { ok: boolean; bytes: number } {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
    return { ok: true, bytes: new Blob([serialized]).size };
  } catch {
    return { ok: false, bytes: 0 };
  }
}

export function getStorageBytes(state: AppState): number {
  return new Blob([JSON.stringify(state)]).size;
}

export function validateImportedState(raw: string): { ok: true; state: AppState } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.project ||
      typeof parsed.project.name !== 'string' ||
      !Array.isArray(parsed.floors) ||
      !Array.isArray(parsed.rooms) ||
      !Array.isArray(parsed.entries)
    ) {
      return {
        ok: false,
        error: 'Arquivo JSON inválido: estrutura da obra não reconhecida.',
      };
    }

    return {
      ok: true,
      state: {
        version: parsed.version ?? 1,
        project: parsed.project,
        floors: parsed.floors,
        rooms: parsed.rooms,
        entries: parsed.entries,
        dayMetas: Array.isArray(parsed.dayMetas) ? parsed.dayMetas : [],
        workers: Array.isArray(parsed.workers) ? parsed.workers : [],
        attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
        roomHeadcounts: Array.isArray(parsed.roomHeadcounts) ? parsed.roomHeadcounts : [],
      },
    };
  } catch {
    return {
      ok: false,
      error: 'Não foi possível ler o arquivo JSON. Verifique se o formato está correto.',
    };
  }
}

export function downloadJsonBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const slug = state.project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'obra';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planaobra-backup-${slug}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadProductionCsv(state: AppState): void {
  const floorMap = new Map(state.floors.map((f) => [f.id, f.name]));
  const roomMap = new Map(state.rooms.map((r) => [r.id, r]));

  const headers = [
    'Data',
    'Pavimento',
    'Ambiente',
    'Serviço',
    'Área (m²)',
    'Tipo',
    'Motivo Retrabalho',
    'Observações',
  ];

  const rows = [...state.entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const room = roomMap.get(e.roomId);
      const floorName = room ? floorMap.get(room.floorId) ?? '' : '';
      const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
      return [
        e.date,
        floorName,
        room?.name ?? '',
        e.service === 'plano' ? 'Emboço Plano' : 'Requadro',
        signed.toFixed(2).replace('.', ','),
        e.isRework || signed < 0 ? 'Retrabalho' : 'Produção',
        e.reworkReason ? REWORK_REASON_LABELS[e.reworkReason] : '',
        (e.notes ?? '').replace(/"/g, '""'),
      ]
        .map((cell) => `"${cell}"`)
        .join(';');
    });

  const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planaobra-producao-emboco.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
