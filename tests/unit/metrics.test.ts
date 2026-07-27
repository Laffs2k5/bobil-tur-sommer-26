import { describe, expect, it } from 'vitest';
import {
  aggregate,
  filterByDay,
  legSpeeds,
  MODE_CAR,
  MODE_CYCLE,
  MODE_WALK,
} from '../../src/data/metrics';
import { extractLegs } from '../../src/data/timeline';
import type { Leg, TrackProperties } from '../../src/data/types';
import { geojson, timeline, TRIP_DAYS } from './fixtures';

const legs = extractLegs(timeline);

describe('aggregate (reference totals from raw/DATASET.md)', () => {
  const agg = aggregate(legs);

  it('reproduces the reference table: 657 km car, 2.9 km walking, 0.6 km cycling', () => {
    expect(Math.round(agg.byMode.get(MODE_CAR)!.distanceKm)).toBe(657);
    expect(agg.byMode.get(MODE_WALK)!.distanceKm).toBeCloseTo(2.9, 1);
    expect(agg.byMode.get(MODE_CYCLE)!.distanceKm).toBeCloseTo(0.6, 1);
    expect(Math.round(agg.total.distanceKm)).toBe(660);
  });

  it('reproduces the reference durations: 13 h 20 min car, 1 h 02 min walking, 3 min cycling', () => {
    expect(Math.round(agg.byMode.get(MODE_CAR)!.durationMin)).toBe(800);
    expect(Math.round(agg.byMode.get(MODE_WALK)!.durationMin)).toBe(62);
    expect(Math.round(agg.byMode.get(MODE_CYCLE)!.durationMin)).toBe(3);
    // DATASET.md's "14 h 24 min" total row is this same sum rounded to a
    // tenth of an hour (14.4 h = 864 min); the exact per-leg sum is 865.78.
    expect(agg.total.durationMin).toBeCloseTo(865.78, 1);
  });

  it('counts the reference leg mix (19/2/2)', () => {
    expect(agg.byMode.get(MODE_CAR)!.legs).toBe(19);
    expect(agg.byMode.get(MODE_WALK)!.legs).toBe(2);
    expect(agg.byMode.get(MODE_CYCLE)!.legs).toBe(2);
    expect(agg.total.legs).toBe(23);
  });

  it('orders modes car, walking, cycling for display', () => {
    expect([...agg.byMode.keys()]).toEqual([MODE_CAR, MODE_WALK, MODE_CYCLE]);
  });

  it('appends unknown modes after the known ones', () => {
    const withUnknown: Leg[] = [
      {
        day: '2026-07-20',
        startTime: '2026-07-20T12:00:00+02:00',
        endTime: '2026-07-20T12:30:00+02:00',
        mode: 'FLYING',
        distanceMeters: 1000,
        durationMin: 30,
      },
      ...legs,
    ];
    expect([...aggregate(withUnknown).byMode.keys()]).toEqual([
      MODE_CAR,
      MODE_WALK,
      MODE_CYCLE,
      'FLYING',
    ]);
  });

  it('returns zeroes for no legs', () => {
    const empty = aggregate([]);
    expect(empty.total).toEqual({ legs: 0, distanceKm: 0, durationMin: 0 });
    expect(empty.byMode.size).toBe(0);
  });
});

describe('per-day aggregation cross-checked against the GeoJSON', () => {
  it('matches each day track distance_km (Google distanceMeters per day)', () => {
    for (const feature of geojson.features) {
      if (feature.properties.kind !== 'track') continue;
      const props = feature.properties as TrackProperties;
      const dayAgg = aggregate(filterByDay(legs, props.date));
      expect(dayAgg.total.distanceKm).toBeCloseTo(props.distance_km, 1);
    }
  });

  it('partitions all legs across the five days', () => {
    const perDayCounts = TRIP_DAYS.map(
      (day) => filterByDay(legs, day).length,
    );
    expect(perDayCounts.reduce((a, b) => a + b, 0)).toBe(legs.length);
    expect(filterByDay(legs, null)).toHaveLength(legs.length);
    expect(filterByDay(legs, '2026-07-19')).toHaveLength(0);
  });
});

describe('legSpeeds', () => {
  it('computes plausible average speeds for every real leg', () => {
    for (const leg of legSpeeds(legs)) {
      expect(leg.speedKmh).not.toBeNull();
      expect(leg.speedKmh!).toBeGreaterThan(0);
      expect(leg.speedKmh!).toBeLessThan(130);
    }
  });

  it('computes a simple known case and guards against zero duration', () => {
    const synthetic: Leg[] = [
      {
        day: '2026-07-20',
        startTime: '2026-07-20T12:00:00+02:00',
        endTime: '2026-07-20T13:00:00+02:00',
        mode: 'IN_PASSENGER_VEHICLE',
        distanceMeters: 90_000,
        durationMin: 60,
      },
      {
        day: '2026-07-20',
        startTime: '2026-07-20T13:00:00+02:00',
        endTime: '2026-07-20T13:00:00+02:00',
        mode: 'WALKING',
        distanceMeters: 100,
        durationMin: 0,
      },
    ];
    const [drive, instant] = legSpeeds(synthetic);
    expect(drive!.speedKmh).toBeCloseTo(90);
    expect(drive!.distanceKm).toBeCloseTo(90);
    expect(instant!.speedKmh).toBeNull();
  });
});
