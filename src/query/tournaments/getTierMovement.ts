// constants and types
import { TierClassification, TierMovementEnum, TierMovementUnion } from '@Types/tournamentTypes';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';

type GetTierMovementArgs = {
  /** the competitor's tier in the EARLIER season; absent means they were not in it */
  fromTier?: TierClassification;
  /** the competitor's tier in the LATER season; absent means they are not in it */
  toTier?: TierClassification;
  /** supplies `tierToLevel`, which orders a federation's tier vocabulary */
  policyDefinitions?: PolicyDefinitions;
};

/**
 * Resolve a tier's sortable level: the ranking policy's `tierToLevel[system][value]` mapping, else the
 * tier's own `numericRank`. Lower is more prestigious — the same convention `getEventRankingPoints`
 * already uses, so a federation that stamps `numericRank` at ingest needs no policy at all.
 */
function resolveLevel(tier: TierClassification | undefined, policyDefinitions?: PolicyDefinitions): number | undefined {
  if (!tier?.system || !tier?.value) return undefined;
  const policy: any = policyDefinitions?.[POLICY_TYPE_RANKING_POINTS];
  return policy?.tierToLevel?.[tier.system]?.[tier.value] ?? tier.numericRank;
}

/**
 * Derives how a competitor moved between the tiers of two consecutive seasons.
 *
 * Pure comparison of two {@link TierClassification}s — it takes the tiers, not the records they came
 * from, so it serves a league season assembled anywhere (the season lattice itself is declared outside
 * CODES). It never guesses a direction it cannot evidence: tiers from different systems, or tiers whose
 * level no policy resolves, come back `REALIGNED` rather than being forced into a promotion.
 */
export function getTierMovement(params: GetTierMovementArgs): {
  movement: TierMovementUnion;
  fromLevel?: number;
  toLevel?: number;
} {
  const { fromTier, toTier, policyDefinitions } = params ?? {};

  if (!fromTier && !toTier) return { movement: TierMovementEnum.REALIGNED };
  if (!toTier) return { movement: TierMovementEnum.WITHDRAWN };
  if (!fromTier) return { movement: TierMovementEnum.ENTERED };

  const sameTier = fromTier.system === toTier.system && fromTier.value === toTier.value;
  if (sameTier) return { movement: TierMovementEnum.HELD };

  // tiers from different systems are not on one scale: "PPA Gold" and "USTA Level 3" cannot be
  // ordered against each other, and a level coincidence between them would be meaningless
  if (fromTier.system !== toTier.system) return { movement: TierMovementEnum.REALIGNED };

  const fromLevel = resolveLevel(fromTier, policyDefinitions);
  const toLevel = resolveLevel(toTier, policyDefinitions);

  if (fromLevel === undefined || toLevel === undefined) return { movement: TierMovementEnum.REALIGNED };
  if (toLevel === fromLevel) return { movement: TierMovementEnum.HELD, fromLevel, toLevel };

  const movement = toLevel < fromLevel ? TierMovementEnum.PROMOTED : TierMovementEnum.RELEGATED;
  return { movement, fromLevel, toLevel };
}
