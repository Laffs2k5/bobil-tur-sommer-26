import L from 'leaflet';
import type { DayTrack, Stop, TrackPoint } from '../data/types';
import { dayColor, OVERNIGHT_COLOR, STOP_COLOR } from '../lib/charts';
import { formatDayShort } from '../lib/format';
import { stopPopupHtml } from '../lib/popup';

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
}

interface DayLayers {
  date: string;
  group: L.LayerGroup;
  bounds: L.LatLngBounds;
}

export function createTripMap(
  container: HTMLElement,
  tracks: DayTrack[],
  stops: Stop[],
  runsByDay: Map<string, TrackPoint[][]>,
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

  for (const stop of stops) {
    const dayIndex = tracks.findIndex((t) => t.date === stop.date);
    const layer = dayLayers[dayIndex];
    if (!layer) continue;
    const marker = L.circleMarker([stop.location.lat, stop.location.lng], {
      radius: stop.overnight ? 9 : 6.5,
      color: '#ffffff',
      weight: 2,
      fillColor: stop.overnight ? OVERNIGHT_COLOR : STOP_COLOR,
      fillOpacity: 1,
      className: stop.overnight ? 'stop-marker overnight-marker' : 'stop-marker',
    });
    marker.bindPopup(stopPopupHtml(stop), {
      maxWidth: 300,
      // Keep the popup clear of the zoom control and map edges.
      autoPanPaddingTopLeft: L.point(64, 16),
      autoPanPaddingBottomRight: L.point(16, 16),
    });
    marker.bindTooltip(stop.label, { direction: 'top', offset: [0, -6] });
    marker.addTo(layer.group);
  }

  const legend = new L.Control({ position: 'topright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    const rows = tracks
      .map((track, i) => {
        return (
          `<div class="legend-row"><span class="legend-swatch" style="background:${dayColor(i)}"></span>` +
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
      '<span class="legend-label">Overnatting</span></div>';
    return div;
  };
  legend.addTo(map);

  function setDay(day: string | null): void {
    for (const layer of dayLayers) {
      const show = day === null || layer.date === day;
      if (show && !map.hasLayer(layer.group)) layer.group.addTo(map);
      if (!show && map.hasLayer(layer.group)) map.removeLayer(layer.group);
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
      style: {
        color: '#898781',
        weight: 1,
        fillColor: '#52514e',
        fillOpacity: 0.03,
        className: 'kommune-boundary',
      },
      onEachFeature: (feature, layer) => {
        const { name, county } = feature.properties as {
          name: string;
          county: string;
        };
        layer.bindTooltip(
          `<span class="kommune-tooltip"><strong>${escapeHtml(name)}</strong> · ${escapeHtml(county)}</span>`,
          { sticky: true },
        );
      },
    }).addTo(map);

    L.geoJSON(fylker as never, {
      pane: 'fylker',
      interactive: false,
      style: {
        color: '#52514e',
        weight: 2.5,
        dashArray: '7 5',
        fill: false,
        className: 'fylke-boundary',
      },
    }).addTo(map);
  }

  setDay(null);

  return { map, setDay, addBoundaries };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
