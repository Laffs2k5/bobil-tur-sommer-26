import type { LatLng } from './types';

// Timeline coordinates are strings with degree symbols ("59.29°, 10.39°"),
// so they must be parsed with a regex — never fed to Number() directly.
const LATLNG_RE = /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)\s*°?\s*$/;

/** Parse a degree-symbol coordinate string like `"59.2905015°, 10.3911224°"`. */
export function parseLatLng(value: string): LatLng {
  const m = LATLNG_RE.exec(value);
  if (!m) {
    throw new Error(`Unparseable lat/lng string: ${JSON.stringify(value)}`);
  }
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`Coordinate out of range: ${JSON.stringify(value)}`);
  }
  return { lat, lng };
}

const ISO_LOCAL_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/;

/**
 * The local calendar date (`YYYY-MM-DD`) of an ISO timestamp. All timestamps
 * in the dataset carry an explicit `+02:00` offset and are already local wall
 * time, so the date is read straight off the string — converting through the
 * viewer's timezone (or UTC) would shift evening times to the wrong day.
 */
export function localDate(iso: string): string {
  const m = ISO_LOCAL_RE.exec(iso);
  if (!m) {
    throw new Error(`Not an ISO local timestamp: ${JSON.stringify(iso)}`);
  }
  return m[1]!;
}

/** Local wall-clock `HH:MM` of an ISO timestamp, same rationale as localDate. */
export function localHM(iso: string): string {
  if (!ISO_LOCAL_RE.test(iso)) {
    throw new Error(`Not an ISO local timestamp: ${JSON.stringify(iso)}`);
  }
  return iso.slice(11, 16);
}

/** Whole minutes between two ISO timestamps (offset-aware via Date.parse). */
export function minutesBetween(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`Unparseable timestamp pair: ${startIso} / ${endIso}`);
  }
  return (end - start) / 60_000;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km between two coordinates (haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}
