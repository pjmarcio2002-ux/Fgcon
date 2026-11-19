import type { AppState, AttendanceRecord, DayMeta, ProductionEntry } from '../types/project';

/**
 * Deterministic, domain-authentic seed dataset for a Brazilian multi-story
 * residential plastering (emboço plano & requadro) operation.
 *
 * Calibrated around November 2026 (2026-11-02 to 2026-11-19):
 * - Emboço Plano is slightly below ideal daily pace (triggering real alert + delay estimate).
 * - Requadro is tracking close to / slightly ahead of ideal pace.
 * - Includes authentic rain rework events on 2026-11-12 and 2026-11-17.
 */
export function createSeedState(): AppState {
  const floors = [
    { id: 'fl-1', name: '1º Pavimento', order: 1, deadline: '2026-11-20' },
    { id: 'fl-2', name: '2º Pavimento', order: 2, deadline: '2026-11-27' },
    { id: 'fl-3', name: '3º Pavimento', order: 3, deadline: '2026-12-04' },
    { id: 'fl-4', name: '4º Pavimento (Cobertura)', order: 4, deadline: '2026-12-11' },
  ];

  const rooms = [
    // 1º Pavimento (Total Plano: 370 m², Requadro: 112 m²)
    { id: 'rm-101', floorId: 'fl-1', name: 'Sala de Estar / Jantar', targetPlanoM2: 120, targetRequadroM2: 34 },
    { id: 'rm-102', floorId: 'fl-1', name: 'Cozinha e Área de Serviço', targetPlanoM2: 88, targetRequadroM2: 28 },
    { id: 'rm-103', floorId: 'fl-1', name: 'Suíte Master', targetPlanoM2: 92, targetRequadroM2: 26 },
    { id: 'rm-104', floorId: 'fl-1', name: 'Varanda Gourmet', targetPlanoM2: 70, targetRequadroM2: 24 },

    // 2º Pavimento (Total Plano: 380 m², Requadro: 114 m²)
    { id: 'rm-201', floorId: 'fl-2', name: 'Sala de Estar / Jantar', targetPlanoM2: 120, targetRequadroM2: 34 },
    { id: 'rm-202', floorId: 'fl-2', name: 'Cozinha e Área de Serviço', targetPlanoM2: 88, targetRequadroM2: 28 },
    { id: 'rm-203', floorId: 'fl-2', name: 'Suíte Master', targetPlanoM2: 96, targetRequadroM2: 28 },
    { id: 'rm-204', floorId: 'fl-2', name: 'Varanda e Hall Social', targetPlanoM2: 76, targetRequadroM2: 24 },

    // 3º Pavimento (Total Plano: 380 m², Requadro: 114 m²)
    { id: 'rm-301', floorId: 'fl-3', name: 'Sala de Estar / Jantar', targetPlanoM2: 120, targetRequadroM2: 34 },
    { id: 'rm-302', floorId: 'fl-3', name: 'Cozinha e Área de Serviço', targetPlanoM2: 88, targetRequadroM2: 28 },
    { id: 'rm-303', floorId: 'fl-3', name: 'Suíte Master', targetPlanoM2: 96, targetRequadroM2: 28 },
    { id: 'rm-304', floorId: 'fl-3', name: 'Varanda e Circulação', targetPlanoM2: 76, targetRequadroM2: 24 },

    // 4º Pavimento (Total Plano: 310 m², Requadro: 92 m²)
    { id: 'rm-401', floorId: 'fl-4', name: 'Living Panorâmico', targetPlanoM2: 130, targetRequadroM2: 38 },
    { id: 'rm-402', floorId: 'fl-4', name: 'Espaço Gourmet Coberto', targetPlanoM2: 100, targetRequadroM2: 30 },
    { id: 'rm-403', floorId: 'fl-4', name: 'Hall e Casa de Máquinas', targetPlanoM2: 80, targetRequadroM2: 24 },
  ];

  const workers = [
    { id: 'wk-1', name: 'José Carlos Ferreira', role: 'Encarregado de Emboço', active: true },
    { id: 'wk-2', name: 'Antônio Marcos Silva', role: 'Pedreiro de Emboço', active: true },
    { id: 'wk-3', name: 'Raimundo Nonato Souza', role: 'Pedreiro de Emboço', active: true },
    { id: 'wk-4', name: 'Edson Pereira Lima', role: 'Pedreiro de Emboço', active: true },
    { id: 'wk-5', name: 'Valdir Rodrigues Costa', role: 'Pedreiro de Requadro', active: true },
    { id: 'wk-6', name: 'Lucas Henrique Alves', role: 'Pedreiro de Requadro', active: true },
    { id: 'wk-7', name: 'Paulo Roberto Santos', role: 'Servente', active: true },
    { id: 'wk-8', name: 'Gabriel Oliveira Rocha', role: 'Servente', active: true },
  ];

  const entries: ProductionEntry[] = [
    // Semana 1: 02/11 a 06/11 (Foco no 1º Pavimento)
    { id: 'en-01', date: '2026-11-02', roomId: 'rm-101', service: 'plano', areaM2: 46, isRework: false },
    { id: 'en-02', date: '2026-11-02', roomId: 'rm-101', service: 'requadro', areaM2: 16, isRework: false },
    { id: 'en-03', date: '2026-11-03', roomId: 'rm-101', service: 'plano', areaM2: 52, isRework: false },
    { id: 'en-04', date: '2026-11-03', roomId: 'rm-101', service: 'requadro', areaM2: 18, isRework: false },
    { id: 'en-05', date: '2026-11-04', roomId: 'rm-101', service: 'plano', areaM2: 22, isRework: false },
    { id: 'en-06', date: '2026-11-04', roomId: 'rm-102', service: 'plano', areaM2: 38, isRework: false },
    { id: 'en-07', date: '2026-11-04', roomId: 'rm-102', service: 'requadro', areaM2: 18, isRework: false },
    { id: 'en-08', date: '2026-11-05', roomId: 'rm-102', service: 'plano', areaM2: 50, isRework: false },
    { id: 'en-09', date: '2026-11-05', roomId: 'rm-102', service: 'requadro', areaM2: 10, isRework: false },
    { id: 'en-10', date: '2026-11-05', roomId: 'rm-103', service: 'requadro', areaM2: 12, isRework: false },
    { id: 'en-11', date: '2026-11-06', roomId: 'rm-103', service: 'plano', areaM2: 58, isRework: false },
    { id: 'en-12', date: '2026-11-06', roomId: 'rm-103', service: 'requadro', areaM2: 14, isRework: false },

    // Semana 2: 09/11 a 13/11 (Finalizando 1º Pavimento + Início 2º Pavimento + Chuva forte dia 12)
    { id: 'en-13', date: '2026-11-09', roomId: 'rm-103', service: 'plano', areaM2: 34, isRework: false },
    { id: 'en-14', date: '2026-11-09', roomId: 'rm-104', service: 'plano', areaM2: 36, isRework: false },
    { id: 'en-15', date: '2026-11-09', roomId: 'rm-104', service: 'requadro', areaM2: 20, isRework: false },
    { id: 'en-16', date: '2026-11-10', roomId: 'rm-104', service: 'plano', areaM2: 34, isRework: false },
    { id: 'en-17', date: '2026-11-10', roomId: 'rm-201', service: 'plano', areaM2: 32, isRework: false },
    { id: 'en-18', date: '2026-11-10', roomId: 'rm-201', service: 'requadro', areaM2: 18, isRework: false },
    { id: 'en-19', date: '2026-11-11', roomId: 'rm-201', service: 'plano', areaM2: 54, isRework: false },
    { id: 'en-20', date: '2026-11-11', roomId: 'rm-201', service: 'requadro', areaM2: 16, isRework: false },
    // Dia 12/11: Chuva forte à tarde -> produção baixa + retrabalho por lavagem na varanda
    { id: 'en-21', date: '2026-11-12', roomId: 'rm-201', service: 'plano', areaM2: 18, isRework: false },
    {
      id: 'en-22',
      date: '2026-11-12',
      roomId: 'rm-104',
      service: 'plano',
      areaM2: -18.5,
      isRework: true,
      reworkReason: 'chuva',
      notes: 'Chuva com vento lavou faixa superior da varanda antes da pega.',
    },
    {
      id: 'en-23',
      date: '2026-11-12',
      roomId: 'rm-104',
      service: 'requadro',
      areaM2: -4.5,
      isRework: true,
      reworkReason: 'chuva',
      notes: 'Refazer requadro do peitoril afetado pela chuva.',
    },
    { id: 'en-24', date: '2026-11-13', roomId: 'rm-104', service: 'plano', areaM2: 18.5, isRework: false, notes: 'Recomposição concluída.' },
    { id: 'en-25', date: '2026-11-13', roomId: 'rm-104', service: 'requadro', areaM2: 8.5, isRework: false },
    { id: 'en-26', date: '2026-11-13', roomId: 'rm-202', service: 'plano', areaM2: 36, isRework: false },
    { id: 'en-27', date: '2026-11-13', roomId: 'rm-202', service: 'requadro', areaM2: 16, isRework: false },

    // Semana 3: 16/11 a 19/11 (2º e início do 3º Pavimento + chuva leve dia 17)
    { id: 'en-28', date: '2026-11-16', roomId: 'rm-202', service: 'plano', areaM2: 44, isRework: false },
    { id: 'en-29', date: '2026-11-16', roomId: 'rm-202', service: 'requadro', areaM2: 12, isRework: false },
    { id: 'en-30', date: '2026-11-16', roomId: 'rm-203', service: 'requadro', areaM2: 14, isRework: false },
    { id: 'en-31', date: '2026-11-17', roomId: 'rm-203', service: 'plano', areaM2: 42, isRework: false },
    { id: 'en-32', date: '2026-11-17', roomId: 'rm-204', service: 'plano', areaM2: 18, isRework: false },
    {
      id: 'en-33',
      date: '2026-11-17',
      roomId: 'rm-204',
      service: 'plano',
      areaM2: -11,
      isRework: true,
      reworkReason: 'chuva',
      notes: 'Infiltração na platibanda causou escorrimento na varanda do 2º pav.',
    },
    { id: 'en-34', date: '2026-11-17', roomId: 'rm-203', service: 'requadro', areaM2: 14, isRework: false },
    { id: 'en-35', date: '2026-11-18', roomId: 'rm-203', service: 'plano', areaM2: 44, isRework: false },
    { id: 'en-36', date: '2026-11-18', roomId: 'rm-204', service: 'plano', areaM2: 26, isRework: false },
    { id: 'en-37', date: '2026-11-18', roomId: 'rm-204', service: 'requadro', areaM2: 18, isRework: false },
    { id: 'en-38', date: '2026-11-19', roomId: 'rm-204', service: 'plano', areaM2: 24, isRework: false },
    { id: 'en-39', date: '2026-11-19', roomId: 'rm-301', service: 'plano', areaM2: 34, isRework: false },
    { id: 'en-40', date: '2026-11-19', roomId: 'rm-301', service: 'requadro', areaM2: 19, isRework: false },
  ];

  const dayMetas: DayMeta[] = [
    { date: '2026-11-02', weather: 'ensolarado', notes: 'Início das frentes de emboço interno no 1º Pavimento.' },
    { date: '2026-11-03', weather: 'ensolarado', notes: 'Ritmo nominal na Sala de Estar/Jantar.' },
    { date: '2026-11-04', weather: 'nublado', notes: 'Entrega da argamassa estabilizada sem atrasos.' },
    { date: '2026-11-05', weather: 'ensolarado', notes: 'Avanço em Cozinha e início da Suíte Master.' },
    { date: '2026-11-06', weather: 'ensolarado', notes: 'Fechamento semanal dentro do planejado.' },
    { date: '2026-11-09', weather: 'nublado', notes: 'Liberação da Varanda Gourmet após teste de estanqueidade.' },
    { date: '2026-11-10', weather: 'ensolarado', notes: 'Abertura da frente no 2º Pavimento.' },
    { date: '2026-11-11', weather: 'nublado', notes: 'Conferência de taliscas no 2º Pavimento.' },
    { date: '2026-11-12', weather: 'chuva_forte', notes: 'Chuva intensa a partir das 14h30; retrabalho registrado na Varanda do 1º Pav.' },
    { date: '2026-11-13', weather: 'nublado', notes: 'Recomposição da varanda do 1º Pav. e retomada no 2º Pav.' },
    { date: '2026-11-16', weather: 'ensolarado', notes: 'Produção estabilizada nas áreas molhadas do 2º Pav.' },
    { date: '2026-11-17', weather: 'chuva_leve', notes: 'Pancada de chuva no fim da tarde gerou retrabalho parcial na Varanda do 2º Pav.' },
    { date: '2026-11-18', weather: 'ensolarado', notes: 'Avanço consistente na Suíte e Varanda do 2º Pav.' },
    { date: '2026-11-19', weather: 'ensolarado', notes: 'Abertura da frente no 3º Pavimento (Sala de Estar).' },
  ];

  // Attendance logs across the active dates
  const attendance: AttendanceRecord[] = [
    // 2026-11-16
    { date: '2026-11-16', workerId: 'wk-1', status: 'presente', roomId: 'rm-202' },
    { date: '2026-11-16', workerId: 'wk-2', status: 'presente', roomId: 'rm-202' },
    { date: '2026-11-16', workerId: 'wk-3', status: 'presente', roomId: 'rm-202' },
    { date: '2026-11-16', workerId: 'wk-4', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-16', workerId: 'wk-5', status: 'presente', roomId: 'rm-202' },
    { date: '2026-11-16', workerId: 'wk-6', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-16', workerId: 'wk-7', status: 'presente', roomId: 'rm-202' },
    { date: '2026-11-16', workerId: 'wk-8', status: 'falta', notes: 'Atestado odontológico' },

    // 2026-11-17 (rain day)
    { date: '2026-11-17', workerId: 'wk-1', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-17', workerId: 'wk-2', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-17', workerId: 'wk-3', status: 'meio_periodo', roomId: 'rm-204', notes: 'Paralisado pela chuva às 14h' },
    { date: '2026-11-17', workerId: 'wk-4', status: 'meio_periodo', roomId: 'rm-204', notes: 'Paralisado pela chuva às 14h' },
    { date: '2026-11-17', workerId: 'wk-5', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-17', workerId: 'wk-6', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-17', workerId: 'wk-7', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-17', workerId: 'wk-8', status: 'falta_chuva', notes: 'Frente externa suspensa' },

    // 2026-11-18
    { date: '2026-11-18', workerId: 'wk-1', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-18', workerId: 'wk-2', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-18', workerId: 'wk-3', status: 'presente', roomId: 'rm-204' },
    { date: '2026-11-18', workerId: 'wk-4', status: 'presente', roomId: 'rm-204' },
    { date: '2026-11-18', workerId: 'wk-5', status: 'presente', roomId: 'rm-204' },
    { date: '2026-11-18', workerId: 'wk-6', status: 'presente', roomId: 'rm-204' },
    { date: '2026-11-18', workerId: 'wk-7', status: 'presente', roomId: 'rm-203' },
    { date: '2026-11-18', workerId: 'wk-8', status: 'presente', roomId: 'rm-204' },

    // 2026-11-19 (Reference Day)
    { date: '2026-11-19', workerId: 'wk-1', status: 'presente', roomId: 'rm-301' },
    { date: '2026-11-19', workerId: 'wk-2', status: 'presente', roomId: 'rm-301' },
    { date: '2026-11-19', workerId: 'wk-3', status: 'presente', roomId: 'rm-204' },
    { date: '2026-11-19', workerId: 'wk-4', status: 'presente', roomId: 'rm-204' },
    { date: '2026-11-19', workerId: 'wk-5', status: 'presente', roomId: 'rm-301' },
    { date: '2026-11-19', workerId: 'wk-6', status: 'presente', roomId: 'rm-301' },
    { date: '2026-11-19', workerId: 'wk-7', status: 'presente', roomId: 'rm-301' },
    { date: '2026-11-19', workerId: 'wk-8', status: 'falta', notes: 'Ausência não justificada' },
  ];

  // Add baseline attendance for weeks 1 & 2 so monthly attendance reports are rich and realistic
  const earlierDates = [
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
    '2026-11-09',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
  ];
  const earlierRoomMap: Record<string, [string, string]> = {
    '2026-11-02': ['rm-101', 'rm-101'],
    '2026-11-03': ['rm-101', 'rm-101'],
    '2026-11-04': ['rm-101', 'rm-102'],
    '2026-11-05': ['rm-102', 'rm-103'],
    '2026-11-06': ['rm-103', 'rm-103'],
    '2026-11-09': ['rm-103', 'rm-104'],
    '2026-11-10': ['rm-104', 'rm-201'],
    '2026-11-11': ['rm-201', 'rm-201'],
    '2026-11-12': ['rm-201', 'rm-104'],
    '2026-11-13': ['rm-104', 'rm-202'],
  };

  for (const date of earlierDates) {
    const [rA, rB] = earlierRoomMap[date];
    const isHeavyRain = date === '2026-11-12';
    workers.forEach((w, idx) => {
      let status: AttendanceRecord['status'] = 'presente';
      if (isHeavyRain && (idx === 3 || idx === 7)) {
        status = 'falta_chuva';
      } else if (isHeavyRain && (idx === 2 || idx === 5)) {
        status = 'meio_periodo';
      } else if (date === '2026-11-06' && idx === 6) {
        status = 'falta';
      }
      attendance.push({
        date,
        workerId: w.id,
        status,
        roomId: status === 'presente' || status === 'meio_periodo' ? (idx % 2 === 0 ? rA : rB) : undefined,
      });
    });
  }

  return {
    version: 1,
    project: {
      name: 'Residencial Horizonte — Torre A',
      client: 'Construtora Alvorada Engenharia',
      location: 'São Paulo, SP',
      engineer: 'Eng. Carlos Eduardo Mendes',
      crea: 'CREA-SP 5068921402',
      startDate: '2026-11-02',
      planoDeadline: '2026-12-03',
      requadroDeadline: '2026-12-10',
      workWeekMode: 'mon_fri',
    },
    floors,
    rooms,
    entries,
    dayMetas,
    workers,
    attendance,
    roomHeadcounts: [],
  };
}

export function createBlankState(): AppState {
  return {
    version: 1,
    project: {
      name: 'Nova Obra de Emboço',
      client: '',
      location: '',
      engineer: '',
      crea: '',
      startDate: '2026-11-19',
      planoDeadline: '2026-12-18',
      requadroDeadline: '2026-12-23',
      workWeekMode: 'mon_fri',
    },
    floors: [
      { id: 'fl-init-1', name: '1º Pavimento', order: 1 },
    ],
    rooms: [],
    entries: [],
    dayMetas: [],
    workers: [],
    attendance: [],
    roomHeadcounts: [],
  };
}
