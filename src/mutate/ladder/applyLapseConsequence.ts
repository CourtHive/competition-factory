import { removeLadderParticipant } from '@Mutate/ladder/removeLadderParticipant';
import { mirrorStandingToScale } from '@Mutate/ladder/mirrorStandingToScale';
import { applyLadderMovement } from '@Mutate/ladder/applyLadderMovement';
import { getLadderOrdering } from '@Query/ladder/getLadderPolicy';
import { getLapses } from '@Query/ladder/getLapses';

import { DROP, FORFEIT, FORFEIT_POSITION, RANK, REMOVE } from '@Constants/ladderConstants';
import { INVALID_VALUES, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import type { LapseConsequence } from '@Constants/ladderConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type ConsequenceArgs = {
  /** The instant the consequence takes effect, and the instant lapses are counted at. */
  appliedAt: string;
  /** The lapsing participant — always the defender of a challenge. */
  participantId: string;
  /** Needed only for FORFEIT_POSITION: someone must receive the forfeited position. */
  challengerParticipantId?: string;
  tournamentRecord?: any;
  drawDefinition: any;
  structure: any;
  event?: any;
};

/**
 * Evaluates a participant's lapses and applies whatever the policy says they have earned.
 *
 * CALLED WHEN A CHALLENGE RESOLVES, never by a sweep (D8). That is why it takes the resolving
 * challenge's challenger: a forfeited position has to go to somebody, and only the challenge in
 * front of us knows who.
 *
 * Reports `{ applied: false }` when the allowance has not been passed — which is the common case
 * and not a failure. A caller can always call this and let the policy decide.
 */
export function applyLapseConsequence(
  params: ConsequenceArgs,
): ResultType & { applied?: boolean; consequence?: LapseConsequence; count?: number } {
  const { appliedAt, participantId } = params;
  if (!appliedAt || !participantId) return { error: INVALID_VALUES, info: 'appliedAt and participantId required' };

  const lapses = getLapses({ ...params, asOf: appliedAt });
  if (!lapses.exceeded) return { ...SUCCESS, applied: false, count: lapses.count };

  const shared = { ...SUCCESS, applied: true, consequence: lapses.consequence, count: lapses.count };

  if (lapses.consequence === REMOVE) {
    const result = removeLadderParticipant({
      ...params,
      reason: `lapse allowance exceeded (${lapses.count})`,
      removedAt: appliedAt,
      participantId,
    });
    return result.error ? result : shared;
  }

  if (lapses.consequence === FORFEIT_POSITION) {
    const { challengerParticipantId } = params;
    // A forfeited position is not vacated — it is TAKEN. Without a challenger there is nobody to
    // take it, and silently dropping the consequence would make the policy look enforced when it
    // was not.
    if (!challengerParticipantId) {
      return { error: INVALID_VALUES, info: 'FORFEIT_POSITION requires the challenger who is to take the position' };
    }
    const result = applyLadderMovement({
      ...params,
      defenderParticipantId: participantId,
      challengerParticipantId,
      trigger: FORFEIT,
    });
    return result.error ? result : shared;
  }

  if (lapses.consequence === DROP) {
    const result = dropPositions({ ...params, dropBy: lapses.dropPositions ?? 1 });
    return result.error ? result : shared;
  }

  return { ...SUCCESS, applied: false, count: lapses.count };
}

/**
 * Moves a participant DOWN the ladder, closing the gap above them.
 *
 * Distinct from a challenge movement: nobody won anything, so nobody takes their place — everyone
 * they pass simply moves up one. Dropping past the bottom lands on the bottom rather than erroring,
 * because a policy of "drop 5" on a 3-person ladder is clumsy configuration, not a failure state.
 */
function dropPositions(params: any): ResultType {
  const { participantId, structure, dropBy } = params;
  if (getLadderOrdering(params) !== RANK) return { ...SUCCESS }; // a RATING standing is derived

  const assignments = structure?.positionAssignments ?? [];
  const target = assignments.find((a: any) => a.participantId === participantId);
  if (!target) return { error: PARTICIPANT_NOT_FOUND };

  const from = target.drawPosition;
  const lowest = Math.max(...assignments.map((a: any) => a.drawPosition));
  const to = Math.min(from + dropBy, lowest);
  if (to === from) return { ...SUCCESS };

  const touched: any[] = [];
  for (const assignment of assignments) {
    if (assignment.drawPosition > from && assignment.drawPosition <= to) {
      assignment.drawPosition -= 1;
      touched.push(assignment);
    }
  }
  target.drawPosition = to;
  touched.push(target);

  mirrorStandingToScale({ ...params, touched });
  return { ...SUCCESS };
}
