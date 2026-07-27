import { describe, expect, it } from 'vitest';
import {
  haversineKm,
  localDate,
  localHM,
  minutesBetween,
  parseLatLng,
} from '../../src/data/parse';

describe('parseLatLng', () => {
  it('parses degree-symbol strings from the timeline', () => {
    expect(parseLatLng('59.2905015°, 10.3911224°')).toEqual({
      lat: 59.2905015,
      lng: 10.3911224,
    });
  });

  it('parses negative coordinates and plain numbers without degree symbols', () => {
    expect(parseLatLng('-33.9, -70.6')).toEqual({ lat: -33.9, lng: -70.6 });
    expect(parseLatLng('59°,10°')).toEqual({ lat: 59, lng: 10 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseLatLng('  59.5° ,  9.25°  ')).toEqual({ lat: 59.5, lng: 9.25 });
  });

  it('rejects garbage strings', () => {
    expect(() => parseLatLng('not a coordinate')).toThrow(/Unparseable/);
    expect(() => parseLatLng('')).toThrow(/Unparseable/);
    expect(() => parseLatLng('59.29')).toThrow(/Unparseable/);
  });

  it('rejects out-of-range coordinates', () => {
    expect(() => parseLatLng('91°, 10°')).toThrow(/out of range/);
    expect(() => parseLatLng('59°, 181°')).toThrow(/out of range/);
  });
});

describe('localDate / localHM', () => {
  it('reads the local date straight off the ISO string, never via UTC', () => {
    // 23:55 local on the 21st is 21:55Z; a UTC conversion would keep the 21st
    // here, but for +02:00 early-morning times it would shift the day back.
    expect(localDate('2026-07-21T23:55:00.000+02:00')).toBe('2026-07-21');
    expect(localDate('2026-07-22T00:40:00.000+02:00')).toBe('2026-07-22');
  });

  it('reads local wall-clock HH:MM', () => {
    expect(localHM('2026-07-20T14:02:41.000+02:00')).toBe('14:02');
  });

  it('rejects non-ISO strings', () => {
    expect(() => localDate('20/07/2026')).toThrow(/Not an ISO/);
    expect(() => localHM('yesterday')).toThrow(/Not an ISO/);
  });
});

describe('minutesBetween', () => {
  it('computes whole and fractional minutes', () => {
    expect(
      minutesBetween('2026-07-20T12:00:00+02:00', '2026-07-20T13:20:00+02:00'),
    ).toBe(80);
    expect(
      minutesBetween('2026-07-20T12:00:00+02:00', '2026-07-20T12:00:30+02:00'),
    ).toBeCloseTo(0.5);
  });

  it('is offset-aware across mixed offsets', () => {
    expect(
      minutesBetween('2026-07-20T12:00:00+02:00', '2026-07-20T11:00:00Z'),
    ).toBe(60);
  });

  it('rejects unparseable timestamps', () => {
    expect(() => minutesBetween('bogus', '2026-07-20T12:00:00+02:00')).toThrow(
      /Unparseable/,
    );
  });
});

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    const p = { lat: 59.29, lng: 10.39 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it('matches a known distance (Oslo–Bergen ≈ 305 km)', () => {
    const oslo = { lat: 59.9139, lng: 10.7522 };
    const bergen = { lat: 60.3913, lng: 5.3221 };
    expect(haversineKm(oslo, bergen)).toBeGreaterThan(295);
    expect(haversineKm(oslo, bergen)).toBeLessThan(315);
  });
});
