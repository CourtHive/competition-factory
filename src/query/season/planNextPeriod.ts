import { getTierMovement } from '@Query/tournaments/getTierMovement';
import { decorateResult } from '@Functions/global/decorateResult';
import { TierMovementEnum } from '@Types/tournamentTypes';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';
import type {
  Season,
  SeasonMovementOverride,
  SeasonMovementProposal,
  SeasonMovementRevision,
  SeasonMovementTie,
  SeasonPlacement,
  SeasonSubject,
} from '@Types/seasonTypes';

type PlanNextPeriodArgs = {
  season: Season;
  /** the period whose close the movement was computed for */
  periodId: string;
  /** the proposals to accept, usually `getSeasonMovement(...).proposals` */
  movements: SeasonMovementProposal[];
  /** the ties `getSeasonMovement` left undecided; each tied subject needs an override */
  tiedAtCut?: SeasonMovementTie[];
  /** operator decisions (S9) that replace a proposal or settle a tie; the last one given for a subject wins */
  overrides?: SeasonMovementOverride[];
};

export type PlanNextPeriodResult = ResultType & {
  /** the period after `periodId`, when the season has one; absent when the next placements open a new season */
  nextPeriodId?: string;
  placements?: SeasonPlacement[];
  /** every proposal an override changed, and every tie an override settled */
  revisions?: SeasonMovementRevision[];
};

const subjectKey = (subject: SeasonSubject) => `${subject.subjectType}:${subject.subjectId}`;

/**
 * Turns accepted movement into the next period's placements. Pure: it returns the placements and never writes them
 * into the season. Overrides are applied on top of the proposals and returned as `revisions`, so a decision that
 * departs from the declared rule stays visible. A tied subject without an override is an error, not a guess.
 */
export function planNextPeriod(params: PlanNextPeriodArgs): PlanNextPeriodResult {
  const stack = 'planNextPeriod';
  const { season, periodId, movements = [], tiedAtCut = [], overrides = [] } = params;
  const period = season?.periods?.find((p) => p.periodId === periodId);
  if (!period) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { periodId },
      info: 'unknown periodId',
      stack,
    });
  }
  const tiers = new Map(season.tiers.map((tier) => [tier.tierId, tier]));
  const unknownTier = overrides.find((override) => override.toTierId !== undefined && !tiers.has(override.toTierId));
  if (unknownTier) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { override: unknownTier },
      info: 'unknown toTierId',
      stack,
    });
  }

  const proposalError = proposalsError(movements, tiers);
  if (proposalError) return decorateResult({ ...proposalError, stack });

  const overridden = new Map(overrides.map((override) => [subjectKey(override.subject), override]));
  const tiedFrom = new Map<string, string>();
  for (const tie of tiedAtCut) for (const subject of tie.subjects) tiedFrom.set(subjectKey(subject), tie.tierId);
  const unsettled = [...tiedFrom.keys()].filter((key) => !overridden.has(key));
  if (unsettled.length) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { unsettled },
      info: 'tied subjects need an override',
      stack,
    });
  }

  const placed = new Map<string, SeasonSubject[]>();
  const place = (tierId: string, subject: SeasonSubject) =>
    placed.set(tierId, [...(placed.get(tierId) ?? []), subject]);
  const revisions: SeasonMovementRevision[] = [];
  const proposed = new Set<string>();

  for (const proposal of movements) {
    const key = subjectKey(proposal.subject);
    proposed.add(key);
    const override = overridden.get(key);
    if (!override) {
      place(proposal.toTierId, proposal.subject);
      continue;
    }
    if (override.toTierId) place(override.toTierId, proposal.subject);
    if (override.toTierId !== proposal.toTierId) {
      revisions.push(revision({ override, fromTierId: proposal.fromTierId, proposedTierId: proposal.toTierId, tiers }));
    }
  }
  // overrides that settle a tie, or that place a subject with no proposal (an entrant)
  for (const override of overridden.values()) {
    const key = subjectKey(override.subject);
    if (proposed.has(key)) continue;
    if (override.toTierId) place(override.toTierId, override.subject);
    revisions.push(revision({ override, fromTierId: tiedFrom.get(key), tiers }));
  }

  const next = [...season.periods]
    .sort((a, b) => a.periodNumber - b.periodNumber)
    .find((p) => p.periodNumber > period.periodNumber);
  const placements = season.tiers
    .filter((tier) => placed.has(tier.tierId))
    .map((tier) => ({ tierId: tier.tierId, subjects: placed.get(tier.tierId) ?? [] }));

  return { nextPeriodId: next?.periodId, placements, revisions };
}

/**
 * Proposals are checked as overrides are (SEASON-101): a proposal to an unknown tier would silently drop its subject,
 * and a subject proposed twice would be placed twice, or into two tiers. Each refusal names what it found.
 */
function proposalsError(movements: SeasonMovementProposal[], tiers: Map<string, unknown>) {
  const unknownTier = movements.find((proposal) => !tiers.has(proposal.toTierId));
  if (unknownTier) {
    return { result: { error: INVALID_VALUES }, context: { proposal: unknownTier }, info: 'unknown toTierId' };
  }
  const bySubject = new Map<string, SeasonMovementProposal[]>();
  for (const proposal of movements) {
    const key = subjectKey(proposal.subject);
    bySubject.set(key, [...(bySubject.get(key) ?? []), proposal]);
  }
  const repeated = [...bySubject.values()].find((proposals) => proposals.length > 1);
  if (repeated) {
    const conflicting = new Set(repeated.map((proposal) => proposal.toTierId)).size > 1;
    return {
      result: { error: INVALID_VALUES },
      context: { subject: repeated[0].subject, proposals: repeated },
      info: conflicting ? 'conflicting proposals for one subject' : 'duplicate proposals for one subject',
    };
  }
  return undefined;
}

function revision({
  override,
  fromTierId,
  proposedTierId,
  tiers,
}: {
  override: SeasonMovementOverride;
  fromTierId?: string;
  proposedTierId?: string;
  tiers: Map<string, Season['tiers'][number]>;
}): SeasonMovementRevision {
  const fromTier = fromTierId ? tiers.get(fromTierId)?.tier : undefined;
  const toTier = override.toTierId ? tiers.get(override.toTierId)?.tier : undefined;
  const movement = fromTier || toTier ? getTierMovement({ fromTier, toTier }).movement : TierMovementEnum.HELD;
  return { ...override, fromTierId, proposedTierId, movement };
}
