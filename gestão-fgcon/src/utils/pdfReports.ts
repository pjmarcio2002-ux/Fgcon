import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppState, ServiceScope } from '../types/project';
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
  type FloorMetrics,
  type TimelinePoint,
  type WeeklyBarPoint,
} from './calculations';
import {
  formatDateBR,
  formatMonthYearBR,
  formatNumberBR,
  formatShortDateBR,
  getMonthDateRange,
} from './dates';

const COLORS = {
  ink: [15, 23, 42] as [number, number, number],
  slate: [71, 85, 105] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  blue: [29, 78, 216] as [number, number, number], // Plano / Primary
  teal: [15, 118, 110] as [number, number, number], // Requadro
  amber: [180, 83, 9] as [number, number, number], // Ideal line / Warning
  amberBg: [254, 243, 199] as [number, number, number],
  crimson: [185, 28, 28] as [number, number, number], // Rework / Critical
  crimsonBg: [254, 226, 226] as [number, number, number],
  emerald: [21, 128, 61] as [number, number, number], // On track
  emeraldBg: [220, 252, 231] as [number, number, number],
};

function getLastTableY(doc: jsPDF, fallback: number): number {
  const withTable = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
  return withTable.lastAutoTable?.finalY ?? fallback;
}

function addPageFooters(doc: jsPDF, projectName: string, subtitle: string): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.muted);
    doc.text(`PlanaObra  |  ${projectName}  —  ${subtitle}`, 14, pageHeight - 8);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth - 14,
      pageHeight - 8,
      { align: 'right' }
    );
  }
}

function drawDocumentHeader(
  doc: jsPDF,
  title: string,
  periodLabel: string,
  state: AppState,
  extraMeta?: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top dark architectural strip
  doc.setFillColor(...COLORS.ink);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PlanaObra', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(title, 14, 18.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(periodLabel, pageWidth - 14, 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    extraMeta ?? `Emissão: ${formatDateBR(new Date().toISOString().slice(0, 10))}`,
    pageWidth - 14,
    18.5,
    { align: 'right' }
  );

  // Project identification strip
  doc.setFillColor(...COLORS.surface);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.rect(14, 30, pageWidth - 28, 16, 'FD');

  doc.setTextColor(...COLORS.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(state.project.name || 'Obra de Emboço', 18, 36.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.slate);
  const leftMeta = [
    state.project.client ? `Contratante: ${state.project.client}` : null,
    state.project.location ? `Local: ${state.project.location}` : null,
  ]
    .filter(Boolean)
    .join('   |   ');
  doc.text(leftMeta || 'Acompanhamento de Emboço Plano e Requadro', 18, 42.5);

  const rightMeta = [
    state.project.engineer ? `Resp.: ${state.project.engineer}` : null,
    state.project.crea ? state.project.crea : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (rightMeta) {
    doc.text(rightMeta, pageWidth - 18, 36.5, { align: 'right' });
  }
  doc.text(
    `Prazos: Plano ${formatDateBR(state.project.planoDeadline)}  ·  Requadro ${formatDateBR(state.project.requadroDeadline)}`,
    pageWidth - 18,
    42.5,
    { align: 'right' }
  );

  return 51;
}

function drawSectionHeading(doc: jsPDF, title: string, y: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  if (y > doc.internal.pageSize.getHeight() - 36) {
    doc.addPage();
    y = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.ink);
  doc.text(title, 14, y);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.35);
  doc.line(14, y + 2, pageWidth - 14, y + 2);
  return y + 7;
}

function drawKpiBoxes(
  doc: jsPDF,
  y: number,
  items: { label: string; value: string; sub: string; accent?: [number, number, number] }[]
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 3.5;
  const totalW = pageWidth - 28;
  const boxW = (totalW - gap * (items.length - 1)) / items.length;
  const boxH = 21;

  items.forEach((item, idx) => {
    const x = 14 + idx * (boxW + gap);
    doc.setFillColor(...COLORS.white);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.muted);
    doc.text(item.label, x + 3.5, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...(item.accent ?? COLORS.ink));
    doc.text(item.value, x + 3.5, y + 12.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.slate);
    doc.text(item.sub, x + 3.5, y + 18, { maxWidth: boxW - 7 });
  });

  return y + boxH + 6;
}

/**
 * Crisp vector bar chart for Weekly Progress (last 7 days):
 * Stacked Plano (Blue) + Requadro (Teal), negative Rework (Crimson),
 * and horizontal dashed Ideal Daily Productivity reference line (Amber).
 */
function drawWeeklyProgressChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  data: WeeklyBarPoint[],
  title: string
): void {
  // Container box
  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.ink);
  doc.text(title, x + 4, y + 6);

  // Legend row
  const legendY = y + 10.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.slate);
  const legends: { label: string; color: [number, number, number]; dashed?: boolean }[] = [
    { label: 'Plano', color: COLORS.blue },
    { label: 'Requadro', color: COLORS.teal },
    { label: 'Retrabalho', color: COLORS.crimson },
    { label: 'Ideal/dia', color: COLORS.amber, dashed: true },
  ];
  let lx = x + 4;
  for (const leg of legends) {
    if (leg.dashed) {
      doc.setDrawColor(...leg.color);
      doc.setLineWidth(0.6);
      doc.line(lx, legendY - 1, lx + 4, legendY - 1);
    } else {
      doc.setFillColor(...leg.color);
      doc.rect(lx, legendY - 2.3, 3, 2.3, 'F');
    }
    doc.text(leg.label, lx + 4.5, legendY);
    lx += 4.5 + doc.getTextWidth(leg.label) + 4;
  }

  const plotX = x + 12;
  const plotY = y + 15;
  const plotW = w - 16;
  const plotH = h - 25;

  const maxPos = Math.max(
    10,
    ...data.map((d) => d.planoNet + d.requadroNet),
    ...data.map((d) => d.idealDaily)
  );
  const maxNeg = Math.max(0, ...data.map((d) => d.reworkMagnitude));
  const totalSpan = maxPos + maxNeg * 1.15;
  const zeroY = plotY + (maxPos / totalSpan) * plotH;

  // Grid lines
  doc.setDrawColor(236, 240, 245);
  doc.setLineWidth(0.2);
  const steps = 3;
  for (let i = 0; i <= steps; i++) {
    const val = (maxPos / steps) * i;
    const gy = zeroY - (val / totalSpan) * plotH;
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.muted);
    doc.text(`${Math.round(val)}`, plotX - 2, gy + 1.5, { align: 'right' });
  }

  // Baseline zero axis
  doc.setDrawColor(...COLORS.slate);
  doc.setLineWidth(0.35);
  doc.line(plotX, zeroY, plotX + plotW, zeroY);

  // Bars
  const slotW = plotW / Math.max(1, data.length);
  const barW = Math.min(8.5, slotW * 0.56);

  data.forEach((pt, i) => {
    const cx = plotX + slotW * i + slotW / 2;
    const bx = cx - barW / 2;

    const planoH = (pt.planoNet / totalSpan) * plotH;
    const reqH = (pt.requadroNet / totalSpan) * plotH;
    const rewH = (pt.reworkMagnitude / totalSpan) * plotH;

    if (planoH > 0.3) {
      doc.setFillColor(...COLORS.blue);
      doc.rect(bx, zeroY - planoH, barW, planoH, 'F');
    }
    if (reqH > 0.3) {
      doc.setFillColor(...COLORS.teal);
      doc.rect(bx, zeroY - planoH - reqH, barW, reqH, 'F');
    }
    if (rewH > 0.3) {
      doc.setFillColor(...COLORS.crimson);
      doc.rect(bx, zeroY, barW, rewH, 'F');
    }

    // Net label above bar if nonzero
    const totalPos = pt.planoNet + pt.requadroNet;
    if (totalPos > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(...COLORS.ink);
      doc.text(
        `${Math.round(totalPos)}`,
        cx,
        zeroY - planoH - reqH - 1.2,
        { align: 'center' }
      );
    }
    if (pt.reworkMagnitude > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(...COLORS.crimson);
      doc.text(`-${Math.round(pt.reworkMagnitude)}`, cx, zeroY + rewH + 3, {
        align: 'center',
      });
    }

    // X-axis date labels
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.slate);
    doc.text(pt.label, cx, y + h - 5.2, { align: 'center' });
    doc.setFontSize(5.2);
    doc.setTextColor(...COLORS.muted);
    doc.text(pt.weekday, cx, y + h - 2.1, { align: 'center' });
  });

  // Ideal daily dashed reference line
  const idealVal = data[data.length - 1]?.idealDaily ?? 0;
  if (idealVal > 0) {
    const idealY = zeroY - (idealVal / totalSpan) * plotH;
    doc.setDrawColor(...COLORS.amber);
    doc.setLineWidth(0.55);
    const dashLen = 2.2;
    for (let dx = plotX; dx < plotX + plotW; dx += dashLen * 2) {
      doc.line(dx, idealY, Math.min(dx + dashLen, plotX + plotW), idealY);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(...COLORS.amber);
    doc.text(
      `Ideal ${formatNumberBR(idealVal, 1)}`,
      plotX + plotW - 1,
      Math.max(plotY + 2, idealY - 1.2),
      { align: 'right' }
    );
  }
}

/**
 * Crisp vector S-Curve chart:
 * Planned S-Curve (Slate), Real Cumulative (Blue), Projected Trend (Amber dashed),
 * plus vertical Deadline marker.
 */
function drawSCurveVectorChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  points: TimelinePoint[],
  deadline: string,
  title: string
): void {
  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.ink);
  doc.text(title, x + 4, y + 6);

  // Legend
  const legendY = y + 10.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.slate);
  const legItems = [
    { label: 'Planejado', color: COLORS.muted },
    { label: 'Real Acum.', color: COLORS.blue },
    { label: 'Projeção', color: COLORS.amber },
  ];
  let lx = x + 4;
  for (const item of legItems) {
    doc.setDrawColor(...item.color);
    doc.setLineWidth(0.8);
    doc.line(lx, legendY - 1, lx + 4.5, legendY - 1);
    doc.text(item.label, lx + 5.5, legendY);
    lx += 5.5 + doc.getTextWidth(item.label) + 4;
  }

  const plotX = x + 13;
  const plotY = y + 15;
  const plotW = w - 17;
  const plotH = h - 24;

  if (points.length < 2) {
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.muted);
    doc.text('Sem dados suficientes para Curva S.', x + w / 2, y + h / 2, {
      align: 'center',
    });
    return;
  }

  const maxY = Math.max(
    10,
    ...points.map((p) =>
      Math.max(
        p.cumulativePlanned,
        p.cumulativeReal ?? 0,
        p.cumulativeProjected ?? 0
      )
    )
  );

  const toX = (idx: number) => plotX + (idx / (points.length - 1)) * plotW;
  const toY = (val: number) => plotY + plotH - (val / maxY) * plotH;

  // Grid & Y labels
  doc.setDrawColor(236, 240, 245);
  doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) {
    const val = (maxY / 4) * i;
    const gy = toY(val);
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...COLORS.muted);
    doc.text(`${Math.round(val)}`, plotX - 2, gy + 1.5, { align: 'right' });
  }

  // Deadline vertical marker
  const dlIdx = points.findIndex((p) => p.date === deadline);
  if (dlIdx >= 0) {
    const dx = toX(dlIdx);
    doc.setDrawColor(...COLORS.crimson);
    doc.setLineWidth(0.35);
    for (let dy = plotY; dy < plotY + plotH; dy += 3) {
      doc.line(dx, dy, dx, Math.min(dy + 1.5, plotY + plotH));
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...COLORS.crimson);
    doc.text(`Prazo ${formatShortDateBR(deadline)}`, dx - 1, plotY + 3, {
      align: 'right',
    });
  }

  // 1. Planned S-Curve
  doc.setDrawColor(...COLORS.muted);
  doc.setLineWidth(0.55);
  for (let i = 1; i < points.length; i++) {
    doc.line(
      toX(i - 1),
      toY(points[i - 1].cumulativePlanned),
      toX(i),
      toY(points[i].cumulativePlanned)
    );
  }

  // 2. Projected Curve (Amber dashed segments)
  doc.setDrawColor(...COLORS.amber);
  doc.setLineWidth(0.65);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].cumulativeProjected;
    const b = points[i].cumulativeProjected;
    if (a !== null && b !== null && i % 2 === 1) {
      doc.line(toX(i - 1), toY(a), toX(i), toY(b));
    }
  }

  // 3. Real Cumulative Curve (Primary Blue bold line)
  doc.setDrawColor(...COLORS.blue);
  doc.setLineWidth(1.0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].cumulativeReal;
    const b = points[i].cumulativeReal;
    if (a !== null && b !== null) {
      doc.line(toX(i - 1), toY(a), toX(i), toY(b));
    }
  }

  // X ticks (5 evenly spaced)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(...COLORS.slate);
  const tickCount = Math.min(5, points.length);
  for (let t = 0; t < tickCount; t++) {
    const idx = Math.round((t / (tickCount - 1)) * (points.length - 1));
    doc.text(points[idx].label, toX(idx), y + h - 3, { align: 'center' });
  }
}

/**
 * Horizontal floor completion chart for Monthly PDF.
 */
function drawFloorProgressVectorChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  floors: FloorMetrics[],
  title: string
): void {
  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.ink);
  doc.text(title, x + 4, y + 6);

  // Legend
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setFillColor(...COLORS.blue);
  doc.rect(x + w - 42, y + 3.5, 3, 2.3, 'F');
  doc.setTextColor(...COLORS.slate);
  doc.text('Plano', x + w - 38, y + 5.7);
  doc.setFillColor(...COLORS.teal);
  doc.rect(x + w - 22, y + 3.5, 3, 2.3, 'F');
  doc.text('Requadro', x + w - 18, y + 5.7);

  if (floors.length === 0) return;

  const listTop = y + 12;
  const availH = h - 16;
  const rowH = Math.min(11, availH / floors.length);
  const labelW = 30;
  const barAreaX = x + 4 + labelW;
  const barAreaW = w - labelW - 18;

  floors.slice(0, 6).forEach((fm, idx) => {
    const ry = listTop + idx * rowH;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.ink);
    doc.text(fm.floor.name.slice(0, 18), x + 4, ry + 4);

    // Plano bar
    doc.setFillColor(241, 245, 249);
    doc.rect(barAreaX, ry + 0.5, barAreaW, 2.6, 'F');
    doc.setFillColor(...COLORS.blue);
    doc.rect(
      barAreaX,
      ry + 0.5,
      barAreaW * Math.min(1, fm.plano.percentComplete / 100),
      2.6,
      'F'
    );
    doc.setFontSize(5.5);
    doc.setTextColor(...COLORS.slate);
    doc.text(
      `${Math.round(fm.plano.percentComplete)}%`,
      barAreaX + barAreaW + 2,
      ry + 2.8
    );

    // Requadro bar
    doc.setFillColor(241, 245, 249);
    doc.rect(barAreaX, ry + 4.1, barAreaW, 2.6, 'F');
    doc.setFillColor(...COLORS.teal);
    doc.rect(
      barAreaX,
      ry + 4.1,
      barAreaW * Math.min(1, fm.requadro.percentComplete / 100),
      2.6,
      'F'
    );
    doc.text(
      `${Math.round(fm.requadro.percentComplete)}%`,
      barAreaX + barAreaW + 2,
      ry + 6.4
    );
  });
}

function drawSignaturesBlock(doc: jsPDF, state: AppState, startY: number): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY + 12;
  if (y > pageHeight - 32) {
    doc.addPage();
    y = 30;
  }

  const lineW = 72;
  const leftX = 22;
  const rightX = pageWidth - 22 - lineW;

  doc.setDrawColor(...COLORS.slate);
  doc.setLineWidth(0.35);
  doc.line(leftX, y, leftX + lineW, y);
  doc.line(rightX, y, rightX + lineW, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.ink);
  doc.text(
    state.project.engineer || 'Engenheiro Responsável',
    leftX + lineW / 2,
    y + 4.5,
    { align: 'center' }
  );
  doc.text('Encarregado / Gestão de Obra', rightX + lineW / 2, y + 4.5, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    state.project.crea || 'Responsável Técnico',
    leftX + lineW / 2,
    y + 8.5,
    { align: 'center' }
  );
  doc.text('Conferência de Campo', rightX + lineW / 2, y + 8.5, {
    align: 'center',
  });
}

