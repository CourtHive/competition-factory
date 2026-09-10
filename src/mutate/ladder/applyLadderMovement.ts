import { getLadderMovement, getLadderOrdering, getLadderPolicy } from '@Query/ladder/getLadderPolicy';
import { isLadder } from '@Query/drawDefinition/isLadder';

import { mirrorStandingToScale } from '@Mutate/ladder/mirrorStandingToScale';
import { getResultAttestation } from '@Query/ladder/getResultAttestation';

import { FORFEIT, INSERTION, RANK, movementTriggers } from '@Constants/ladderConstants';
import type { MovementTrigger } from '@Constants/ladderConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  PARTICIPANT_NOT_FOUND,
  RESULT_NOT_VALIDATED,
} from '@Constants/errorConditionConstants';

type MovementArgs = {
  /** The instant the movement took effect — the scaleDate of the resulting standing. */
  appliedAt: string;
  /**
   * WHY the standing is moving, and the reason this is not a boolean.
   *
   * `RESULT` requires an attested result and derives everything from the matchUp. `FORFEIT` is a
   * declined challenge with no score at all. Naming the trigger is what stops "a score exists" being
   * mistaken for "a result was agreed" — see `getResultAttestation`.
   */
  trigger: MovementTrigger;
  /** Required for `RESULT`: the matchUp is the evidence, not the caller's assertion. */
  matchUpId?: string;
  /** Required for `FORFEIT`, which has no matchUp result to read participants from. */
  defenderParticipantId?: string;
  challengerParticipantId?: string;
  tournamentRecord?: any;
  drawDefinition: any;
  structure: any;
  event?: any;
};

/**
 * Resolves who moves and whether they may, from the trigger.
 *
 * The RESULT path deliberately takes NO caller opinion about the outcome: challenger, defender and
 * who prevailed all come off the matchUp, and the attestation gate is consulted here rather than
 * left to the call site. A caller cannot assert a win it has not evidenced.
 */
function resolveTrigger(params: MovementArgs): any {
  const { trigger, structure, matchUpId } = params;

  if (trigger === FORFEIT) {
    const { challengerParticipantId, defenderParticipantId } = params;
    if (!challengerParticipantId || !defenderParticipantId) {
      return { error: INVALID_VALUES, info: 'FORFEIT requires challenger and defender participantIds' };
    }
    // A forfeit is the defender declining; the challenger takes the position by definition.
    return { challengerParticipantId, defenderParticipantId, challengerPrevails: true };
  }

  if (!matchUpId) return { error: INVALID_VALUES, info: 'RESULT requires a matchUpId' };
  const matchUp = structure?.matchUps?.find((m: any) => m.matchUpId === matchUpId);
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };
  if (![1, 2].includes(matchUp.winningSide)) return { error: INVALID_VALUES, info: 'matchUp has no winningSide' };

  // THE GATE, and it speaks FIRST. A provisional score must never move a standing: on a published
  // ladder with self-reporting members, that is one player reordering the ladder unilaterally.
  //
  // Asked before the status check on purpose. An AWAITING_RESULT matchUp fails both, but "not
  // COMPLETED" merely restates the symptom while the attestation reason names the cause — whether
  // the score is unconfirmed, self-confirmed, disputed, or short of the policy's requirement.
  const policy = getLadderPolicy(params);
  const attestation = getResultAttestation({ matchUp, policy });
  if (!attestation.validated) return { error: RESULT_NOT_VALIDATED, info: attestation.reason };

  // Attested but not COMPLETED means the record disagrees with itself — refuse rather than proceed.
  if (matchUp.matchUpStatus !== COMPLETED) {
    return { error: INVALID_VALUES, info: `matchUp is ${matchUp.matchUpStatus}, not ${COMPLETED}` };
  }

  // side 1 is the challenger — issueChallenge writes it that way.
  const challengerParticipantId = matchUp.sides?.[0]?.participantId;
  const defenderParticipantId = matchUp.sides?.[1]?.participantId;
  if (!challengerParticipantId || !defenderParticipantId) return { error: PARTICIPANT_NOT_FOUND };

  return { challengerParticipantId, defenderParticipantId, challengerPrevails: matchUp.winningSide === 1 };
}

/**
 * Rearranges the standing after a challenge resolves, and mirrors the result to dated scale items.
 *
 * THE ONLY PLACE A LADDER STANDING MOVES. A win, a forfeited decline and an operator removal all
 * come through here, so the movement rule and the history it writes cannot diverge between paths.
 *
 * Under `RATING` ordering this does nothing and says so: the standing is derived from the rating
 * scale, `positionAssignments` is a projection, and there is no movement to apply. That early
 * return is why `getLadderOrdering` had to exist before any of this was written.
 */
export function applyLadderMovement(params: MovementArgs): ResultType & { moved?: boolean } {
  const { appliedAt, drawDefinition, structure } = params;

  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (!isLadder(drawDefinition.drawType)) return { error: INVALID_VALUES, info: 'requires a LADDER drawType' };
  if (!appliedAt) return { error: INVALID_VALUES, info: 'appliedAt is required' };
  if (!movementTriggers.includes(params.trigger)) {
    return { error: INVALID_VALUES, info: `trigger must be one of ${movementTriggers.join(' | ')}` };
  }

  const resolved = resolveTrigger(params);
  if (resolved.error) return resolved;
  const { challengerParticipantId, defenderParticipantId, challengerPrevails } = resolved;

  if (getLadderOrdering({ ...params }) !== RANK) {
    // Not a failure — a RATING ladder has no movement machinery by design.
    return { ...SUCCESS, moved: false };
  }

  // The defender keeps their position when they hold off the challenger; nobody else is affected.
  if (!challengerPrevails) return { ...SUCCESS, moved: false };

  const assignments = structure?.positionAssignments ?? [];
  const assignmentOf = (participantId: string) => assignments.find((a: any) => a.participantId === participantId);

  const challenger = assignmentOf(challengerParticipantId);
  const defender = assignmentOf(defenderParticipantId);
  if (!challenger || !defender) return { error: PARTICIPANT_NOT_FOUND };

  const from = challenger.drawPosition;
  const to = defender.drawPosition;
  // A ladder position is a rank: 1 is the top, so the challenger's number is the larger one.
  if (!(to < from)) return { error: INVALID_VALUES, info: 'challenger must occupy a lower rank than the defender' };

  const movement = getLadderMovement({ ...params });
  const touched: any[] = [];

  if (movement === INSERTION) {
    // The winner takes the defender's position and everyone from there down to the winner's old
    // position shifts one rank lower. A challenger winning from far below displaces a whole run.
    for (const assignment of assignments) {
      if (assignment.drawPosition >= to && assignment.drawPosition < from) {
        assignment.drawPosition += 1;
        touched.push(assignment);
      }
    }
    challenger.drawPosition = to;
    touched.push(challenger);
  } else {
    // SWAP — the two exchange positions and nobody else moves.
    challenger.drawPosition = to;
    defender.drawPosition = from;
    touched.push(challenger, defender);
  }

  mirrorStandingToScale({ ...params, touched });
  return { ...SUCCESS, moved: true };
}
