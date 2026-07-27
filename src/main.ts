import 'leaflet/dist/leaflet.css';
import './style.css';

import geojsonRaw from '../raw/trip_20260720_20260724.geojson?raw';
import timelineRaw from '../raw/trip_20260720_20260724_timeline.json?raw';

import {
  extractLegs,
  extractTrackPoints,
  pointsByDay,
  splitOnGaps,
} from './data/timeline';
import { parseTrip } from './data/trip';
import type { TimelineData, TripGeoJson } from './data/types';
import { createTripMap } from './ui/map';
import { renderDayFilter, renderPanel } from './ui/panel';

const geojson = JSON.parse(geojsonRaw) as TripGeoJson;
const timeline = JSON.parse(timelineRaw) as TimelineData;

const { tracks, stops } = parseTrip(geojson);
const legs = extractLegs(timeline);

// Track geometry drawn from the globally sorted timeline points, split at
// GPS sampling dropouts so gaps are never bridged by straight lines.
const runsByDay = new Map(
  [...pointsByDay(extractTrackPoints(timeline)).entries()].map(
    ([day, points]) => [day, splitOnGaps(points)],
  ),
);

const mapEl = document.getElementById('map')!;
const panelEl = document.getElementById('panel')!;
const filterEl = document.getElementById('day-filter')!;

const tripMap = createTripMap(mapEl, tracks, stops, runsByDay);

let selectedDay: string | null = null;

function update(): void {
  renderDayFilter(filterEl, tracks, selectedDay, (day) => {
    selectedDay = day;
    update();
    tripMap.setDay(day);
  });
  renderPanel(panelEl, { tracks, stops, legs }, selectedDay);
}

update();

// Boundaries are bundled static files (no runtime boundary-API calls).
const base = import.meta.env.BASE_URL;
Promise.all([
  fetch(`${base}data/kommuner.geojson`).then((r) => {
    if (!r.ok) throw new Error(`kommuner.geojson: HTTP ${r.status}`);
    return r.json();
  }),
  fetch(`${base}data/fylker.geojson`).then((r) => {
    if (!r.ok) throw new Error(`fylker.geojson: HTTP ${r.status}`);
    return r.json();
  }),
])
  .then(([kommuner, fylker]) => {
    tripMap.addBoundaries(kommuner, fylker);
    document.body.dataset.boundariesLoaded = 'true';
  })
  .catch((err) => {
    console.error('Kunne ikke laste kommunegrenser', err);
  });

// Keep Leaflet's size in sync with responsive layout changes.
window.addEventListener('resize', () => tripMap.map.invalidateSize());

document.body.dataset.appReady = 'true';
