import { disciplines } from '@Constants/disciplineConstants';

const KNOWN_DISCIPLINES = new Set<string>(disciplines);

// Normalize a discipline to its canonical form: trimmed, upper-cased, with runs of
// whitespace/hyphens collapsed to a single underscore — so 'beach volleyball',
// 'beach-volleyball', and 'BEACH_VOLLEYBALL' all become 'BEACH_VOLLEYBALL'.
//
// `discipline` is an OPEN, sport-agnostic vocabulary (see
// planning/DISCIPLINE_EXTENSIBILITY.md): an unrecognized-but-well-formed value is
// normalized and PASSES THROUGH — it is never rejected or coerced to a default here.
// Constraining to a whitelist is a policy concern (`allowedDisciplines`), not this helper.
export function normalizeDiscipline(discipline: any): any {
  if (typeof discipline !== 'string') return discipline;
  const trimmed = discipline.trim();
  if (!trimmed) return discipline;
  return trimmed.toUpperCase().replace(/[\s-]+/g, '_');
}

// True when the (normalized) value is one of the curated known disciplines. This is an
// advisory check for autocomplete / validation surfaces and attr-audit near-match
// guidance — NOT a hard gate. Use the `allowedDisciplines` policy to actually constrain.
export function isKnownDiscipline(discipline: any): boolean {
  return typeof discipline === 'string' && KNOWN_DISCIPLINES.has(normalizeDiscipline(discipline));
}

// Policy gate: is `discipline` permitted by an `allowedDisciplines` whitelist? An absent or
// empty whitelist means "no constraint" → allowed. Comparison is normalization-insensitive
// (short forms / casing / separators on either side match). This is how the OPEN vocabulary
// is constrained where a fixed list is required (e.g. a sanctioning tier's allowedDisciplines).
export function isDisciplineAllowed(discipline: any, allowedDisciplines?: any[]): boolean {
  if (!allowedDisciplines?.length) return true;
  const allowed = new Set(allowedDisciplines.map(normalizeDiscipline));
  return allowed.has(normalizeDiscipline(discipline));
}