/**
 * Generate Daily Field Report (RDO — Relatório Diário de Obra) in vector PDF format.
 * Includes KPIs, Alerts, Weekly Visual Bar Chart + S-Curve, Room Breakdown,
 * Rework log, and at the end: Attendance & Headcount per Environment.
 */
export function generateDailyPdf(state: AppState, targetDate: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const dayMeta = state.dayMetas.find((m) => m.date === targetDate);
  const weatherLabel = dayMeta ? WEATHER_LABELS[dayMeta.weather] : 'Ensolarado';

  const geral = getServiceSummary(state, 'geral', targetDate);
  const plano = getServiceSummary(state, 'plano', targetDate);
  const requadro = getServiceSummary(state, 'requadro', targetDate);
  const weeklyData = getWeeklyProgressData(state, targetDate);
  const timeline = buildTimelineSeries(state, 'geral', targetDate);
  const alerts = generateAlerts(state, targetDate);
  const roomMetrics = getRoomMetrics(state, targetDate);
  const dayAttendance = getDayAttendanceSummary(state, targetDate);

  const dayEntries = state.entries.filter((e) => e.date === targetDate);
  const dayPlano = dayEntries
    .filter((e) => e.service === 'plano')
    .reduce((s, e) => s + (e.isRework ? -Math.abs(e.areaM2) : e.areaM2), 0);
  const dayRequadro = dayEntries
    .filter((e) => e.service === 'requadro')
    .reduce((s, e) => s + (e.isRework ? -Math.abs(e.areaM2) : e.areaM2), 0);
  const dayRework = dayEntries
    .filter((e) => e.isRework || e.areaM2 < 0)
    .reduce((s, e) => s + Math.abs(e.areaM2), 0);

  let y = drawDocumentHeader(
    doc,
    'Relatório Diário de Obra (RDO) — Emboço Plano e Requadro',
    formatDateBR(targetDate),
    state,
    `Clima: ${weatherLabel}`
  );

  // Executive KPIs
  const paceColor =
    geral.averageRealDailyRate < geral.idealDailyRate
      ? COLORS.crimson
      : COLORS.emerald;
  y = drawKpiBoxes(doc, y, [
    {
      label: 'Produção Líquida do Dia',
      value: `${formatNumberBR(dayPlano + dayRequadro)} m²`,
      sub: `Plano ${formatNumberBR(dayPlano)} · Req. ${formatNumberBR(dayRequadro)} m²`,
      accent: dayRework > 0 ? COLORS.amber : COLORS.blue,
    },
    {
      label: 'Avanço Acumulado Total',
      value: `${formatNumberBR(geral.breakdown.percentComplete)}%`,
      sub: `${formatNumberBR(geral.breakdown.netExecutedM2)} de ${formatNumberBR(geral.breakdown.targetM2)} m²`,
    },
    {
      label: 'Saldo Faltante',
      value: `${formatNumberBR(geral.breakdown.remainingM2)} m²`,
      sub: `${geral.remainingWorkDays} dias úteis até o prazo`,
    },
    {
      label: 'Ritmo Real vs Ideal',
      value: `${formatNumberBR(geral.averageRealDailyRate)} / ${formatNumberBR(geral.idealDailyRate)}`,
      sub: geral.estimatedCompletionDate
        ? `Prev. entrega: ${formatDateBR(geral.estimatedCompletionDate)}`
        : 'm²/dia (Real vs Ideal)',
      accent: paceColor,
    },
  ]);

  // Alert box if any active productivity / rework alerts
  if (alerts.length > 0) {
    const topAlert = alerts[0];
    const isCrit = topAlert.severity === 'critical';
    doc.setFillColor(...(isCrit ? COLORS.crimsonBg : COLORS.amberBg));
    doc.setDrawColor(...(isCrit ? COLORS.crimson : COLORS.amber));
    doc.setLineWidth(0.35);
    doc.roundedRect(14, y, pageWidth - 28, 12.5, 1.2, 1.2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...(isCrit ? COLORS.crimson : COLORS.amber));
    doc.text(`ALERTA DE PRODUTIVIDADE: ${topAlert.title}`, 17.5, y + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.ink);
    doc.text(topAlert.message, 17.5, y + 9.5, { maxWidth: pageWidth - 35 });
    y += 16.5;
  }

  // Two Side-by-Side Visual Charts (Weekly Progress + S-Curve)
  const chartGap = 4;
  const chartW = (pageWidth - 28 - chartGap) / 2;
  const chartH = 54;
  drawWeeklyProgressChart(
    doc,
    14,
    y,
    chartW,
    chartH,
    weeklyData,
    'Progresso Semanal (Últimos 7 Dias — m²)'
  );
  drawSCurveVectorChart(
    doc,
    14 + chartW + chartGap,
    y,
    chartW,
    chartH,
    timeline,
    geral.deadline,
    'Curva S Acumulada (Consolidado — m²)'
  );
  y += chartH + 7;

  // Service Summary Compact Table (Plano vs Requadro)
  y = drawSectionHeading(doc, '1. Resumo por Serviço e Previsão de Entrega', y);
  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    headStyles: {
      fillColor: COLORS.ink,
      textColor: COLORS.white,
      fontSize: 7.5,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 7.5, textColor: COLORS.ink },
    alternateRowStyles: { fillColor: COLORS.surface },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center' },
    },
    head: [[
      'Serviço',
      'Meta (m²)',
      'Acum. (m²)',
      'Faltante (m²)',
      'Real/Dia',
      'Ideal/Dia',
      'Prazo',
      'Previsão',
    ]],
    body: [
      [
        'Emboço Plano',
        formatNumberBR(plano.breakdown.targetM2),
        formatNumberBR(plano.breakdown.netExecutedM2),
        formatNumberBR(plano.breakdown.remainingM2),
        `${formatNumberBR(plano.averageRealDailyRate)} m²`,
        `${formatNumberBR(plano.idealDailyRate)} m²`,
        formatDateBR(plano.deadline),
        plano.estimatedCompletionDate ? formatDateBR(plano.estimatedCompletionDate) : '—',
      ],
      [
        'Requadro',
        formatNumberBR(requadro.breakdown.targetM2),
        formatNumberBR(requadro.breakdown.netExecutedM2),
        formatNumberBR(requadro.breakdown.remainingM2),
        `${formatNumberBR(requadro.averageRealDailyRate)} m²`,
        `${formatNumberBR(requadro.idealDailyRate)} m²`,
        formatDateBR(requadro.deadline),
        requadro.estimatedCompletionDate ? formatDateBR(requadro.estimatedCompletionDate) : '—',
      ],
      [
        'Total Consolidado',
        formatNumberBR(geral.breakdown.targetM2),
        formatNumberBR(geral.breakdown.netExecutedM2),
        formatNumberBR(geral.breakdown.remainingM2),
        `${formatNumberBR(geral.averageRealDailyRate)} m²`,
        `${formatNumberBR(geral.idealDailyRate)} m²`,
        formatDateBR(geral.deadline),
        geral.estimatedCompletionDate ? formatDateBR(geral.estimatedCompletionDate) : '—',
      ],
    ],
  });
  y = getLastTableY(doc, y + 25) + 7;

  // Room-by-Room Progress Table
  y = drawSectionHeading(doc, '2. Produção por Pavimento e Ambiente (Executado vs Faltante)', y);

  const dailyFloorMetrics = getFloorMetrics(state, targetDate).filter(
    (fm) => fm.derivedDeadline !== null
  );
  if (dailyFloorMetrics.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.slate);
    const floorDatesLine = dailyFloorMetrics
      .map((fm) => `${fm.floor.name}: ${formatDateBR(fm.derivedDeadline!)}`)
      .join('  ·  ');
    doc.text(`Término automático por pavimento — ${floorDatesLine}`, 14, y, {
      maxWidth: pageWidth - 28,
    });
    y += 4.5;
  }

  const dayByRoom = new Map<string, { plano: number; requadro: number }>();
  for (const e of dayEntries) {
    const curr = dayByRoom.get(e.roomId) ?? { plano: 0, requadro: 0 };
    const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
    if (e.service === 'plano') curr.plano += signed;
    else curr.requadro += signed;
    dayByRoom.set(e.roomId, curr);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    headStyles: {
      fillColor: COLORS.ink,
      textColor: COLORS.white,
      fontSize: 7,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 7, textColor: COLORS.ink },
    alternateRowStyles: { fillColor: COLORS.surface },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
    head: [[
      'Pavimento',
      'Ambiente',
      'Plano Dia',
      'Plano Acum.',
      'Plano Falta',
      'Req. Dia',
      'Req. Acum.',
      'Req. Falta',
      '% Geral',
    ]],
    body: roomMetrics.map((rm) => {
      const today = dayByRoom.get(rm.room.id) ?? { plano: 0, requadro: 0 };
      return [
        rm.floorName,
        rm.room.name,
        today.plano !== 0 ? formatNumberBR(today.plano) : '—',
        formatNumberBR(rm.plano.netExecutedM2),
        formatNumberBR(rm.plano.remainingM2),
        today.requadro !== 0 ? formatNumberBR(today.requadro) : '—',
        formatNumberBR(rm.requadro.netExecutedM2),
        formatNumberBR(rm.requadro.remainingM2),
        `${formatNumberBR(rm.total.percentComplete, 0)}%`,
      ];
    }),
  });
  y = getLastTableY(doc, y + 40) + 7;

  // Rework / Notes section if any on that day
  const dayReworks = dayEntries.filter((e) => e.isRework || e.areaM2 < 0);
  if (dayReworks.length > 0 || (dayMeta && dayMeta.notes.trim().length > 0)) {
    y = drawSectionHeading(doc, '3. Ocorrências, Clima e Retrabalhos do Dia', y);
    if (dayMeta && dayMeta.notes.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.slate);
      doc.text(`Observação de Campo (${weatherLabel}): ${dayMeta.notes}`, 14, y, {
        maxWidth: pageWidth - 28,
      });
      y += 7;
    }

    if (dayReworks.length > 0) {
      const roomMap = new Map(state.rooms.map((r) => [r.id, r]));
      const floorMap = new Map(state.floors.map((f) => [f.id, f.name]));
      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        headStyles: { fillColor: COLORS.crimson, textColor: COLORS.white, fontSize: 7.2 },
        bodyStyles: { fontSize: 7.2, textColor: COLORS.ink },
        head: [['Pavimento / Ambiente', 'Serviço', 'Área Afetada', 'Motivo', 'Detalhes']],
        body: dayReworks.map((rw) => {
          const r = roomMap.get(rw.roomId);
          const f = r ? floorMap.get(r.floorId) : '';
          return [
            `${f ?? ''} — ${r?.name ?? ''}`,
            rw.service === 'plano' ? 'Emboço Plano' : 'Requadro',
            `-${formatNumberBR(Math.abs(rw.areaM2))} m²`,
            rw.reworkReason ? REWORK_REASON_LABELS[rw.reworkReason] : 'Retrabalho',
            rw.notes ?? '—',
          ];
        }),
      });
      y = getLastTableY(doc, y + 18) + 7;
    }
  }

  // FINAL SECTION (as explicitly requested): Controle de Frequência e Efetivo por Ambiente
  const nextSectionNum =
    dayReworks.length > 0 || (dayMeta && dayMeta.notes.trim().length > 0) ? 4 : 3;
  y = drawSectionHeading(
    doc,
    `${nextSectionNum}. Controle de Frequência e Efetivo por Ambiente`,
    y
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.slate);
  doc.text(
    `Efetivo do dia: ${dayAttendance.presentCount} presentes  ·  ${dayAttendance.halfDayCount} meio período  ·  ${dayAttendance.absentCount} faltas  ·  ${dayAttendance.rainAbsentCount} dispensas chuva  ·  Total alocado em ambientes: ${dayAttendance.totalAllocatedHeadcount} pessoa(s)`,
    14,
    y
  );
  y += 4.5;

  const activeRoomsAtt = dayAttendance.byRoom.filter(
    (r) => r.effectiveHeadcount > 0 || r.totalDayM2 !== 0
  );

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: COLORS.ink, textColor: COLORS.white, fontSize: 7.2 },
    bodyStyles: { fontSize: 7.2, textColor: COLORS.ink },
    alternateRowStyles: { fillColor: COLORS.surface },
    columnStyles: {
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    head: [[
      'Pavimento',
      'Ambiente',
      'Pessoas Alocadas',
      'Produção no Dia (m²)',
      'Rendimento (m²/pessoa)',
    ]],
    body:
      activeRoomsAtt.length > 0
        ? activeRoomsAtt.map((r) => [
            r.floorName,
            r.roomName,
            String(r.effectiveHeadcount),
            formatNumberBR(r.totalDayM2),
            r.effectiveHeadcount > 0
              ? `${formatNumberBR(r.productivityPerWorker)} m²`
              : '—',
          ])
        : [['—', 'Nenhum efetivo alocado nesta data', '0', '0,0', '—']],
  });
  y = getLastTableY(doc, y + 20) + 5;

  if (dayAttendance.records.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      headStyles: { fillColor: [51, 65, 85], textColor: COLORS.white, fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: COLORS.ink },
      alternateRowStyles: { fillColor: COLORS.surface },
      head: [['Colaborador', 'Função', 'Frequência', 'Ambiente Alocado', 'Observação']],
      body: dayAttendance.records.map((rec) => [
        rec.workerName,
        rec.workerRole,
        ATTENDANCE_STATUS_LABELS[rec.status],
        rec.roomLabel,
        rec.notes ?? '—',
      ]),
    });
    y = getLastTableY(doc, y + 25);
  }

  drawSignaturesBlock(doc, state, y);
  addPageFooters(
    doc,
    state.project.name || 'Obra',
    `Relatório Diário ${formatDateBR(targetDate)}`
  );

  return doc;
}

