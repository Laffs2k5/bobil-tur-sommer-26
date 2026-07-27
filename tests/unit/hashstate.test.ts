import { describe, expect, it } from 'vitest';
import { parseHashState, serializeHashState } from '../../src/lib/hashstate';
import { ALL_MUNICIPALITIES } from '../../src/lib/municipalities';
import { TRIP_DAYS } from './fixtures';

describe('parseHashState', () => {
  it('parses a full valid hash', () => {
    const state = parseHashState(
      '#dag=2026-07-21&kommuner=Vinje,Tokke',
      TRIP_DAYS,
      ALL_MUNICIPALITIES,
    );
    expect(state).toEqual({
      day: '2026-07-21',
      municipalities: ['Vinje', 'Tokke'],
    });
  });

  it('handles percent-encoded Norwegian names', () => {
    const hash = serializeHashState({
      day: null,
      municipalities: ['Åmli', 'Kragerø', 'Færder'],
    });
    const state = parseHashState(hash, TRIP_DAYS, ALL_MUNICIPALITIES);
    expect(state.municipalities).toEqual(['Åmli', 'Kragerø', 'Færder']);
  });

  it('drops unknown days and municipalities', () => {
    const state = parseHashState(
      '#dag=2026-07-19&kommuner=Oslo,Vinje,',
      TRIP_DAYS,
      ALL_MUNICIPALITIES,
    );
    expect(state.day).toBeNull();
    expect(state.municipalities).toEqual(['Vinje']);
  });

  it('tolerates garbage, empty hashes and duplicates', () => {
    expect(parseHashState('', TRIP_DAYS, ALL_MUNICIPALITIES)).toEqual({
      day: null,
      municipalities: [],
    });
    expect(parseHashState('#?!&==', TRIP_DAYS, ALL_MUNICIPALITIES)).toEqual({
      day: null,
      municipalities: [],
    });
    expect(
      parseHashState(
        '#dag=not-a-date&kommuner=Vinje,Vinje',
        TRIP_DAYS,
        ALL_MUNICIPALITIES,
      ).municipalities,
    ).toEqual(['Vinje']);
  });
});

describe('serializeHashState', () => {
  it('serializes day and municipalities', () => {
    expect(
      serializeHashState({ day: '2026-07-22', municipalities: [] }),
    ).toBe('#dag=2026-07-22');
    expect(serializeHashState({ day: null, municipalities: [] })).toBe('');
  });

  it('round-trips through parse', () => {
    const state = {
      day: '2026-07-24',
      municipalities: ['Midt-Telemark', 'Skien'],
    };
    const parsed = parseHashState(
      serializeHashState(state),
      TRIP_DAYS,
      ALL_MUNICIPALITIES,
    );
    expect(parsed).toEqual(state);
  });
});
