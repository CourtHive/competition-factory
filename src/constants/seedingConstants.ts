import type { SeedingBasisUnion } from '@Types/tournamentTypes';
import { ORGANISER_DISCRETION, PROTECTED_RANKING, RANKING, RATING } from './seedingBasisValues';

// primitive seeding-basis consts are generated from SeedingBasisEnum (see
// seedingBasisValues.ts); the semantic groupings below are hand-authored.
export * from './seedingBasisValues';

export const seedingBasisConstants = {
  ORGANISER_DISCRETION,
  PROTECTED_RANKING,
  RANKING,
  RATING,
} as const;

/**
 * Bases a governing body typically permits to claim an ADDITIONAL seed — one above the count
 * `seedsCountThresholds` yields. `RANKING` and `RATING` are excluded because a seed on the
 * ordinary basis is not additional; it is simply a seed, and raising the count for it is what
 * `seedsCountThresholds` is for.
 *
 * Offered as a convenience for authoring `SeedingPolicy.additionalSeeds.bases`. It is NOT a
 * factory default: which bases a body permits is that body's decision, and an `additionalSeeds`
 * with no `bases` permits any.
 */
export const ADDITIONAL_SEED_BASES: SeedingBasisUnion[] = [ORGANISER_DISCRETION, PROTECTED_RANKING];
