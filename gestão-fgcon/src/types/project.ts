export type ServiceType = 'plano' | 'requadro';
export type ServiceScope = 'geral' | 'plano' | 'requadro';

export type WeatherCondition =
  | 'ensolarado'
  | 'nublado'
  | 'chuva_leve'
  | 'chuva_forte';

export type ReworkReason =
  | 'chuva'
  | 'desplacamento'
  | 'fissura'
  | 'prumo'
  | 'outro';

export type AttendanceStatus =
  | 'presente'
  | 'meio_periodo'
  | 'falta'
  | 'falta_chuva';

export type WorkWeekMode = 'mon_fri' | 'mon_sat' | 'all_days';

export interface ProjectConfig {
  name: string;
  client: string;
  location: string;
  engineer: string;
  crea: string;
  startDate: string; // YYYY-MM-DD
  planoDeadline: string; // YYYY-MM-DD
  requadroDeadline: string; // YYYY-MM-DD
  workWeekMode: WorkWeekMode;
}

export interface Floor {
  id: string;
  name: string;
  order: number;
  /** Legacy manual fallback; when rooms have goals, floor completion is derived automatically */
  deadline?: string;
}

export interface Room {
  id: string;
  floorId: string;
  name: string;
  targetPlanoM2: number;
  targetRequadroM2: number;
  /** Target completion date for this room (YYYY-MM-DD) */
  deadline?: string;
  /** Optional daily productivity goal for this room (m²/day) */
  dailyGoalM2?: number;
}

export interface ProductionEntry {
  id: string;
  date: string; // YYYY-MM-DD
  roomId: string;
  service: ServiceType;
  /** Positive m² for execution, negative m² for rework/rain loss */
  areaM2: number;
  isRework: boolean;
  reworkReason?: ReworkReason;
  notes?: string;
}

export interface DayMeta {
  date: string; // YYYY-MM-DD
  weather: WeatherCondition;
  notes: string;
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

export interface AttendanceRecord {
  date: string; // YYYY-MM-DD
  workerId: string;
  status: AttendanceStatus;
  roomId?: string;
  notes?: string;
}

export interface RoomHeadcountOverride {
  date: string; // YYYY-MM-DD
  roomId: string;
  count: number;
}

export interface AppState {
  version: number;
  project: ProjectConfig;
  floors: Floor[];
  rooms: Room[];
  entries: ProductionEntry[];
  dayMetas: DayMeta[];
  workers: Worker[];
  attendance: AttendanceRecord[];
  roomHeadcounts: RoomHeadcountOverride[];
}

export type ActiveTab =
  | 'dashboard'
  | 'daily'
  | 'structure'
  | 'attendance'
  | 'reports';

export const WEATHER_LABELS: Record<WeatherCondition, string> = {
  ensolarado: 'Ensolarado',
  nublado: 'Nublado',
  chuva_leve: 'Chuva Leve',
  chuva_forte: 'Chuva Forte',
};

export const REWORK_REASON_LABELS: Record<ReworkReason, string> = {
  chuva: 'Chuva / Lavagem de Argamassa',
  desplacamento: 'Desplacamento / Falha de Aderência',
  fissura: 'Fissura ou Trinca',
  prumo: 'Correção de Prumo / Esquadro',
  outro: 'Outro Retrabalho',
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  presente: 'Presente',
  meio_periodo: 'Meio Período',
  falta: 'Falta',
  falta_chuva: 'Dispensado (Chuva)',
};

export const WORK_WEEK_LABELS: Record<WorkWeekMode, string> = {
  mon_fri: 'Segunda a Sexta (5 dias/sem)',
  mon_sat: 'Segunda a Sábado (6 dias/sem)',
  all_days: 'Dias Corridos (7 dias/sem)',
};

export const SERVICE_LABELS: Record<ServiceScope, string> = {
  geral: 'Consolidado (Plano + Requadro)',
  plano: 'Emboço Plano',
  requadro: 'Requadro',
};
