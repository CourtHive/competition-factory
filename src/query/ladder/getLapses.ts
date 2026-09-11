import { addDaysIso, getChallengeState } from '@Query/ladder/getChallengeState';
import { resolveLadderStructure } from '@Query/ladder/resolveLadderContext';
import { getLadderPolicy } from '@Query/ladder/getLadderPolicy';

import { CONSECUTIVE, DECLINE, EXPIRY, FORFEIT_POSITION, ROLLING, UNPLAYED } from '@Constants/ladderConstants';
import { AWAITING_RESULT, CHALLENGED, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CHALLENGE_ACCEPTED, CHALLENGE_DECLINED, CHALLENGE_ISSUED } from '@Constants/ladderConstants';
import type { LapseConsequence, LapseKind } from '@Constants/ladderConstants';
import type { LadderPolicy, LapsePolicy } from '@Types/ladderTypes';

type LapsesArgs = {
  /** The instant to judge against — expiry and play-by are derived, never stored. */
  asOf: string;
  participantId: string;
  tournamentRecord?: any;
  drawDefinition?: any;
  /** Optional: resolved from `drawDefinition` when absent, so an engine caller can pass `drawId`. */
  structure?: any;
  structureId?: string;
  event?: any;
};

export type Lapse = { kind: LapseKind; matchUpId: string; at: string };

export type Lapses = {
  lapses: Lapse[];
  count: number;
  allowance: number;
  /** True when the count has passed the allowance and a consequence is due. */
  exceeded: boolean;
  consequence?: LapseConsequence;
  dropPositions?: number;
};

const itemDate = (matchUp: any, itemType: string): string | undefined =>
  (matchUp?.timeItems ?? [])
    .filter((item: any) => item.itemType === itemType)
    .map((item: any) => item.itemDate)
    .sort((a: string, b: string) => a.localeCompare(b))
    .at(-1);

/** `declineForfeitsPosition` is sugar; an explicit lapsePolicy wins where both are present. */
function effectiveLapsePolicy(policy: LadderPolicy): LapsePolicy {
  if (policy.lapsePolicy) return policy.lapsePolicy;
  if (policy.declineForfeitsPosition) return { allowance: 0, consequence: FORFEIT_POSITION };
  return {};
}

/**
 * What a participant has failed to do, counted at an instant.
 *
 * A lapse is always judged from the DEFENDER'S side — side 2 of a challenge. Being challenged and
 * failing to meet it is the offence; issuing challenges is not.
 *
 * All three kinds default to counting. Leaving `EXPIRY` out makes the policy avoidable: the
 * defender simply never answers, and nothing is recorded against them.
 */
export function getLapses(params: LapsesArgs): Lapses {
  const { asOf, participantId } = params;
  const structure = resolveLadderStructure(params);
  const policy = getLadderPolicy(params);
  const lapsePolicy = effectiveLapsePolicy(policy);
  const kinds: LapseKind[] = lapsePolicy.countsAsLapse ?? [DECLINE, EXPIRY, UNPLAYED];

  const defended = (structure?.matchUps ?? []).filter((m: any) => m.sides?.[1]?.participantId === participantId);

  const lapses: Lapse[] = [];
  for (const matchUp of defended) {
    const declinedAt = itemDate(matchUp, CHALLENGE_DECLINED);
    if (declinedAt && kinds.includes(DECLINE)) {
      lapses.push({ kind: DECLINE, matchUpId: matchUp.matchUpId, at: declinedAt });
      continue;
    }

    if (matchUp.matchUpStatus === CHALLENGED && kinds.includes(EXPIRY)) {
      const { state, expiresAt } = getChallengeState({ matchUp, policy, asOf });
      // Derived, exactly as everywhere else: an unanswered challenge past its window IS an expiry.
      if (state === 'EXPIRED' && expiresAt) lapses.push({ kind: EXPIRY, matchUpId: matchUp.matchUpId, at: expiresAt });
      continue;
    }

    // Accepted and then never played. COMPLETED and AWAITING_RESULT both mean someone turned up.
    const acceptedAt = itemDate(matchUp, CHALLENGE_ACCEPTED);
    const played = [COMPLETED, AWAITING_RESULT].includes(matchUp.matchUpStatus);
    if (acceptedAt && !played && matchUp.matchUpStatus === TO_BE_PLAYED && kinds.includes(UNPLAYED)) {
      const playByDays = policy.playByDays;
      if (typeof playByDays === 'number') {
        const dueBy = addDaysIso(acceptedAt, playByDays);
        if (asOf >= dueBy) lapses.push({ kind: UNPLAYED, matchUpId: matchUp.matchUpId, at: dueBy });
      }
    }
  }

  lapses.sort((a, b) => a.at.localeCompare(b.at));

  let counted = lapses;
  if (lapsePolicy.window === ROLLING && typeof lapsePolicy.windowDays === 'number') {
    const from = addDaysIso(asOf, -lapsePolicy.windowDays);
    counted = lapses.filter((lapse) => lapse.at >= from);
  } else if (lapsePolicy.window === CONSECUTIVE) {
    // Only the unbroken run up to now: a lapse followed by a played match is forgiven.
    counted = consecutiveTail({ lapses, defended, kinds });
  }

  const allowance = lapsePolicy.allowance ?? 0;
  return {
    lapses: counted,
    count: counted.length,
    allowance,
    exceeded: !!lapsePolicy.consequence && counted.length > allowance,
    consequence: lapsePolicy.consequence,
    dropPositions: lapsePolicy.dropPositions,
  };
}

/**
 * The trailing run of lapses with no completed match after it. Ordered by the challenge's own
 * chronology rather than by when it was recorded, so a late-entered result still breaks the run.
 */
function consecutiveTail({ lapses, defended }: any): Lapse[] {
  const lastPlayed = defended
    .filter((m: any) => [COMPLETED, AWAITING_RESULT].includes(m.matchUpStatus))
    .map((m: any) => itemDate(m, CHALLENGE_ACCEPTED) ?? itemDate(m, CHALLENGE_ISSUED))
    .filter(Boolean)
    .sort((a: string, b: string) => a.localeCompare(b))
    .at(-1);
  return lastPlayed ? lapses.filter((lapse: Lapse) => lapse.at > lastPlayed) : lapses;
}
