export const WHEELCHAIR_TENNIS = 'WHEELCHAIR_TENNIS';
export const BEACH_VOLLEYBALL = 'BEACH_VOLLEYBALL';
export const BEACH_TENNIS = 'BEACH_TENNIS';
export const VOLLEYBALL = 'VOLLEYBALL';
export const PICKLEBALL = 'PICKLEBALL';
export const PADEL = 'PADEL';
export const TENNIS = 'TENNIS';

// Curated KNOWN discipline vocabulary. `discipline` is an OPEN, sport-agnostic vocabulary
// (see planning/DISCIPLINE_EXTENSIBILITY.md) — DisciplineUnion accepts any string — but this
// tuple is the canonical known set used for autocomplete, normalization, and attr-audit
// near-match typo defense. Includes the racquet disciplines the published schema already
// enumerates (TENNIS, BEACH_TENNIS, WHEELCHAIR_TENNIS, PADEL, PICKLEBALL) plus first-class
// non-racquet additions (VOLLEYBALL, BEACH_VOLLEYBALL). Extend as new sports gain support.
export const disciplines = [
  TENNIS,
  BEACH_TENNIS,
  WHEELCHAIR_TENNIS,
  PADEL,
  PICKLEBALL,
  VOLLEYBALL,
  BEACH_VOLLEYBALL,
] as const;

export const disciplineConstants = {
  WHEELCHAIR_TENNIS,
  BEACH_VOLLEYBALL,
  BEACH_TENNIS,
  VOLLEYBALL,
  PICKLEBALL,
  PADEL,
  TENNIS,
} as const;
