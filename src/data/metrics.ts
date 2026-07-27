import type { Leg } from './types';

export const MODE_CAR = 'IN_PASSENGER_VEHICLE';
export const MODE_WALK = 'WALKING';
export const MODE_CYCLE = 'CYCLING';

/** Fixed display order for travel modes. */
export const MODE_ORDER: string[] = [MODE_CAR, MODE_WALK, MODE_CYCLE];

export interface ModeTotals {
  legs: number;
  distanceKm: number;
  durationMin: number;
}

export interface Aggregate {
  total: ModeTotals;
  byMode: Map<string, ModeTotals>;
}

function emptyTotals(): ModeTotals {
  return { legs: 0, distanceKm: 0, durationMin: 0 };
}

function add(totals: ModeTotals, leg: Leg): void {
  totals.legs += 1;
  totals.distanceKm += leg.distanceMeters / 1000;
  totals.durationMin += leg.durationMin;
}

/**
 * Distance and time-in-motion aggregated over legs, total and per mode.
 * Distance is the sum of Google's own per-leg `distanceMeters` — the choice
 * of measure is deliberate, see the README and the UI footnote.
 */
export function aggregate(legs: Leg[]): Aggregate {
  const total = emptyTotals();
  const byMode = new Map<string, ModeTotals>();
  for (const leg of legs) {
    add(total, leg);
    let mode = byMode.get(leg.mode);
    if (!mode) {
      mode = emptyTotals();
      byMode.set(leg.mode, mode);
    }
    add(mode, leg);
  }
  const ordered = new Map<string, ModeTotals>();
  for (const mode of MODE_ORDER) {
    const totals = byMode.get(mode);
    if (totals) ordered.set(mode, totals);
  }
  for (const [mode, totals] of byMode) {
    if (!ordered.has(mode)) ordered.set(mode, totals);
  }
  return { total, byMode: ordered };
}

/** Legs for one local day, or all legs when day is null ("Alle dager"). */
export function filterByDay(legs: Leg[], day: string | null): Leg[] {
  if (day === null) return legs;
  return legs.filter((leg) => leg.day === day);
}

export interface LegSpeed extends Leg {
  distanceKm: number;
  /** Average moving speed, or null for a zero-duration leg. */
  speedKmh: number | null;
}

/** Per-leg average moving speed. */
export function legSpeeds(legs: Leg[]): LegSpeed[] {
  return legs.map((leg) => {
    const distanceKm = leg.distanceMeters / 1000;
    const speedKmh =
      leg.durationMin > 0 ? distanceKm / (leg.durationMin / 60) : null;
    return { ...leg, distanceKm, speedKmh };
  });
}
