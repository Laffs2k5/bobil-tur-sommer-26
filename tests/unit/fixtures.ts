import geojsonRaw from '../../raw/trip_20260720_20260724.geojson?raw';
import timelineRaw from '../../raw/trip_20260720_20260724_timeline.json?raw';
import type { TimelineData, TripGeoJson } from '../../src/data/types';

/** The real sanitized dataset, used as an end-to-end fixture for the data layer. */
export const timeline: TimelineData = JSON.parse(timelineRaw);
export const geojson: TripGeoJson = JSON.parse(geojsonRaw);

export const TRIP_DAYS = [
  '2026-07-20',
  '2026-07-21',
  '2026-07-22',
  '2026-07-23',
  '2026-07-24',
];
