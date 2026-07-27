import {
  aggregate,
  filterByDay,
  legSpeeds,
  type Aggregate,
} from '../data/metrics';
import { stopsForDay, wakeupStopForDay } from '../data/trip';
import type { DayTrack, Leg, Stop } from '../data/types';
import {
  dayColor,
  dayDistanceChart,
  escapeXml,
  stopDurationChart,
  type DayDistanceRow,
} from '../lib/charts';
import {
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatKm,
  formatSpeed,
  formatTime,
  modeEmoji,
  modeLabel,
} from '../lib/format';
import { MUNICIPALITIES_BY_COUNTY } from '../lib/municipalities';

export interface PanelData {
  tracks: DayTrack[];
  stops: Stop[];
  legs: Leg[];
}

export interface PanelState {
  day: string | null;
  selectedMunicipalities: ReadonlySet<string>;
}

export interface PanelCallbacks {
  onMunicipalityToggle(name: string): void;
  onClearMunicipalities(): void;
  onStopSelect(startTime: string): void;
}

export function renderPanel(
  container: HTMLElement,
  data: PanelData,
  state: PanelState,
  callbacks: PanelCallbacks,
): void {
  const { day } = state;
  const legs = filterByDay(data.legs, day);
  const stops = stopsForDay(data.stops, day);
  const agg = aggregate(legs);
  const track = day === null ? null : data.tracks.find((t) => t.date === day);
  const wakeup = wakeupStopForDay(data.stops, day);
  const muniCount = track
    ? track.municipalities.length
    : MUNICIPALITIES_BY_COUNTY.reduce((n, g) => n + g.municipalities.length, 0);

  const parts: string[] = [];
  parts.push(selectionHeader(track, day, stops, wakeup));
  parts.push(statTiles(agg, stops, muniCount));
  parts.push(modeTable(agg));
  parts.push(
    '<p class="footnote" id="distance-footnote">Distanse er summen av Googles egne ' +
      'etappe-estimater (distanceMeters) og undervurderer faktisk kjørelengde noe; ' +
      'GPS-sporet målt som polylinje gir ~755 km totalt. Tid i bevegelse teller kun ' +
      'kjøre-/gå-/sykkeltid, ikke pauser. Alle klokkeslett er lokal tid (Europe/Oslo).</p>',
  );

  parts.push('<h2>Kilometer per dag</h2>');
  const rows: DayDistanceRow[] = data.tracks.map((t, i) => {
    const dayAgg = aggregate(filterByDay(data.legs, t.date));
    return {
      date: t.date,
      label: formatDayShort(t.date),
      distanceKm: dayAgg.total.distanceKm,
      dayIndex: i,
      selected: day === null || day === t.date,
    };
  });
  parts.push(`<div class="chart-block" id="day-chart">${dayDistanceChart(rows)}</div>`);

  parts.push(municipalityChips(track, state.selectedMunicipalities));

  parts.push(
    `<h2>Stopp og varighet${day === null ? '' : ' denne dagen'}</h2>`,
  );
  parts.push(
    '<p class="footnote">Mørk fiolett = overnattingsstopp (ca. 14–21 t). ' +
      'Klikk en rad for å åpne stoppet på kartet.</p>',
  );
  parts.push(`<div class="chart-block" id="stop-chart">${stopDurationChart(stops)}</div>`);

  parts.push(legsTable(legs));

  container.innerHTML = parts.join('');

  // Chips toggle municipality highlighting on the map.
  container.querySelectorAll<HTMLButtonElement>('.muni-chip').forEach((chip) => {
    chip.addEventListener('click', () =>
      callbacks.onMunicipalityToggle(chip.dataset.muni!),
    );
  });
  container
    .querySelector('#muni-clear')
    ?.addEventListener('click', () => callbacks.onClearMunicipalities());

  // Chart rows open the corresponding stop popup on the map.
  container
    .querySelectorAll<SVGGElement>('#stop-chart g[data-stop]')
    .forEach((bar) => {
      bar.addEventListener('click', () =>
        callbacks.onStopSelect(bar.dataset.stop!),
      );
    });
}

function selectionHeader(
  track: DayTrack | null | undefined,
  day: string | null,
  stops: Stop[],
  wakeup: Stop | null,
): string {
  if (!track || day === null) {
    return (
      '<p class="selection-title" id="selection-title">Alle dager</p>' +
      `<p class="selection-sub" id="selection-sub">5 dagsetapper · ${stops.length} stopp</p>`
    );
  }
  const wakeupNote = wakeup
    ? ` · startet fra ${escapeXml(wakeup.label.split(',')[0]!)}`
    : '';
  return (
    `<p class="selection-title" id="selection-title">${escapeXml(track.title)}</p>` +
    `<p class="selection-sub" id="selection-sub">${formatDayLong(day)} · ${stops.length} stopp${wakeupNote}</p>`
  );
}

