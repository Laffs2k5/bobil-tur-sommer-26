import type { Stop } from '../data/types';
import { formatDuration, formatKm } from './format';

// Chart palette roles — categorical slots validated with the dataviz palette
// validator (light mode, surface #fcfcfb). Day colors follow the day
// (entity), never the row's rank in a filtered view.
export const DAY_COLORS: string[] = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
];
export const OVERNIGHT_COLOR = '#4a3aa7'; // violet, reserved for overnight stops
export const STOP_COLOR = '#2a78d6';
const INK_PRIMARY = '#0b0b0b';
const INK_SECONDARY = '#52514e';

export function dayColor(dayIndex: number): string {
  return DAY_COLORS[dayIndex % DAY_COLORS.length]!;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Horizontal bar with a 4px rounded data-end and a square baseline end. */
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width, height / 2);
  const w = Math.max(width, 0.5);
  return [
    `M${x},${y}`,
    `h${w - r}`,
    `a${r},${r} 0 0 1 ${r},${r}`,
    `v${height - 2 * r}`,
    `a${r},${r} 0 0 1 -${r},${r}`,
    `h-${w - r}`,
    'z',
  ].join('');
}

export interface StopChartOptions {
  width?: number;
}

/**
 * Stop-duration chart: one horizontal bar per stop, longest first, with
 * overnight stops in the reserved overnight color. Values are direct-labeled
 * at the bar tip (the axis is omitted deliberately — every bar is labeled).
 */
export function stopDurationChart(
  stops: Stop[],
  options: StopChartOptions = {},
): string {
  const width = options.width ?? 340;
  const rowH = 34;
  const barH = 14;
  const labelH = 13;
  const sorted = [...stops].sort((a, b) => b.durationMin - a.durationMin);
  const max = Math.max(...sorted.map((s) => s.durationMin), 1);
  const barMaxW = width - 78; // room for the value label at the tip
  const height = sorted.length * rowH + 4;
  const rows = sorted.map((stop, i) => {
    const y = i * rowH;
    const w = Math.max((stop.durationMin / max) * barMaxW, 2);
    const color = stop.overnight ? OVERNIGHT_COLOR : STOP_COLOR;
    const name = escapeXml(truncate(`${stop.label}`, 44));
    const value = escapeXml(formatDuration(stop.durationMin));
    const title = `${escapeXml(stop.label)} — ${value}`;
    return [
      `<g class="stop-bar${stop.overnight ? ' overnight' : ''}" data-stop="${escapeXml(stop.start)}">`,
      `<title>${title}</title>`,
      `<text x="0" y="${y + labelH - 3}" font-size="11" fill="${INK_SECONDARY}">${name}</text>`,
      `<path d="${barPath(0, y + labelH, w, barH)}" fill="${color}"/>`,
      `<text x="${w + 6}" y="${y + labelH + barH - 3}" font-size="11" fill="${INK_PRIMARY}">${value}</text>`,
      '</g>',
    ].join('');
  });
  return svg(width, height, rows.join(''), 'Stoppvarighet');
}

export interface DayDistanceRow {
  date: string;
  label: string;
  distanceKm: number;
  dayIndex: number;
  selected: boolean;
}

/**
 * Distance-per-day chart: one bar per day in that day's fixed color. When a
 * day is selected the other rows keep their hue but recede in opacity, so
 * color keeps following the entity.
 */
export function dayDistanceChart(
  rows: DayDistanceRow[],
  width = 340,
): string {
  const rowH = 32;
  const barH = 14;
  const labelH = 13;
  const max = Math.max(...rows.map((r) => r.distanceKm), 1);
  const barMaxW = width - 70;
  const height = rows.length * rowH + 4;
  const body = rows.map((row, i) => {
    const y = i * rowH;
    const w = Math.max((row.distanceKm / max) * barMaxW, 2);
    const opacity = row.selected ? 1 : 0.35;
    const value = escapeXml(formatKm(row.distanceKm));
    return [
      `<g class="day-bar" data-day="${escapeXml(row.date)}" opacity="${opacity}">`,
      `<title>${escapeXml(row.label)} — ${value}</title>`,
      `<text x="0" y="${y + labelH - 3}" font-size="11" fill="${INK_SECONDARY}">${escapeXml(row.label)}</text>`,
      `<path d="${barPath(0, y + labelH, w, barH)}" fill="${dayColor(row.dayIndex)}"/>`,
      `<text x="${w + 6}" y="${y + labelH + barH - 3}" font-size="11" fill="${INK_PRIMARY}">${value}</text>`,
      '</g>',
    ].join('');
  });
  return svg(width, height, body.join(''), 'Kilometer per dag');
}

function svg(
  width: number,
  height: number,
  body: string,
  label: string,
): string {
  return (
    `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" ` +
    `aria-label="${escapeXml(label)}" font-family="system-ui, sans-serif">` +
    body +
    '</svg>'
  );
}

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}
