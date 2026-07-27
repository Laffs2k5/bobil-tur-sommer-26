import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAP_OPTIONS,
  dedupVisits,
  extractLegs,
  extractTrackPoints,
  pointsByDay,
  splitOnGaps,
} from '../../src/data/timeline';
import type {
  StopProperties,
  TimelineData,
  TrackPoint,
  TrackProperties,
} from '../../src/data/types';
import { geojson, timeline, TRIP_DAYS } from './fixtures';

const trackFeatures = geojson.features.filter(
  (f) => f.properties.kind === 'track',
);
const stopFeatures = geojson.features.filter(
  (f) => f.properties.kind === 'stop',
);

describe('extractTrackPoints (real data)', () => {
  const points = extractTrackPoints(timeline);

  it('extracts all 825 positions', () => {
    expect(points).toHaveLength(825);
  });

  it('sorts globally by time even though segments are unsorted in the file', () => {
    for (let i = 1; i < points.length; i++) {
      expect(
        points[i]!.time.localeCompare(points[i - 1]!.time),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('groups into the five trip days with the documented point counts', () => {
    const byDay = pointsByDay(points);
    expect([...byDay.keys()]).toEqual(TRIP_DAYS);
    const counts = Object.fromEntries(
      [...byDay.entries()].map(([d, pts]) => [d, pts.length]),
    );
    expect(counts).toEqual({
      '2026-07-20': 242,
      '2026-07-21': 262,
      '2026-07-22': 106,
      '2026-07-23': 97,
      '2026-07-24': 118,
    });
  });

  it('breaks full ties deterministically (time, then lng, then lat)', () => {
    const synthetic: TimelineData = {
      semanticSegments: [
        {
          startTime: '2026-07-20T12:00:00+02:00',
          endTime: '2026-07-20T14:00:00+02:00',
          timelinePath: [
            { point: '59.2°, 10.0°', time: '2026-07-20T12:01:00+02:00' },
            { point: '59.1°, 10.0°', time: '2026-07-20T12:01:00+02:00' },
          ],
        },
      ],
    };
    const sorted = extractTrackPoints(synthetic);
    expect(sorted.map((p) => p.lat)).toEqual([59.1, 59.2]);
  });

  it('reproduces the GeoJSON day tracks position for position', () => {
    const byDay = pointsByDay(points);
    for (const feature of trackFeatures) {
      const props = feature.properties as TrackProperties;
      const dayPoints = byDay.get(props.date)!;
      const coords = feature.geometry.coordinates as [number, number][];
      expect(dayPoints.length).toBe(coords.length);
      coords.forEach(([lng, lat], i) => {
        // GeoJSON coordinates are rounded to 6 decimals by the sanitizer.
        expect(Math.abs(dayPoints[i]!.lng - lng)).toBeLessThan(5.1e-7);
        expect(Math.abs(dayPoints[i]!.lat - lat)).toBeLessThan(5.1e-7);
      });
    }
  });
});

function pt(time: string, lat: number, lng: number): TrackPoint {
  return { time, lat, lng, day: time.slice(0, 10) };
}

describe('splitOnGaps', () => {
  it('returns no runs for no points and one run for one point', () => {
    expect(splitOnGaps([])).toEqual([]);
    const single = [pt('2026-07-20T12:00:00+02:00', 59, 10)];
    expect(splitOnGaps(single)).toEqual([single]);
  });

  it('keeps normal 1–6 min sampling connected, even at motorway speed', () => {
    const points = [
      pt('2026-07-20T12:00:00+02:00', 59.0, 10.0),
      pt('2026-07-20T12:03:00+02:00', 59.05, 10.0), // ~5.6 km in 3 min
      pt('2026-07-20T12:06:00+02:00', 59.1, 10.0),
    ];
    expect(splitOnGaps(points)).toHaveLength(1);
  });

  it('keeps a parked pause connected (long gap, tiny displacement)', () => {
    const points = [
      pt('2026-07-20T12:00:00+02:00', 59.0, 10.0),
      pt('2026-07-20T20:00:00+02:00', 59.001, 10.0), // 8 h parked, ~110 m
    ];
    expect(splitOnGaps(points)).toHaveLength(1);
  });

  it('splits at a sampling dropout (long gap with real displacement)', () => {
    const points = [
      pt('2026-07-20T12:00:00+02:00', 59.0, 10.0),
      pt('2026-07-20T12:02:00+02:00', 59.01, 10.0),
      pt('2026-07-20T12:30:00+02:00', 59.2, 10.3), // 28 min hole, ~28 km
      pt('2026-07-20T12:32:00+02:00', 59.21, 10.3),
    ];
    const runs = splitOnGaps(points);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveLength(2);
    expect(runs[1]).toHaveLength(2);
  });

  it('always splits an implausibly long jump regardless of time gap', () => {
    const points = [
      pt('2026-07-20T12:00:00+02:00', 59.0, 10.0),
      pt('2026-07-20T12:03:00+02:00', 59.2, 10.0), // ~22 km in 3 min
    ];
    expect(splitOnGaps(points)).toHaveLength(2);
  });

  it('honours custom thresholds', () => {
    const points = [
      pt('2026-07-20T12:00:00+02:00', 59.0, 10.0),
      pt('2026-07-20T12:20:00+02:00', 59.02, 10.0), // 20 min, ~2.2 km
    ];
    expect(splitOnGaps(points, DEFAULT_GAP_OPTIONS)).toHaveLength(2);
    expect(
      splitOnGaps(points, { maxGapMinutes: 30, minJumpKm: 0.5, maxJumpKm: 12 }),
    ).toHaveLength(1);
  });

  it('covers every real point in some run, in original order', () => {
    const byDay = pointsByDay(extractTrackPoints(timeline));
    for (const [, dayPoints] of byDay) {
      const runs = splitOnGaps(dayPoints);
      expect(runs.flat()).toEqual(dayPoints);
    }
  });
});

describe('extractLegs (real data)', () => {
  const legs = extractLegs(timeline);

  it('extracts all 23 activity legs in chronological order', () => {
    expect(legs).toHaveLength(23);
    for (let i = 1; i < legs.length; i++) {
      expect(
        legs[i]!.startTime.localeCompare(legs[i - 1]!.startTime),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('finds the documented mode mix (19 car, 2 walking, 2 cycling)', () => {
    const modes = legs.reduce<Record<string, number>>((acc, leg) => {
      acc[leg.mode] = (acc[leg.mode] ?? 0) + 1;
      return acc;
    }, {});
    expect(modes).toEqual({
      IN_PASSENGER_VEHICLE: 19,
      WALKING: 2,
      CYCLING: 2,
    });
  });

  it('keeps distance and duration for legs with redacted endpoints', () => {
    const redactedStarts = new Set(
      timeline.semanticSegments
        .filter((s) => s.activity?.redactedEndpoints)
        .map((s) => s.startTime),
    );
    expect(redactedStarts.size).toBe(5);
    const redactedLegs = legs.filter((l) => redactedStarts.has(l.startTime));
    for (const leg of redactedLegs) {
      expect(leg.distanceMeters).toBeGreaterThan(0);
      expect(leg.durationMin).toBeGreaterThan(0);
    }
  });

  it('defaults a missing distanceMeters to 0', () => {
    const synthetic: TimelineData = {
      semanticSegments: [
        {
          startTime: '2026-07-20T12:00:00+02:00',
          endTime: '2026-07-20T12:10:00+02:00',
          activity: { topCandidate: { type: 'WALKING' } },
        },
      ],
    };
    expect(extractLegs(synthetic)[0]!.distanceMeters).toBe(0);
  });
});

describe('dedupVisits (real data)', () => {
  const visits = dedupVisits(timeline);

  it('collapses 23 visit segments into the 20 stop events on the map', () => {
    const rawVisits = timeline.semanticSegments.filter((s) => s.visit);
    expect(rawVisits).toHaveLength(23);
    expect(visits).toHaveLength(20);
  });

  it('matches the GeoJSON stops on start, end and duration', () => {
    expect(stopFeatures).toHaveLength(20);
    const byStart = new Map(visits.map((v) => [v.startTime, v]));
    for (const feature of stopFeatures) {
      const props = feature.properties as StopProperties;
      const visit = byStart.get(props.start);
      expect(visit, `stop at ${props.start}`).toBeDefined();
      expect(visit!.endTime).toBe(props.end);
      expect(visit!.durationMin).toBe(props.duration_min);
    }
  });

  it('matches the GeoJSON place_ids except the one label-table override', () => {
    // For the two MENY Bø visits (22 and 23 July) the sanitizer's label
    // table preferred the enclosing area's live place_id over the leaf's
    // stale one. A generic hierarchyLevel dedup cannot know that table, so
    // exactly those stops may differ — everything else must agree.
    const byStart = new Map(visits.map((v) => [v.startTime, v]));
    const mismatches = stopFeatures.filter((feature) => {
      const props = feature.properties as StopProperties;
      return byStart.get(props.start)!.placeId !== props.place_id;
    });
    expect(
      mismatches.map((f) => (f.properties as StopProperties).start),
    ).toEqual([
      '2026-07-22T18:50:38.000+02:00',
      '2026-07-23T15:16:03.000+02:00',
    ]);
  });

  it('prefers the leaf place (hierarchyLevel 0) over the enclosing area', () => {
    for (const visit of visits) {
      const sameStart = timeline.semanticSegments.filter(
        (s) => s.visit && s.startTime === visit.startTime,
      );
      const minLevel = Math.min(
        ...sameStart.map((s) => s.visit!.hierarchyLevel ?? 0),
      );
      expect(visit.hierarchyLevel).toBe(minLevel);
    }
  });

  it('keeps a lone enclosing-area visit whose leaf was redacted', () => {
    const levels = visits.map((v) => v.hierarchyLevel);
    expect(levels.filter((l) => l === 1).length).toBeGreaterThan(0);
  });

  it('is insensitive to segment order and tolerates missing locations', () => {
    const synthetic: TimelineData = {
      semanticSegments: [
        {
          startTime: '2026-07-20T10:00:00+02:00',
          endTime: '2026-07-20T11:00:00+02:00',
          visit: {
            hierarchyLevel: 1,
            topCandidate: { placeId: 'AREA' },
          },
        },
        {
          startTime: '2026-07-20T10:00:00+02:00',
          endTime: '2026-07-20T10:30:00+02:00',
          visit: {
            hierarchyLevel: 0,
            topCandidate: {
              placeId: 'LEAF',
              placeLocation: { latLng: '59.0°, 10.0°' },
            },
          },
        },
        {
          startTime: '2026-07-20T12:00:00+02:00',
          endTime: '2026-07-20T12:30:00+02:00',
          visit: {
            // no hierarchyLevel at all -> treated as level 0
            topCandidate: { placeId: 'PLAIN' },
          },
        },
      ],
    };
    const result = dedupVisits(synthetic);
    expect(result).toHaveLength(2);
    expect(result[0]!.placeId).toBe('LEAF');
    expect(result[0]!.location).toEqual({ lat: 59, lng: 10 });
    expect(result[1]!.placeId).toBe('PLAIN');
    expect(result[1]!.location).toBeUndefined();
    // The level-1 duplicate arriving first must lose to the level-0 leaf,
    // and a later duplicate with a higher level must not replace it either.
    const reversed = dedupVisits({
      semanticSegments: [...synthetic.semanticSegments].reverse(),
    });
    expect(reversed[0]!.placeId).toBe('LEAF');
  });
});
