import { describe, expect, it } from 'vitest';
import { parseTrip } from '../../src/data/trip';
import { stopPopupHtml } from '../../src/lib/popup';
import { MUNICIPALITIES_BY_COUNTY, ALL_MUNICIPALITIES } from '../../src/lib/municipalities';
import { geojson } from './fixtures';

const { stops } = parseTrip(geojson);

describe('stopPopupHtml', () => {
  it('shows label, municipality, times and duration for a verified stop', () => {
    const st1 = stops.find((s) => s.label.startsWith('St1'))!;
    const html = stopPopupHtml(st1);
    expect(html).toContain('St1 Lasses, Stathelle');
    expect(html).toContain('Bamble kommune');
    expect(html).toContain('Ankomst 20. juli 14:02');
    expect(html).toContain('Avreise 20. juli 15:09');
    expect(html).toContain('Varighet 1 t 6 min');
    expect(html).toContain('Åpne i Google Maps');
    expect(html).toContain(st1.placeId);
  });

  it('presents unverified stops as approximate localities without a link', () => {
    const unverified = stops.find((s) => !s.verified)!;
    const html = stopPopupHtml(unverified);
    expect(html).toContain('Omtrentlig stedsangivelse');
    expect(html).not.toContain('google.com/maps');
  });

  it('badges overnight stops', () => {
    const overnight = stops.find((s) => s.overnight)!;
    const regular = stops.find((s) => !s.overnight)!;
    expect(stopPopupHtml(overnight)).toContain('Overnatting');
    expect(stopPopupHtml(regular)).not.toContain('popup-overnight');
  });

  it('spans midnight correctly for overnight stops (local wall time)', () => {
    const groven = stops.find((s) => s.label.startsWith('Groven'))!;
    const html = stopPopupHtml(groven);
    expect(html).toContain('Ankomst 20. juli 21:46');
    expect(html).toContain('Avreise 21. juli 12:10');
  });
});

describe('municipality list (raw/DATASET.md contract)', () => {
  it('contains the 19 documented municipalities across three counties', () => {
    expect(ALL_MUNICIPALITIES).toHaveLength(19);
    expect(MUNICIPALITIES_BY_COUNTY.map((g) => g.county)).toEqual([
      'Vestfold',
      'Telemark',
      'Agder',
    ]);
    expect(ALL_MUNICIPALITIES).toContain('Færder');
    expect(ALL_MUNICIPALITIES).toContain('Midt-Telemark');
  });

  it('covers every municipality named in the trip data', () => {
    for (const feature of geojson.features) {
      if (feature.properties.kind === 'track') {
        for (const m of feature.properties.municipalities) {
          expect(ALL_MUNICIPALITIES).toContain(m);
        }
      } else {
        expect(ALL_MUNICIPALITIES).toContain(feature.properties.municipality);
      }
    }
  });
});
