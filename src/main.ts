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
import { parseHashState, serializeHashState } from './lib/hashstate';
import { ALL_MUNICIPALITIES } from './lib/municipalities';
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

// View state, restored from (and mirrored to) the URL hash so views are
// shareable: #dag=2026-07-21&kommuner=Vinje,Tokke
const initial = parseHashState(
  window.location.hash,
  tracks.map((t) => t.date),
  ALL_MUNICIPALITIES,
);
let selectedDay: string | null = initial.day;
const selectedMunis = new Set<string>(initial.municipalities);

const tripMap = createTripMap(mapEl, tracks, stops, runsByDay, {
  onMunicipalityToggle: (name) => toggleMunicipality(name),
});

function syncHash(): void {
  const hash = serializeHashState({
    day: selectedDay,
    municipalities: [...selectedMunis],
  });
  history.replaceState(
    null,
    '',
    hash === ''
      ? window.location.pathname + window.location.search
      : hash,
  );
}

function toggleMunicipality(name: string): void {
  if (selectedMunis.has(name)) {
    selectedMunis.delete(name);
  } else {
    selectedMunis.add(name);
  }
  tripMap.setMunicipalityHighlights(selectedMunis);
  syncHash();
  renderAll();
}

function clearMunicipalities(): void {
  selectedMunis.clear();
  tripMap.setMunicipalityHighlights(selectedMunis);
  syncHash();
  renderAll();
}

function selectDay(day: string | null): void {
  selectedDay = day;
  syncHash();
  renderAll();
  tripMap.setDay(day);
}

function renderAll(): void {
  renderDayFilter(filterEl, tracks, selectedDay, selectDay);
  renderPanel(
    panelEl,
    { tracks, stops, legs },
    { day: selectedDay, selectedMunicipalities: selectedMunis },
    {
      onMunicipalityToggle: toggleMunicipality,
      onClearMunicipalities: clearMunicipalities,
      onStopSelect: (startTime) => tripMap.openStop(startTime),
    },
  );
}

renderAll();
tripMap.setDay(selectedDay);
tripMap.setMunicipalityHighlights(selectedMunis);

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

// Apply externally-changed hashes (shared links, back/forward navigation).
window.addEventListener('hashchange', () => {
  const state = parseHashState(
    window.location.hash,
    tracks.map((t) => t.date),
    ALL_MUNICIPALITIES,
  );
  selectedDay = state.day;
  selectedMunis.clear();
  for (const name of state.municipalities) selectedMunis.add(name);
  renderAll();
  tripMap.setDay(selectedDay);
  tripMap.setMunicipalityHighlights(selectedMunis);
});

// Keep Leaflet's size in sync with responsive layout changes.
window.addEventListener('resize', () => tripMap.map.invalidateSize());

document.body.dataset.appReady = 'true';