function statTiles(agg: Aggregate, stops: Stop[], muniCount: number): string {
  const overnightCount = stops.filter((s) => s.overnight).length;
  return (
    '<div class="stat-tiles">' +
    '<div class="stat-tile"><div class="stat-label">Distanse</div>' +
    `<div class="stat-value" id="stat-distance">${formatKm(agg.total.distanceKm)}</div>` +
    '<div class="stat-sub">Googles etappe-estimat</div></div>' +
    '<div class="stat-tile"><div class="stat-label">Tid i bevegelse</div>' +
    `<div class="stat-value" id="stat-duration">${formatDuration(agg.total.durationMin)}</div>` +
    '<div class="stat-sub">ekskl. pauser</div></div>' +
    '<div class="stat-tile"><div class="stat-label">Stopp</div>' +
    `<div class="stat-value" id="stat-stops">${stops.length}</div>` +
    `<div class="stat-sub">${overnightCount} overnatting${overnightCount === 1 ? '' : 'er'}</div></div>` +
    '<div class="stat-tile"><div class="stat-label">Kommuner</div>' +
    `<div class="stat-value" id="stat-munis">${muniCount}</div>` +
    '<div class="stat-sub">krysset underveis</div></div>' +
    '</div>'
  );
}

function modeTable(agg: Aggregate): string {
  const rows = [...agg.byMode.entries()]
    .map(([mode, totals]) => {
      return (
        `<tr class="mode-row" data-mode="${escapeXml(mode)}">` +
        `<td><span class="mode-emoji" aria-hidden="true">${modeEmoji(mode)}</span> ${escapeXml(modeLabel(mode))}</td>` +
        `<td>${totals.legs}</td>` +
        `<td>${formatKm(totals.distanceKm)}</td>` +
        `<td>${formatDuration(totals.durationMin)}</td></tr>`
      );
    })
    .join('');
  return (
    '<h2>Per reisemåte</h2>' +
    '<table class="mode-table" id="mode-table">' +
    '<thead><tr><th>Modus</th><th>Etapper</th><th>Distanse</th><th>Tid</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`
  );
}

function muniChip(name: string, selected: ReadonlySet<string>): string {
  const pressed = selected.has(name);
  return (
    `<button type="button" class="muni-chip${pressed ? ' muni-chip-on' : ''}" ` +
    `data-muni="${escapeXml(name)}" aria-pressed="${pressed}">${escapeXml(name)}</button>`
  );
}

function municipalityChips(
  track: DayTrack | null | undefined,
  selected: ReadonlySet<string>,
): string {
  const clearButton =
    selected.size > 0
      ? '<button type="button" id="muni-clear" class="muni-clear">Nullstill utheving</button>'
      : '';
  const hint =
    '<p class="footnote">Klikk en kommune for å utheve området på kartet' +
    (track ? ' · i rekkefølge langs ruta.' : '.') +
    '</p>';
  if (track) {
    const chips = track.municipalities
      .map((m) => muniChip(m, selected))
      .join('');
    return (
      `<h2>Kommuner denne dagen (${track.municipalities.length})</h2>` +
      hint +
      `<div class="muni-chips" id="muni-chips">${chips}</div>` +
      clearButton
    );
  }
  const groups = MUNICIPALITIES_BY_COUNTY.map((group) => {
    const chips = group.municipalities
      .map((m) => muniChip(m, selected))
      .join('');
    return (
      `<div class="muni-group"><div class="muni-county">${escapeXml(group.county)}</div>` +
      `<div class="muni-chips">${chips}</div></div>`
    );
  }).join('');
  const total = MUNICIPALITIES_BY_COUNTY.reduce(
    (n, g) => n + g.municipalities.length,
    0,
  );
  return (
    `<h2>Kommuner på turen (${total})</h2>` +
    hint +
    `<div id="muni-chips">${groups}</div>` +
    clearButton
  );
}

function legsTable(legs: Leg[]): string {
  const rows = legSpeeds(legs)
    .map((leg) => {
      return (
        '<tr class="leg-row">' +
        `<td>${formatDayShort(leg.day)} ${formatTime(leg.startTime)}</td>` +
        `<td><span class="mode-emoji" aria-hidden="true">${modeEmoji(leg.mode)}</span> ${escapeXml(modeLabel(leg.mode))}</td>` +
        `<td>${formatKm(leg.distanceKm)}</td>` +
        `<td>${formatDuration(leg.durationMin)}</td>` +
        `<td>${leg.speedKmh === null ? '–' : formatSpeed(leg.speedKmh)}</td></tr>`
      );
    })
    .join('');
  return (
    '<h2>Etapper og snittfart</h2>' +
    '<table class="legs-table" id="legs-table">' +
    '<thead><tr><th>Start</th><th>Modus</th><th>Dist.</th><th>Tid</th><th>Snitt</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>` +
    '<p class="footnote">Snittfart er distanse delt på tid i bevegelse per etappe.</p>'
  );
}

export function renderDayFilter(
  container: HTMLElement,
  tracks: DayTrack[],
  selected: string | null,
  onSelect: (day: string | null) => void,
): void {
  container.innerHTML = '';
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'day-chip';
  all.dataset.day = '';
  all.setAttribute('aria-pressed', String(selected === null));
  all.innerHTML =
    '<span class="chip-date">Alle dager</span><span class="chip-title">Hele turen</span>';
  all.addEventListener('click', () => onSelect(null));
  container.appendChild(all);

  tracks.forEach((track, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'day-chip';
    chip.dataset.day = track.date;
    chip.style.setProperty('--chip-color', dayColor(i));
    chip.setAttribute('aria-pressed', String(selected === track.date));
    chip.title = track.title;
    chip.innerHTML =
      `<span class="chip-date">${formatDayShort(track.date)}</span>` +
      `<span class="chip-title">${escapeXml(track.title)}</span>`;
    chip.addEventListener('click', () => onSelect(track.date));
    container.appendChild(chip);
  });
}