/**
 * Generate Monthly Consolidated Management Report in vector PDF format.
 * Includes Monthly KPIs, S-Curve, Floor Completion Chart, Full Pavimento/Ambiente Table,
 * Monthly Rework Ledger, and Monthly Attendance & Headcount Summary at the end.
 */
export function generateMonthlyPdf(state: AppState, yearMonth: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const { start, end } = getMonthDateRange(yearMonth);

  // Use latest entry date within the month (or month end) as reference date
  const monthEntryDates = state.entries
    .filter((e) => e.date >= start && e.date <= end)
    .map((e) => e.date)
    .sort();
  const refDate =
    monthEntryDates.length > 0
      ? monthEntryDates[monthEntryDates.length - 1]
      : end;

  const monthProd = getMonthProductionSummary(state, yearMonth);
  const geral = getServiceSummary(state, 'geral', refDate);
  const plano = getServiceSummary(state, 'plano', refDate);
  const requadro = getServiceSummary(state, 'requadro', refDate);
  const timeline = buildTimelineSeries(state, 'geral', refDate);
  const floorMetrics = getFloorMetrics(state, refDate);
  const roomMetrics = getRoomMetrics(state, refDate);
  const monthAtt = getMonthAttendanceSummary(state, yearMonth);
  const alerts = generateAlerts(state, refDate);

  let y = drawDocumentHeader(
    doc,
    'Relatório Mensal Consolidado — Gestão de Emboço',
    formatMonthYearBR(yearMonth),
    state,
    `Dias com produção: ${monthProd.activeDaysCount} · Dias chuva: ${monthProd.rainyDays}`
  );

  const paceAccent =
    geral.averageRealDailyRate < geral.idealDailyRate
      ? COLORS.crimson
      : COLORS.emerald;

  y = drawKpiBoxes(doc, y, [
    {
      label: 'Produção Líquida no Mês',
      value: `${formatNumberBR(monthProd.totalNet)} m²`,
      sub: `Plano ${formatNumberBR(monthProd.planoNet)} · Req. ${formatNumberBR(monthProd.requadroNet)} m²`,
      accent: COLORS.blue,
    },
    {
      label: 'Retrabalho no Mês',
      value: `-${formatNumberBR(monthProd.totalRework)} m²`,
      sub: `${monthProd.reworkEntries.length} ocorrência(s) · ${monthProd.rainyDays} dia(s) chuva`,
      accent: monthProd.totalRework > 0 ? COLORS.crimson : COLORS.slate,
    },
    {
      label: 'Avanço Acumulado Global',
      value: `${formatNumberBR(geral.breakdown.percentComplete)}%`,
      sub: `Faltante: ${formatNumberBR(geral.breakdown.remainingM2)} m²`,
    },
    {
      label: 'Média Real vs Ideal',
      value: `${formatNumberBR(geral.averageRealDailyRate)} / ${formatNumberBR(geral.idealDailyRate)}`,
      sub: geral.estimatedCompletionDate
        ? `Previsão: ${formatDateBR(geral.estimatedCompletionDate)}`
        : 'm²/dia útil',
      accent: paceAccent,
    },
  ]);

  if (alerts.length > 0) {
    const first = alerts[0];
    const isCrit = first.severity === 'critical';
    doc.setFillColor(...(isCrit ? COLORS.crimsonBg : COLORS.amberBg));
    doc.setDrawColor(...(isCrit ? COLORS.crimson : COLORS.amber));
    doc.setLineWidth(0.35);
    doc.roundedRect(14, y, pageWidth - 28, 12, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...(isCrit ? COLORS.crimson : COLORS.amber));
    doc.text(`ALERTA DO MÊS: ${first.title}`, 17.5, y + 4.7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.1);
    doc.setTextColor(...COLORS.ink);
    doc.text(first.message, 17.5, y + 9.2, { maxWidth: pageWidth - 35 });
    y += 15.5;
  }

  // Visual Charts side by side: S-Curve + Floor Completion Horizontal Bars
  const gap = 4;
  const chartW = (pageWidth - 28 - gap) / 2;
  const chartH = 56;
  drawSCurveVectorChart(
    doc,
    14,
    y,
    chartW,
    chartH,
    timeline,
    geral.deadline,
    'Curva S Acumulada (Planejado vs Real)'
  );
  drawFloorProgressVectorChart(
    doc,
    14 + chartW + gap,
    y,
    chartW,
    chartH,
    floorMetrics,
    'Avanço Físico por Pavimento (%)'
  );
  y += chartH + 7;

  // Service Schedule Table
  y = drawSectionHeading(doc, '1. Desempenho Consolidado por Serviço', y);
  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: COLORS.ink, textColor: COLORS.white, fontSize: 7.4 },
    bodyStyles: { fontSize: 7.4, textColor: COLORS.ink },
    alternateRowStyles: { fillColor: COLORS.surface },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center' },
    },
    head: [[
      'Serviço',
      'Exec. no Mês',
      'Retrabalho Mês',
      'Acumulado',
      'Faltante',
      'Real/Dia',
      'Ideal/Dia',
      'Previsão',
    ]],
    body: [
      [
        'Emboço Plano',
        `${formatNumberBR(monthProd.planoNet)} m²`,
        `-${formatNumberBR(monthProd.planoRework)} m²`,
        `${formatNumberBR(plano.breakdown.netExecutedM2)} m²`,
        `${formatNumberBR(plano.breakdown.remainingM2)} m²`,
        `${formatNumberBR(plano.averageRealDailyRate)}`,
        `${formatNumberBR(plano.idealDailyRate)}`,
        plano.estimatedCompletionDate ? formatDateBR(plano.estimatedCompletionDate) : '—',
      ],
      [
        'Requadro',
        `${formatNumberBR(monthProd.requadroNet)} m²`,
        `-${formatNumberBR(monthProd.requadroRework)} m²`,
        `${formatNumberBR(requadro.breakdown.netExecutedM2)} m²`,
        `${formatNumberBR(requadro.breakdown.remainingM2)} m²`,
        `${formatNumberBR(requadro.averageRealDailyRate)}`,
        `${formatNumberBR(requadro.idealDailyRate)}`,
        requadro.estimatedCompletionDate ? formatDateBR(requadro.estimatedCompletionDate) : '—',
      ],
    ],
  });
  y = getLastTableY(doc, y + 20) + 7;

  // Room-by-room cumulative & monthly summary
  y = drawSectionHeading(doc, '2. Levantamento por Pavimento e Ambiente', y);
  const floorsWithDates = floorMetrics.filter((fm) => fm.derivedDeadline !== null);
  if (floorsWithDates.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.slate);
    const floorSummaryLine = floorsWithDates
      .map((fm) => `${fm.floor.name}: ${formatDateBR(fm.derivedDeadline!)}`)
      .join('  ·  ');
    doc.text(`Término automático por pavimento — ${floorSummaryLine}`, 14, y, {
      maxWidth: pageWidth - 28,
    });
    y += 4.5;
  }

  const monthEntries = state.entries.filter((e) => e.date >= start && e.date <= end);
  const monthRoomTotals = new Map<string, number>();
  for (const e of monthEntries) {
    const signed = e.isRework ? -Math.abs(e.areaM2) : e.areaM2;
    monthRoomTotals.set(e.roomId, (monthRoomTotals.get(e.roomId) ?? 0) + signed);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: COLORS.ink, textColor: COLORS.white, fontSize: 6.8 },
    bodyStyles: { fontSize: 6.8, textColor: COLORS.ink },
    alternateRowStyles: { fillColor: COLORS.surface },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center' },
      8: { halign: 'right' },
    },
    head: [[
      'Pavimento',
      'Ambiente',
      'Meta Total',
      'Exec. Mês',
      'Acum. Plano',
      'Acum. Req.',
      'Faltante',
      'Meta Prazo',
      '% Concl.',
    ]],
    body: roomMetrics.map((rm) => [
      rm.floorName,
      rm.room.name,
      `${formatNumberBR(rm.total.targetM2)}`,
      `${formatNumberBR(monthRoomTotals.get(rm.room.id) ?? 0)}`,
      `${formatNumberBR(rm.plano.netExecutedM2)}`,
      `${formatNumberBR(rm.requadro.netExecutedM2)}`,
      `${formatNumberBR(rm.total.remainingM2)}`,
      rm.effectiveDeadline ? formatShortDateBR(rm.effectiveDeadline) : '—',
      `${formatNumberBR(rm.total.percentComplete, 0)}%`,
    ]),
  });
  y = getLastTableY(doc, y + 40) + 7;

  // Rework ledger for the month
  if (monthProd.reworkEntries.length > 0) {
    y = drawSectionHeading(doc, '3. Histórico de Retrabalhos e Ocorrências Climáticas', y);
    const roomMap = new Map(state.rooms.map((r) => [r.id, r]));
    const floorMap = new Map(state.floors.map((f) => [f.id, f.name]));
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      headStyles: { fillColor: COLORS.crimson, textColor: COLORS.white, fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: COLORS.ink },
      head: [['Data', 'Pavimento / Ambiente', 'Serviço', 'Área Perdida', 'Causa', 'Observação']],
      body: monthProd.reworkEntries.map((rw) => {
        const r = roomMap.get(rw.roomId);
        const f = r ? floorMap.get(r.floorId) : '';
        return [
          formatDateBR(rw.date),
          `${f ?? ''} — ${r?.name ?? ''}`,
          rw.service === 'plano' ? 'Plano' : 'Requadro',
          `-${formatNumberBR(Math.abs(rw.areaM2))} m²`,
          rw.reworkReason ? REWORK_REASON_LABELS[rw.reworkReason] : 'Retrabalho',
          rw.notes ?? '—',
        ];
      }),
    });
    y = getLastTableY(doc, y + 20) + 7;
  }

  // FINAL SECTION: Monthly Attendance & Environment Headcount
  const attSectionNum = monthProd.reworkEntries.length > 0 ? 4 : 3;
  y = drawSectionHeading(
    doc,
    `${attSectionNum}. Controle Mensal de Frequência e Efetivo por Ambiente`,
    y
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.slate);
  doc.text(
    `Dias com registro de frequência: ${monthAtt.recordedDays}  ·  Total de Homens-Dia efetivos: ${formatNumberBR(monthAtt.totalManDays)} H/d  ·  Rendimento médio: ${monthAtt.totalManDays > 0 ? formatNumberBR(monthProd.totalNet / monthAtt.totalManDays) : '0,0'} m²/H-d`,
    14,
    y
  );
  y += 4.5;

  // Worker monthly attendance table
  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: COLORS.ink, textColor: COLORS.white, fontSize: 7.2 },
    bodyStyles: { fontSize: 7.2, textColor: COLORS.ink },
    alternateRowStyles: { fillColor: COLORS.surface },
    columnStyles: {
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
    head: [[
      'Colaborador',
      'Função',
      'Presenças',
      'Meio Per.',
      'Faltas',
      'Chuva',
      'H/Dia Efet.',
      'Frequência %',
    ]],
    body:
      monthAtt.workers.length > 0
        ? monthAtt.workers.map((w) => [
            w.name,
            w.role,
            String(w.presentDays),
            String(w.halfDays),
            String(w.absentDays),
            String(w.rainAbsentDays),
            formatNumberBR(w.effectiveManDays),
            `${formatNumberBR(w.attendanceRate, 0)}%`,
          ])
        : [['Nenhum colaborador cadastrado', '—', '0', '0', '0', '0', '0,0', '0%']],
  });
  y = getLastTableY(doc, y + 25) + 5;

  // Room average headcount distribution
  const activeMonthRooms = monthAtt.roomAverages.filter(
    (r) => r.daysWithTeam > 0 || r.monthM2 !== 0
  );
  if (activeMonthRooms.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      headStyles: { fillColor: [51, 65, 85], textColor: COLORS.white, fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: COLORS.ink },
      alternateRowStyles: { fillColor: COLORS.surface },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'right' },
      },
      head: [[
        'Pavimento',
        'Ambiente',
        'Dias com Equipe',
        'Média Pessoas/Dia',
        'Produção no Mês (m²)',
      ]],
      body: activeMonthRooms.map((r) => [
        r.floorName,
        r.roomName,
        String(r.daysWithTeam),
        formatNumberBR(r.avgHeadcount),
        formatNumberBR(r.monthM2),
      ]),
    });
    y = getLastTableY(doc, y + 25);
  }

  drawSignaturesBlock(doc, state, y);
  addPageFooters(
    doc,
    state.project.name || 'Obra',
    `Relatório Mensal — ${formatMonthYearBR(yearMonth)}`
  );

  return doc;
}

export function exportDailyPdfFile(state: AppState, targetDate: string): void {
  const doc = generateDailyPdf(state, targetDate);
  doc.save(`RDO-Emboco-${targetDate}.pdf`);
}

export function exportMonthlyPdfFile(state: AppState, yearMonth: string): void {
  const doc = generateMonthlyPdf(state, yearMonth);
  doc.save(`Relatorio-Mensal-Emboco-${yearMonth}.pdf`);
}

export function getScopeLabelShort(scope: ServiceScope): string {
  if (scope === 'plano') return 'Emboço Plano';
  if (scope === 'requadro') return 'Requadro';
  return 'Consolidado';
}
