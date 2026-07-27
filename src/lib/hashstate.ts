/**
 * Shareable view state in the URL hash: `#dag=2026-07-21&kommuner=Vinje,Tokke`.
 * Pure string functions so the parsing survives any garbage input.
 */
export interface ViewState {
  day: string | null;
  municipalities: string[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseHashState(
  hash: string,
  validDays: string[],
  validMunicipalities: string[],
): ViewState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const rawDay = params.get('dag');
  const day =
    rawDay !== null && DAY_RE.test(rawDay) && validDays.includes(rawDay)
      ? rawDay
      : null;
  const municipalities = (params.get('kommuner') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => validMunicipalities.includes(name));
  return { day, municipalities: [...new Set(municipalities)] };
}

export function serializeHashState(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.day !== null) params.set('dag', state.day);
  if (state.municipalities.length > 0) {
    params.set('kommuner', state.municipalities.join(','));
  }
  const encoded = params.toString();
  return encoded === '' ? '' : `#${encoded}`;
}
