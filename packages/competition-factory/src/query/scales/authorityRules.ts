import { UNSPECIFIED } from '@Constants/pointsAuthorityConstants';

import type { RankingListAward } from '@Types/rankingTypes';

/**
 * A RANK LIST'S AUTHORITY RULES (CA 2026-11-08): which issuing authorities' awards it admits, and how much each one's
 * points count. A property of the consuming rank list, not of the policy that produced the awards
 * (docs: policies/rankingPolicy § Authority weighting at aggregation time). For example, a Tennis Europe hybrid list
 * admits ATP, ITF and Tennis Europe awards, and a federation's internal list might weight external authorities at 0.5.
 *
 * Moved here from courthive-rankings, which applied the same rules before calling `generateRankingList`, so every
 * consumer of a hybrid list gets them. An award with no `pointsAuthority` counts as `UNSPECIFIED`, as that service
 * stores it. Weights scale every point component an award carries, so its breakdown still sums to its points, and an
 * authority with no weight counts at 1. Stored awards are never changed: a weighted award is a copy.
 */
const POINT_COMPONENTS = ['points', 'positionPoints', 'perWinPoints', 'qualityWinPoints', 'bonusPoints', 'linePoints'];

export type AuthorityRules = {
  /** admit only awards whose issuing authority is listed (`UNSPECIFIED` for an award that names none) */
  authorityFilter?: string[];
  /** multiply each award's point components by its authority's weight (1 when unlisted) */
  authorityWeights?: Record<string, number>;
};

const authorityOf = (award: RankingListAward): string => award.pointsAuthority ?? UNSPECIFIED;

export function applyAuthorityRules(awards: RankingListAward[], rules: AuthorityRules = {}): RankingListAward[] {
  const { authorityFilter, authorityWeights } = rules;
  const admitted = authorityFilter?.length
    ? awards.filter((award) => authorityFilter.includes(authorityOf(award)))
    : awards;
  if (!authorityWeights) return admitted;
  return admitted.map((award) => weighted(award, authorityWeights[authorityOf(award)]));
}

function weighted(award: RankingListAward, weight?: number): RankingListAward {
  if (weight === undefined || weight === 1 || !Number.isFinite(weight)) return award;
  const copy: Record<string, unknown> = { ...award };
  for (const component of POINT_COMPONENTS) {
    if (typeof copy[component] === 'number') copy[component] = (copy[component] as number) * weight;
  }
  return copy as RankingListAward;
}
