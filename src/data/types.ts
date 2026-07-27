// Shapes of the two input files. See raw/DATASET.md for the contract.

/** A parsed WGS84 coordinate. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** One point of a `timelinePath` segment: `point` is a degree-symbol string. */
export interface TimelinePathPoint {
  point: string;
  time: string;
}

export interface ActivitySegment {
  distanceMeters?: number;
  probability?: number;
  topCandidate: {
    type: string;
    probability?: number;
  };
  /** Absent on redacted legs — code must tolerate missing endpoints. */
  start?: { latLng: string };
  end?: { latLng: string };
  parking?: { location?: { latLng: string }; startTime?: string };
  /** Added by the sanitizer: which of start/end/parking was stripped. */
  redactedEndpoints?: string[];
}

export interface VisitSegment {
  hierarchyLevel?: number;
  probability?: number;
  topCandidate: {
    placeId?: string;
    semanticType?: string;
    probability?: number;
    placeLocation?: { latLng: string };
  };
}

export interface SemanticSegment {
  startTime: string;
  endTime: string;
  startTimeTimezoneUtcOffsetMinutes?: number;
  endTimeTimezoneUtcOffsetMinutes?: number;
  timelinePath?: TimelinePathPoint[];
  activity?: ActivitySegment;
  visit?: VisitSegment;
}

export interface TimelineData {
  semanticSegments: SemanticSegment[];
}

// --- Derived, app-facing types --------------------------------------------

/** A GPS fix with its local-time ISO string and local date (`YYYY-MM-DD`). */
export interface TrackPoint extends LatLng {
  time: string;
  day: string;
}

/** One movement leg derived from an `activity` segment. */
export interface Leg {
  day: string;
  startTime: string;
  endTime: string;
  mode: string;
  distanceMeters: number;
  durationMin: number;
}

/** One deduplicated visit event. */
export interface VisitEvent {
  day: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  hierarchyLevel: number;
  placeId?: string;
  location?: LatLng;
}

// --- GeoJSON file shapes ----------------------------------------------------

export interface TrackProperties {
  kind: 'track';
  date: string;
  title: string;
  municipalities: string[];
  points: number;
  first_fix: string;
  last_fix: string;
  distance_km: number;
  track_length_km: number;
  modes: string[];
}

export interface StopProperties {
  kind: 'stop';
  label: string;
  municipality: string;
  name_verified: boolean;
  date: string;
  start: string;
  end: string;
  duration_min: number;
  place_id: string;
}

export interface TripFeature {
  type: 'Feature';
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Point'; coordinates: [number, number] };
  properties: TrackProperties | StopProperties;
}

export interface TripGeoJson {
  type: 'FeatureCollection';
  features: TripFeature[];
}

/** App-facing day track parsed from the GeoJSON. */
export interface DayTrack {
  date: string;
  title: string;
  municipalities: string[];
  points: number;
  firstFix: string;
  lastFix: string;
  distanceKm: number;
  trackLengthKm: number;
  modes: string[];
  /** LineString positions as {lat,lng}, in time order. */
  coordinates: LatLng[];
}

/** App-facing stop parsed from the GeoJSON. */
export interface Stop {
  label: string;
  municipality: string;
  verified: boolean;
  date: string;
  start: string;
  end: string;
  durationMin: number;
  placeId: string;
  location: LatLng;
  overnight: boolean;
}
