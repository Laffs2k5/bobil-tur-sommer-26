import { describe, expect, it } from 'vitest';
import { parseTrip } from '../../src/data/trip';
import {
  DAY_COLORS,
  dayColor,
  dayDistanceChart,
  escapeXml,
  OVERNIGHT_COLOR,
  stopDurationChart,
  truncate,
  type DayDistanceRow,
} from '../../src/lib/charts';
import { geojson } from './fixtures';

const { stops } = parseTrip(geojson);

describe('dayColor', () => {
  it('assigns the five categorical slots in fixed order and wraps after', () => {
    expect(dayColor(0)).toBe(DAY_COLORS[0]);
    expect(dayColor(4)).toBe(DAY_COLORS[4]);
    expect(dayColor(5)).toBe(DAY_COLORS[0]);
  });
});

describe('escapeXml / truncate', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeXml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });

  it('truncates long strings with an ellipsis', () => {
    expect(truncate('abcdef', 6)).toBe('abcdef');
    expect(truncate('abcdefg', 6)).toBe('abcde…');
  });
});

describe('stopDurationChart', () => {
  const svg = stopDurationChart(stops);

  it('draws one labeled bar per stop', () => {
    expect(svg.match(/class="stop-bar/g)).toHaveLength(20);
    expect(svg).toContain('Bø Sommarland');
    expect(svg).toContain('6 t 40 min'); // Sommarland, 400 min
  });

  it('marks overnight stops with the reserved overnight color', () => {
    expect(svg.match(/stop-bar overnight/g)).toHaveLength(4);
    expect(svg).toContain(OVERNIGHT_COLOR);
  });

  it('sorts longest stop first', () => {
    const first = svg.indexOf('First Camp Norsjø');
    const shortStop = svg.indexOf('Bensinstasjon, Vrådal');
    expect(first).toBeGreaterThan(-1);
    expect(shortStop).toBeGreaterThan(first);
  });

  it('escapes labels and never produces zero-width bars', () => {
    const withMarkup = [
      { ...stops[0]!, label: 'A <b>&"evil"</b>', durationMin: 1 },
    ];
    const out = stopDurationChart(withMarkup);
    expect(out).toContain('A &lt;b&gt;&amp;&quot;evil&quot;');
    expect(out).not.toContain('<b>');
  });
});

describe('dayDistanceChart', () => {
  const rows: DayDistanceRow[] = [
    {
      date: '2026-07-20',
      label: 'ma. 20.7',
      distanceKm: 241.3,
      dayIndex: 0,
      selected: false,
    },
    {
      date: '2026-07-21',
      label: 'ti. 21.7',
      distanceKm: 228.8,
      dayIndex: 1,
      selected: true,
    },
  ];
  const svg = dayDistanceChart(rows);

  it('draws one bar per day in that day’s fixed color', () => {
    expect(svg.match(/class="day-bar"/g)).toHaveLength(2);
    expect(svg).toContain(DAY_COLORS[0]);
    expect(svg).toContain(DAY_COLORS[1]);
  });

  it('dims unselected days via opacity while keeping their hue', () => {
    expect(svg).toContain('opacity="0.35"');
    expect(svg).toContain('opacity="1"');
  });

  it('direct-labels the values', () => {
    expect(svg).toContain('241 km');
    expect(svg).toContain('229 km');
  });
});
