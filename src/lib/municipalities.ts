/**
 * The 19 municipalities the trip touches, grouped by county, as documented in
 * raw/DATASET.md. Færder never appears in the published track data (the
 * redaction fence sits there) but is part of the documented list.
 */
export const MUNICIPALITIES_BY_COUNTY: ReadonlyArray<{
  county: string;
  municipalities: string[];
}> = [
  {
    county: 'Vestfold',
    municipalities: ['Færder', 'Tønsberg', 'Sandefjord', 'Larvik'],
  },
  {
    county: 'Telemark',
    municipalities: [
      'Porsgrunn',
      'Bamble',
      'Kragerø',
      'Nissedal',
      'Kviteseid',
      'Tokke',
      'Vinje',
      'Seljord',
      'Midt-Telemark',
      'Nome',
      'Skien',
    ],
  },
  {
    county: 'Agder',
    municipalities: ['Gjerstad', 'Åmli', 'Bykle', 'Valle'],
  },
];

export const ALL_MUNICIPALITIES: string[] = MUNICIPALITIES_BY_COUNTY.flatMap(
  (group) => group.municipalities,
);
