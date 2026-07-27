import L from 'leaflet';
import { wakeupStopForDay } from '../data/trip';
import type { DayTrack, Stop, TrackPoint } from '../data/types';
import { dayColor, MUNI_HIGHLIGHT_COLOR, OVERNIGHT_COLOR, STOP_COLOR } from '../lib/charts';
import { formatDayShort } from '../lib/format';
import { stopPopupHtml, wakeupPopupHtml } from '../lib/popup';

interface BoundaryFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { name: string; county?: string; nr: string };
    geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
  }>;
}

export interface TripMapController {
  map: L.Map;
  setDay(day: string | null): void;
  addBoundaries(
    kommuner: BoundaryFeatureCollection,
    fylker: BoundaryFeatureCollection,
  ): void;
  /** Restyle municipality polygons to reflect the highlighted set. */
  setMunicipalityHighlights(names: ReadonlySet<string>): void;
  /** Open (and pan to) the popup of the stop with this start time. */
  openStop(startTime: string): void;
}

export interface TripMapOptions {
  onMunicipalityToggle?: (name: string) => void;
}

interface DayLayers {
  date: string;
  group: L.LayerGroup;
  bounds: L.LatLngBounds;
}

// Reference layers stay visually behind the trip: hairline, low opacity.
const KOMMUNE_BASE_STYLE: L.PathOptions = {
  color: '#898781',
  weight: 1,
  opacity: 0.55,
  fillColor: '#52514e',
  fillOpacity: 0.03,
};

const KOMMUNE_HIGHLIGHT_STYLE: L.PathOptions = {
  color: MUNI_HIGHLIGHT_COLOR,
  weight: 2.5,
  opacity: 1,
  fillColor: MUNI_HIGHLIGHT_COLOR,
  fillOpacity: 0.18,
};

