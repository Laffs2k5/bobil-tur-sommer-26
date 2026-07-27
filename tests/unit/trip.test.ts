import { describe, expect, it } from 'vitest';
import {
  googleMapsUrl,
  isOvernight,
  parseTrip,
  stopsForDay,
  wakeupStopForDay,
} from '../../src/data/trip';
import type { TripGeoJson } from '../../src/data/types';
import { geojson, TRIP_DAYS } from './fixtures';

const { tracks, stops } = parseTrip(geojson);

describe('parseTrip (real data)', () => {
  it('parses 5 day tracks and 20 stops', () => {
    expect(tracks).toHaveLength(5);
    expect(stops).toHaveLength(20);
  });

  it('orders tracks by date and stops chronologically', () => {
    expect(tracks.map((t) => t.date)).toEqual(TRIP_DAYS);
    for (let i = 1; i < stops.length; i++) {
      expect(
        stops[i]!.start.localeCompare(stops[i - 1]!.start),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('carries the day titles from the dataset', () => {
    expect(tracks.map((t) => t.title)).toEqual([
      'Tønsberg – Jettegrytene – Vinje',
      'Dagstur til Setesdal',
      'Seljord – Bø Sommarland',
      'Norsjø Kabelpark',
      'Hjemover over Ulefoss og Skien',
    ]);
  });

  it('converts LineString positions to {lat,lng} with matching point counts', () => {
    for (const track of tracks) {
      expect(track.coordinates.length).toBe(track.points);
      for (const c of track.coordinates) {
        expect(c.lat).toBeGreaterThan(58);
        expect(c.lat).toBeLessThan(60.2);
        expect(c.lng).toBeGreaterThan(6.5);
        expect(c.lng).toBeLessThan(11);
      }
    }
  });

  it('flags exactly the four overnight stops (850–1250 min band)', () => {
    const overnight = stops.filter((s) => s.overnight);
    expect(overnight.map((s) => [s.label, s.durationMin])).toEqual([
      ['Groven Camping og Hyttegrend, Åmot', 865],
      ['Garvikstrondi Camping', 911],
      ['Åsgrav Family Camping, Bø', 939],
      ['First Camp Norsjø / Norsjø Kabelpark, Akkerhaugen', 1221],
    ]);
  });

  it('keeps the two separate same-campsite stays on 23 July distinct', () => {
    const norsjo = stops.filter((s) =>
      s.label.startsWith('First Camp Norsjø'),
    );
    expect(norsjo).toHaveLength(2);
    expect(norsjo[0]!.start).not.toBe(norsjo[1]!.start);
  });

  it('rejects malformed feature geometry', () => {
    const badTrack = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [10, 59] },
          properties: { kind: 'track', date: '2026-07-20' },
        },
      ],
    } as unknown as TripGeoJson;
    expect(() => parseTrip(badTrack)).toThrow(/not a LineString/);

    const badStop = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: { kind: 'stop', label: 'X' },
        },
      ],
    } as unknown as TripGeoJson;
    expect(() => parseTrip(badStop)).toThrow(/not a Point/);
  });
});

describe('isOvernight', () => {
  it('uses the documented 850–1250 minute band inclusively', () => {
    expect(isOvernight(849)).toBe(false);
    expect(isOvernight(850)).toBe(true);
    expect(isOvernight(1250)).toBe(true);
    expect(isOvernight(1251)).toBe(false);
  });
});

describe('googleMapsUrl', () => {
  it('links verified stops via their place_id', () => {
    const verified = stops.find((s) => s.verified)!;
    const url = googleMapsUrl(verified);
    expect(url).toContain('https://www.google.com/maps/search/?api=1');
    expect(url).toContain(encodeURIComponent(verified.placeId));
  });

  it('never links unverified stops, whose place_id may be wrong', () => {
    const unverified = stops.filter((s) => !s.verified);
    expect(unverified).toHaveLength(8);
    for (const stop of unverified) {
      expect(googleMapsUrl(stop)).toBeNull();
    }
  });

  it('has the documented 12/8 verified split', () => {
    expect(stops.filter((s) => s.verified)).toHaveLength(12);
  });
});

describe('stopsForDay', () => {
  it('filters by local date with the documented per-day counts', () => {
    const counts = TRIP_DAYS.map((day) => stopsForDay(stops, day).length);
    expect(counts).toEqual([4, 7, 3, 3, 3]);
  });

  it('returns everything for the all-days selection', () => {
    expect(stopsForDay(stops, null)).toHaveLength(20);
  });

  it('assigns an overnight stop to the day it started', () => {
    // Groven Camping runs 21:46 on the 20th to 12:10 on the 21st.
    const groven = stopsForDay(stops, '2026-07-20').find((s) =>
      s.label.startsWith('Groven'),
    );
    expect(groven).toBeDefined();
  });
});

describe('wakeupStopForDay', () => {
  it('derives each day start from the previous evening’s overnight stop', () => {
    expect(wakeupStopForDay(stops, '2026-07-21')!.label).toBe(
      'Groven Camping og Hyttegrend, Åmot',
    );
    expect(wakeupStopForDay(stops, '2026-07-22')!.label).toBe(
      'Garvikstrondi Camping',
    );
    expect(wakeupStopForDay(stops, '2026-07-23')!.label).toBe(
      'Åsgrav Family Camping, Bø',
    );
    expect(wakeupStopForDay(stops, '2026-07-24')!.label).toBe(
      'First Camp Norsjø / Norsjø Kabelpark, Akkerhaugen',
    );
  });

  it('has no wakeup for the first trip day (start is inside the privacy fence)', () => {
    expect(wakeupStopForDay(stops, '2026-07-20')).toBeNull();
  });

  it('returns null for the all-days view and unknown days', () => {
    expect(wakeupStopForDay(stops, null)).toBeNull();
    expect(wakeupStopForDay(stops, '2026-07-25')).toBeNull();
  });

  it('never picks a short daytime stop, only the overnight band', () => {
    // The 23rd has a 223-min First Camp visit ending that same day; the
    // wakeup for the 23rd must instead be Åsgrav from the night before.
    const wakeup = wakeupStopForDay(stops, '2026-07-23')!;
    expect(wakeup.overnight).toBe(true);
    expect(wakeup.date).toBe('2026-07-22');
  });
});
