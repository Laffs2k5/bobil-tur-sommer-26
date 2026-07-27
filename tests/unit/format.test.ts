import { describe, expect, it } from 'vitest';
import {
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatKm,
  formatSpeed,
  formatTime,
  formatTimestamp,
  modeLabel,
  weekday,
} from '../../src/lib/format';

describe('formatKm', () => {
  it('rounds large distances to whole km', () => {
    expect(formatKm(241.25)).toBe('241 km');
    expect(formatKm(660.36)).toBe('660 km');
    expect(formatKm(228.83)).toBe('229 km');
  });

  it('keeps one decimal with Norwegian comma under 10 km', () => {
    expect(formatKm(2.894)).toBe('2,9 km');
    expect(formatKm(0.62)).toBe('0,6 km');
    expect(formatKm(0)).toBe('0,0 km');
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes in Norwegian', () => {
    expect(formatDuration(800)).toBe('13 t 20 min');
    expect(formatDuration(865.78)).toBe('14 t 26 min');
    expect(formatDuration(62)).toBe('1 t 2 min');
  });

  it('drops the zero part', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 t');
    expect(formatDuration(0)).toBe('0 min');
  });
});

describe('formatSpeed', () => {
  it('rounds fast speeds and keeps a decimal for slow ones', () => {
    expect(formatSpeed(88.4)).toBe('88 km/t');
    expect(formatSpeed(5.36)).toBe('5,4 km/t');
  });
});

describe('day and timestamp formatting (Europe/Oslo wall time)', () => {
  it('computes weekdays without any timezone influence', () => {
    expect(weekday('2026-07-20')).toBe('mandag');
    expect(weekday('2026-07-24')).toBe('fredag');
    expect(weekday('2026-07-26')).toBe('søndag');
  });

  it('formats long and short day labels', () => {
    expect(formatDayLong('2026-07-20')).toBe('mandag 20. juli');
    expect(formatDayShort('2026-07-22')).toBe('on. 22.7');
  });

  it('rejects non-date strings', () => {
    expect(() => formatDayLong('juli 20')).toThrow(/Not a YYYY-MM-DD/);
  });

  it('reads timestamps as local wall time, never converting through UTC', () => {
    // 00:40 local is 22:40Z the previous day; conversion would show 22. juli.
    expect(formatTimestamp('2026-07-23T00:40:00.000+02:00')).toBe(
      '23. juli 00:40',
    );
    expect(formatTimestamp('2026-07-20T14:02:41.000+02:00')).toBe(
      '20. juli 14:02',
    );
    expect(formatTime('2026-07-20T21:46:24.000+02:00')).toBe('21:46');
  });
});

describe('modeLabel', () => {
  it('maps the three known modes to Norwegian and passes unknowns through', () => {
    expect(modeLabel('IN_PASSENGER_VEHICLE')).toBe('Bil');
    expect(modeLabel('WALKING')).toBe('Til fots');
    expect(modeLabel('CYCLING')).toBe('Sykkel');
    expect(modeLabel('FLYING')).toBe('FLYING');
  });
});