export function createTripMap(
  container: HTMLElement,
  tracks: DayTrack[],
  stops: Stop[],
  runsByDay: Map<string, TrackPoint[][]>,
  options: TripMapOptions = {},
): TripMapController {
  // Animations off: keeps E2E screenshots deterministic.
  const map = L.map(container, {
    zoomControl: true,
    fadeAnimation: false,
    zoomAnimation: false,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
      ' | Grenser: &copy; <a href="https://www.kartverket.no">Kartverket</a> CC BY 4.0',
  }).addTo(map);

  L.control.scale({ metric: true, imperial: false }).addTo(map);

  // Boundaries render beneath the trip geometry.
  map.createPane('kommuner').style.zIndex = '350';
  map.createPane('fylker').style.zIndex = '360';

  const dayLayers: DayLayers[] = [];
  const allBounds = L.latLngBounds([]);
  const stopMarkers = new Map<string, L.CircleMarker>();
  const muniLayers = new Map<string, L.Path>();
  let highlighted: ReadonlySet<string> = new Set();

  tracks.forEach((track, index) => {
    const color = dayColor(index);
    const group = L.layerGroup();

    // Draw the day as the gap-split runs from the timeline (identical
    // geometry to the GeoJSON LineString, minus lines across GPS dropouts).
    const runs = runsByDay.get(track.date) ?? [];
    const latLngs: L.LatLngExpression[][] = runs.map((run) =>
      run.map((p) => [p.lat, p.lng] as L.LatLngExpression),
    );
    // White casing separates overlapping day tracks (surface-ring rule).
    L.polyline(latLngs, {
      color: '#ffffff',
      weight: 7,
      opacity: 0.9,
      interactive: false,
    }).addTo(group);
    const line = L.polyline(latLngs, {
      color,
      weight: 3.5,
      opacity: 1,
      className: `day-track day-track-${track.date}`,
    }).addTo(group);
    line.bindTooltip(
      `${formatDayShort(track.date)} — ${track.title}`,
      { sticky: true },
    );

    const bounds = line.getBounds();
    allBounds.extend(bounds);
    dayLayers.push({ date: track.date, group, bounds });
  });

  const popupOptions: L.PopupOptions = {
    maxWidth: 300,
    // Keep the popup clear of the zoom control and map edges.
    autoPanPaddingTopLeft: L.point(64, 16),
    autoPanPaddingBottomRight: L.point(16, 16),
  };

  for (const stop of stops) {
    const dayIndex = tracks.findIndex((t) => t.date === stop.date);
    const layer = dayLayers[dayIndex];
    if (!layer) continue;
    const marker = L.circleMarker([stop.location.lat, stop.location.lng], {
      radius: stop.overnight ? 9 : 6.5,
      color: '#ffffff',
      weight: 3, // thick white halo so dots separate from track lines
      fillColor: stop.overnight ? OVERNIGHT_COLOR : STOP_COLOR,
      fillOpacity: 1,
      className: stop.overnight ? 'stop-marker overnight-marker' : 'stop-marker',
    });
    marker.bindPopup(stopPopupHtml(stop), popupOptions);
    marker.bindTooltip(stop.label, { direction: 'top', offset: [0, -6] });
    marker.addTo(layer.group);
    stopMarkers.set(stop.start, marker);
  }

  // One "day start" marker per day, shown only when that day is selected:
  // the campsite from the previous evening's overnight stop.
  const wakeupByDay = new Map<string, L.CircleMarker>();
  for (const track of tracks) {
    const wakeup = wakeupStopForDay(stops, track.date);
    if (!wakeup) continue;
    const marker = L.circleMarker(
      [wakeup.location.lat, wakeup.location.lng],
      {
        radius: 8,
        color: OVERNIGHT_COLOR,
        weight: 3,
        fillColor: '#ffffff',
        fillOpacity: 1,
        className: 'wakeup-marker',
      },
    );
    marker.bindPopup(wakeupPopupHtml(wakeup), popupOptions);
    marker.bindTooltip(`Dagens start: ${wakeup.label}`, {
      direction: 'top',
      offset: [0, -6],
    });
    wakeupByDay.set(track.date, marker);
  }

  let legendEl: HTMLElement | null = null;
  const legend = new L.Control({ position: 'topright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    const rows = tracks
      .map((track, i) => {
        return (
          `<div class="legend-row legend-row-day" data-day="${track.date}">` +
          `<span class="legend-swatch" style="background:${dayColor(i)}"></span>` +
          `<span class="legend-label">${formatDayShort(track.date)}` +
          `<span class="legend-title"> ${escapeHtml(track.title)}</span></span></div>`
        );
      })
      .join('');
    div.innerHTML =
      rows +
      `<div class="legend-row"><span class="legend-marker" style="background:${STOP_COLOR}"></span>` +
      '<span class="legend-label">Stopp</span></div>' +
      `<div class="legend-row"><span class="legend-marker" style="background:${OVERNIGHT_COLOR}"></span>` +
      '<span class="legend-label">Overnatting</span></div>' +
      `<div class="legend-row"><span class="legend-marker legend-marker-hollow" style="border-color:${OVERNIGHT_COLOR}"></span>` +
      '<span class="legend-label">Dagens start</span></div>';
    legendEl = div;
    return div;
  };
  legend.addTo(map);

  // On small screens the legend and an open popup fight for the same map
  // area (controls always stack above panes) — hide the legend meanwhile.
  map.on('popupopen', () =>
    legendEl?.classList.add('map-legend-popup-open'),
  );
  map.on('popupclose', () =>
    legendEl?.classList.remove('map-legend-popup-open'),
  );

  function setDay(day: string | null): void {
    for (const layer of dayLayers) {
      const show = day === null || layer.date === day;
      if (show && !map.hasLayer(layer.group)) layer.group.addTo(map);
      if (!show && map.hasLayer(layer.group)) map.removeLayer(layer.group);
    }
    // Legend mirrors the filter: rows for hidden days recede.
    legendEl
      ?.querySelectorAll<HTMLElement>('.legend-row-day')
      .forEach((row) => {
        row.classList.toggle(
          'legend-row-muted',
          day !== null && row.dataset.day !== day,
        );
      });
    for (const [date, marker] of wakeupByDay) {
      const show = day === date;
      if (show && !map.hasLayer(marker)) marker.addTo(map);
      if (!show && map.hasLayer(marker)) map.removeLayer(marker);
    }
    const target =
      day === null
        ? allBounds
        : (dayLayers.find((l) => l.date === day)?.bounds ?? allBounds);
    map.fitBounds(target.pad(0.06));
  }

  function addBoundaries(
    kommuner: BoundaryFeatureCollection,
    fylker: BoundaryFeatureCollection,
  ): void {
    L.geoJSON(kommuner as never, {
      pane: 'kommuner',
      style: { ...KOMMUNE_BASE_STYLE, className: 'kommune-boundary' },
      onEachFeature: (feature, layer) => {
        const { name, county } = feature.properties as {
          name: string;
          county: string;
        };
        layer.bindTooltip(
          `<span class="kommune-tooltip"><strong>${escapeHtml(name)}</strong> · ${escapeHtml(county)}</span>`,
          { sticky: true },
        );
        muniLayers.set(name, layer as L.Path);
        layer.on('click', () => options.onMunicipalityToggle?.(name));
      },
    }).addTo(map);

    L.geoJSON(fylker as never, {
      pane: 'fylker',
      interactive: false,
      style: {
        color: '#6f6d66',
        weight: 1.5,
        opacity: 0.55,
        dashArray: '4 6',
        fill: false,
        className: 'fylke-boundary',
      },
    }).addTo(map);

    applyHighlights();
  }

  function applyHighlights(): void {
    for (const [name, layer] of muniLayers) {
      const isSelected = highlighted.has(name);
      layer.setStyle(
        isSelected ? KOMMUNE_HIGHLIGHT_STYLE : KOMMUNE_BASE_STYLE,
      );
      const el = layer.getElement();
      if (el) el.classList.toggle('kommune-highlighted', isSelected);
    }
  }

  function setMunicipalityHighlights(names: ReadonlySet<string>): void {
    highlighted = names;
    applyHighlights();
  }

  function openStop(startTime: string): void {
    const marker = stopMarkers.get(startTime);
    // A stop whose day is filtered out has no visible marker; the chart only
    // shows stops for the current selection, so this is just a guard.
    if (!marker || !map.hasLayer(marker)) return;
    marker.openPopup();
  }

  setDay(null);

  return { map, setDay, addBoundaries, setMunicipalityHighlights, openStop };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
