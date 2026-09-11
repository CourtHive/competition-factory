import { normalizeDiscipline } from '@Helpers/coercedDiscipline';

// constants and types
import { DisciplineUnion } from '@Types/tournamentTypes';
import { SINGLES, DOUBLES, TEAM } from '@Constants/matchUpTypes';
import {
  TENNIS,
  BEACH_TENNIS,
  WHEELCHAIR_TENNIS,
  PADEL,
  PICKLEBALL,
  VOLLEYBALL,
  BEACH_VOLLEYBALL,
} from '@Constants/disciplineConstants';

// A discipline's sport profile — the seam through which sport-specific behavior keys off
// `event.discipline` (see planning/DISCIPLINE_EXTENSIBILITY.md, Phase 3). Intentionally
// minimal to start; extend the shape as real per-sport behavior lands (court model, stat
// definitions, gender applicability, renderers, …).
export interface DisciplineProfile {
  discipline: DisciplineUnion; // canonical (normalized) discipline
  matchUpTypes?: string[]; // applicable matchUpTypes (SINGLES / DOUBLES / TEAM / …)
  defaultMatchUpFormat?: string; // default scoring-format code, when one is well-established
}

// Built-in profiles for the curated known disciplines. These are sensible DEFAULTS a
// provider can override at runtime via `registerDisciplineProfile`; the vocabulary itself
// is open, so a discipline with no registered profile simply resolves to `undefined`.
const BUILT_IN: DisciplineProfile[] = [
  { discipline: TENNIS, matchUpTypes: [SINGLES, DOUBLES], defaultMatchUpFormat: 'SET3-S:6/TB7' },
  { discipline: BEACH_TENNIS, matchUpTypes: [SINGLES, DOUBLES] },
  { discipline: WHEELCHAIR_TENNIS, matchUpTypes: [SINGLES, DOUBLES] },
  { discipline: PADEL, matchUpTypes: [DOUBLES] }, // padel is played 2v2
  { discipline: PICKLEBALL, matchUpTypes: [SINGLES, DOUBLES] },
  { discipline: VOLLEYBALL, matchUpTypes: [TEAM] },
  { discipline: BEACH_VOLLEYBALL, matchUpTypes: [DOUBLES] }, // beach volleyball is 2-person
];

const registry = new Map<string, DisciplineProfile>();

// Register (or override) a discipline's profile at runtime — how a provider adds a sport's
// behavior without a factory release. The discipline key is normalized so lookups are
// casing/separator-insensitive.
export function registerDisciplineProfile(profile: DisciplineProfile): void {
  const discipline = normalizeDiscipline(profile.discipline);
  registry.set(discipline, { ...profile, discipline });
}

for (const profile of BUILT_IN) registerDisciplineProfile(profile);

// Resolve the profile for a discipline (normalization-insensitive). Returns `undefined`
// for a discipline with no registered profile — the open vocabulary means that is a normal,
// non-error state, so callers should fall back rather than assume a profile exists.
export function getDisciplineProfile(params: { discipline: DisciplineUnion }): DisciplineProfile | undefined {
  if (typeof params?.discipline !== 'string') return undefined;
  return registry.get(normalizeDiscipline(params.discipline));
}

// All registered profiles (built-ins + any runtime registrations), for enumeration.
export function listDisciplineProfiles(): DisciplineProfile[] {
  return [...registry.values()];
}
