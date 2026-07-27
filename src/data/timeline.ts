import { haversineKm, localDate, minutesBetween, parseLatLng } from './parse';
import type { Leg, TimelineData, TrackPoint, VisitEvent } from './types';

/**
 * All GPS fixes from the `timelinePath` segments, globally sorted.
 *
 * Segments are NOT guaranteed globally sorted in the file, so points are
 * sorted here. The sort key mirrors the sanitizer that generated the GeoJSON
 * (time, then lng, then lat for same-timestamp ties), and the day a point
 * belongs to is the local date of its segment's startTime — both properties
 * are what makes the result line up 1:1 with the GeoJSON day tracks.
 */
export function extractTrackPoints(data: TimelineData): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const seg of data.semanticSegments) {
    if (!seg.timelinePath) continue;
    const day = localDate(seg.startTime);
    for (const p of seg.timelinePath) {
      const { lat, lng } = parseLatLng(p.point);
      points.push({ lat, lng, time: p.time, day });
    }
  }
  // ISO strings with a uniform +02:00 offset compare chronologically as strings.
  points.sort(
    (a, b) =>
      a.time.localeCompare(b.time) || a.lng - b.lng || a.lat - b.lat,
  );
  return points;
}

/** Group track points per local day, preserving point order. */
export function pointsByDay(points: TrackPoint[]): Map<string, TrackPoint[]> {
  const days = new Map<string, TrackPoint[]>();
  for (const p of points) {
    let list = days.get(p.day);
    if (!list) {
      list = [];
      days.set(p.day, list);
    }
    list.push(p);
  }
  return new Map([...days.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export interface GapOptions {
  /** A pause longer than this needs a real displacement to count as a gap. */
  maxGapMinutes: number;
  /** Displacement below this during a long pause is just parking jitter. */
  minJumpKm: number;
  /** A jump longer than this is never plausible between samples — always split. */
  maxJumpKm: number;
}

/**
 * Defaults derived from the dataset: normal sampling is 1–6 minutes apart
 * (up to ~9.5 km apart at motorway speed), so a >10 min hole with real
 * displacement means the receiver was off while moving — a sampling dropout,
 * which must not be drawn as a straight line. Long pauses with sub-500 m
 * displacement are just a parked vehicle and stay connected.
 */
export const DEFAULT_GAP_OPTIONS: GapOptions = {
  maxGapMinutes: 10,
  minJumpKm: 0.5,
  maxJumpKm: 12,
};

/**
 * Split a day's points into continuous runs, cutting at sampling dropouts so
 * the map never draws a straight line across a GPS gap.
 */
export function splitOnGaps(
  points: TrackPoint[],
  options: GapOptions = DEFAULT_GAP_OPTIONS,
): TrackPoint[][] {
  const runs: TrackPoint[][] = [];
  let run: TrackPoint[] = [];
  for (const point of points) {
    const prev = run[run.length - 1];
    if (prev) {
      const gapMin = minutesBetween(prev.time, point.time);
      const jumpKm = haversineKm(prev, point);
      const isDropout =
        jumpKm > options.maxJumpKm ||
        (gapMin > options.maxGapMinutes && jumpKm > options.minJumpKm);
      if (isDropout) {
        runs.push(run);
        run = [];
      }
    }
    run.push(point);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** All movement legs from `activity` segments, in chronological order. */
export function extractLegs(data: TimelineData): Leg[] {
  const legs: Leg[] = [];
  for (const seg of data.semanticSegments) {
    if (!seg.activity) continue;
    legs.push({
      day: localDate(seg.startTime),
      startTime: seg.startTime,
      endTime: seg.endTime,
      mode: seg.activity.topCandidate.type,
      // Redacted legs keep distance/duration/mode; only coordinates are gone.
      distanceMeters: seg.activity.distanceMeters ?? 0,
      durationMin: minutesBetween(seg.startTime, seg.endTime),
    });
  }
  legs.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return legs;
}

/**
 * Deduplicated visit events. Timeline emits both a leaf place
 * (hierarchyLevel 0) and its enclosing area (level 1) with the same
 * startTime; keeping both would stack pins. Per startTime, the segment with
 * the lowest hierarchyLevel wins. A level-1 visit without a level-0 sibling
 * (its leaf was redacted) survives as its own event.
 */
export function dedupVisits(data: TimelineData): VisitEvent[] {
  const byStart = new Map<string, VisitEvent>();
  for (const seg of data.semanticSegments) {
    if (!seg.visit) continue;
    const level = seg.visit.hierarchyLevel ?? 0;
    const existing = byStart.get(seg.startTime);
    if (existing && existing.hierarchyLevel <= level) continue;
    const rawLocation = seg.visit.topCandidate.placeLocation?.latLng;
    byStart.set(seg.startTime, {
      day: localDate(seg.startTime),
      startTime: seg.startTime,
      endTime: seg.endTime,
      durationMin: Math.round(minutesBetween(seg.startTime, seg.endTime)),
      hierarchyLevel: level,
      placeId: seg.visit.topCandidate.placeId,
      location: rawLocation === undefined ? undefined : parseLatLng(rawLocation),
    });
  }
  return [...byStart.values()].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
}
