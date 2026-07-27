import { localDate } from './parse';
import type {
  DayTrack,
  Stop,
  StopProperties,
  TrackProperties,
  TripGeoJson,
} from './types';

/** Overnight stops sit in this duration band (see raw/DATASET.md). */
export const OVERNIGHT_MIN_MINUTES = 850;
export const OVERNIGHT_MAX_MINUTES = 1250;

export function isOvernight(durationMin: number): boolean {
  return (
    durationMin >= OVERNIGHT_MIN_MINUTES && durationMin <= OVERNIGHT_MAX_MINUTES
  );
}

/** Parse the render-ready GeoJSON into day tracks and stops. */
export function parseTrip(geojson: TripGeoJson): {
  tracks: DayTrack[];
  stops: Stop[];
} {
  const tracks: DayTrack[] = [];
  const stops: Stop[] = [];
  for (const feature of geojson.features) {
    if (feature.properties.kind === 'track') {
      const p = feature.properties as TrackProperties;
      if (feature.geometry.type !== 'LineString') {
        throw new Error(`Track ${p.date} is not a LineString`);
      }
      tracks.push({
        date: p.date,
        title: p.title,
        municipalities: p.municipalities,
        points: p.points,
        firstFix: p.first_fix,
        lastFix: p.last_fix,
        distanceKm: p.distance_km,
        trackLengthKm: p.track_length_km,
        modes: p.modes,
        coordinates: feature.geometry.coordinates.map(([lng, lat]) => ({
          lat,
          lng,
        })),
      });
    } else {
      const p = feature.properties as StopProperties;
      if (feature.geometry.type !== 'Point') {
        throw new Error(`Stop ${p.label} is not a Point`);
      }
      const [lng, lat] = feature.geometry.coordinates;
      stops.push({
        label: p.label,
        municipality: p.municipality,
        verified: p.name_verified,
        date: p.date,
        start: p.start,
        end: p.end,
        durationMin: p.duration_min,
        placeId: p.place_id,
        location: { lat, lng },
        overnight: isOvernight(p.duration_min),
      });
    }
  }
  tracks.sort((a, b) => a.date.localeCompare(b.date));
  stops.sort((a, b) => a.start.localeCompare(b.start));
  return { tracks, stops };
}

/**
 * Google Maps link for a stop — only for verified names. Unverified labels
 * are locality descriptions whose recorded place_id may resolve to nothing
 * or to the wrong entity, so they never get a link (see raw/DATASET.md).
 */
export function googleMapsUrl(stop: Stop): string | null {
  if (!stop.verified) return null;
  const query = encodeURIComponent(`${stop.location.lat},${stop.location.lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(stop.placeId)}`;
}

/** Stops for one local day, or all when day is null. */
export function stopsForDay(stops: Stop[], day: string | null): Stop[] {
  if (day === null) return stops;
  return stops.filter((stop) => stop.date === day);
}

/**
 * Where the given day started: the overnight stop from the *previous* evening
 * whose departure falls on this day. Null for the first trip day (its start
 * lies inside the privacy fence) and for the all-days view.
 */
export function wakeupStopForDay(stops: Stop[], day: string | null): Stop | null {
  if (day === null) return null;
  return (
    stops.find((stop) => stop.overnight && localDate(stop.end) === day) ?? null
  );
}
