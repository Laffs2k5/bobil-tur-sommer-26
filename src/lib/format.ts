import { localDate, localHM } from '../data/parse';
import { MODE_CAR, MODE_CYCLE, MODE_WALK } from '../data/metrics';

export const MODE_LABELS: Record<string, string> = {
  [MODE_CAR]: 'Bil',
  [MODE_WALK]: 'Til fots',
  [MODE_CYCLE]: 'Sykkel',
};

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}

/** "241 km" for large values, "2,9 km" (Norwegian decimal comma) under 10. */
export function formatKm(km: number): string {
  if (km < 10) {
    return `${km.toFixed(1).replace('.', ',')} km`;
  }
  return `${Math.round(km)} km`;
}

/** "13 t 20 min", "45 min", "2 t". */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} t`;
  return `${hours} t ${mins} min`;
}

/** "88 km/t", "5,4 km/t" under 10. */
export function formatSpeed(kmh: number): string {
  if (kmh < 10) return `${kmh.toFixed(1).replace('.', ',')} km/t`;
  return `${Math.round(kmh)} km/t`;
}

const WEEKDAYS = [
  'søndag',
  'mandag',
  'tirsdag',
  'onsdag',
  'torsdag',
  'fredag',
  'lørdag',
];
const MONTHS = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
];

function dateParts(day: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${JSON.stringify(day)}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Weekday of a `YYYY-MM-DD` date, computed in UTC so no TZ can shift it. */
export function weekday(day: string): string {
  const { y, m, d } = dateParts(day);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}

/** "mandag 20. juli" from a `YYYY-MM-DD` date. */
export function formatDayLong(day: string): string {
  const { m, d } = dateParts(day);
  return `${weekday(day)} ${d}. ${MONTHS[m - 1]}`;
}

/** "ma. 20.7" — compact day-filter chip label. */
export function formatDayShort(day: string): string {
  const { m, d } = dateParts(day);
  return `${weekday(day).slice(0, 2)}. ${d}.${m}`;
}

/**
 * "20. juli 14:02" — read straight from the ISO string, which is already
 * Europe/Oslo wall time; the viewer's timezone must never shift it.
 */
export function formatTimestamp(iso: string): string {
  const { m, d } = dateParts(localDate(iso));
  return `${d}. ${MONTHS[m - 1]} ${localHM(iso)}`;
}

/** "14:02" local wall time. */
export function formatTime(iso: string): string {
  return localHM(iso);
}
