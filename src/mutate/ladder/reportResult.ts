import { getResultAttestation } from '@Query/ladder/getResultAttestation';
import { getLadderPolicy } from '@Query/ladder/getLadderPolicy';
import { addTimeItem } from '@Mutate/timeItems/addTimeItem';
import { isLadder } from '@Query/drawDefinition/isLadder';

import { RESULT_CONFIRMED, RESULT_DISPUTED, RESULT_SUBMITTED } from '@Constants/ladderConstants';
import { AWAITING_RESULT, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import { INVALID_VALUES, MATCHUP_NOT_FOUND, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';

type ReportArgs = {
  tournamentRecord?: any;
  drawDefinition: any;
  matchUpId: string;
  event?: any;
};

function resolve(params: ReportArgs) {
  const { drawDefinition, matchUpId } = params;
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (!isLadder(drawDefinition.drawType)) return { error: INVALID_VALUES, info: 'requires a LADDER drawType' };
  for (const structure of drawDefinition.structures ?? []) {
    const matchUp = structure.matchUps?.find((m: any) => m.matchUpId === matchUpId);
    if (matchUp) return { matchUp, structure };
  }
  return { error: MATCHUP_NOT_FOUND };
}

const sideParticipantIds = (matchUp: any): string[] =>
  (matchUp.sides ?? []).map((side: any) => side.participantId).filter(Boolean);

/**
 * A participant reports the score of a ladder match they played.
 *
 * The score lands on the matchUp so everyone can see it, but the status becomes `AWAITING_RESULT`
 * rather than `COMPLETED` — which is what that status has always meant, and what keeps a reported
 * score from being mistaken for an agreed one. `applyLadderMovement` will not touch a standing
 * until it is confirmed.
 */
export function submitResult(
  params: ReportArgs & { participantId: string; submittedAt: string; outcome: { winningSide: 1 | 2; score?: any } },
): ResultType {
  const resolved: any = resolve(params);
  if (resolved.error) return resolved;
  const { matchUp } = resolved;
  const { participantId, submittedAt, outcome } = params;

  if (!participantId || !submittedAt) return { error: INVALID_VALUES, info: 'participantId and submittedAt required' };
  if (![1, 2].includes(outcome?.winningSide)) return { error: INVALID_VALUES, info: 'outcome.winningSide required' };
  if (![TO_BE_PLAYED, AWAITING_RESULT].includes(matchUp.matchUpStatus)) {
    return { error: INVALID_VALUES, info: `cannot report a result on a ${matchUp.matchUpStatus} matchUp` };
  }
  // Only the people who played it. An operator correcting a score is a different action.
  if (!sideParticipantIds(matchUp).includes(participantId)) {
    return { error: INVALID_VALUES, info: 'only a participant in the matchUp may submit its result' };
  }

  matchUp.winningSide = outcome.winningSide;
  if (outcome.score) matchUp.score = outcome.score;
  matchUp.matchUpStatus = AWAITING_RESULT;

  addTimeItem({
    timeItem: { itemType: RESULT_SUBMITTED, itemValue: { participantId, outcome }, itemDate: submittedAt },
    element: matchUp,
  });

  return { ...SUCCESS };
}

/**
 * The other participant — or an operator — agrees the reported score, which is what makes it a
 * result. Only here does the matchUp become `COMPLETED` and the standing become movable.
 */
export function confirmResult(
  params: ReportArgs & { participantId?: string; operator?: boolean; confirmedAt: string },
): ResultType {
  const resolved: any = resolve(params);
  if (resolved.error) return resolved;
  const { matchUp, structure } = resolved;
  const { participantId, operator, confirmedAt } = params;

  if (!confirmedAt) return { error: INVALID_VALUES, info: 'confirmedAt is required' };
  if (!operator && !participantId) return { error: INVALID_VALUES, info: 'participantId or operator required' };
  if (matchUp.matchUpStatus !== AWAITING_RESULT) {
    return { error: INVALID_VALUES, info: `matchUp is ${matchUp.matchUpStatus}, not ${AWAITING_RESULT}` };
  }
  if (participantId && !operator && !sideParticipantIds(matchUp).includes(participantId)) {
    return { error: INVALID_VALUES, info: 'only a participant in the matchUp may confirm its result' };
  }

  addTimeItem({
    timeItem: { itemType: RESULT_CONFIRMED, itemValue: { participantId, operator: !!operator }, itemDate: confirmedAt },
    element: matchUp,
  });

  // Ask the attestation gate rather than assuming this confirmation was sufficient: the policy may
  // demand an operator, and self-confirmation is never enough.
  const attestation = getResultAttestation({ matchUp, policy: getLadderPolicy({ ...params, structure }) });
  if (attestation.validated) matchUp.matchUpStatus = COMPLETED;

  return { ...SUCCESS, ...(attestation.validated ? {} : { info: attestation.reason }) };
}

/**
 * A participant contests the reported score.
 *
 * The matchUp goes back to `AWAITING_RESULT` if it had been completed, because a disputed result is
 * not a result. Nothing here resolves the dispute — that is D9, and an unresolved dispute simply
 * does not move the ladder.
 */
export function disputeResult(
  params: ReportArgs & { participantId: string; disputedAt: string; reason?: string },
): ResultType {
  const resolved: any = resolve(params);
  if (resolved.error) return resolved;
  const { matchUp } = resolved;
  const { participantId, disputedAt, reason } = params;

  if (!participantId || !disputedAt) return { error: INVALID_VALUES, info: 'participantId and disputedAt required' };
  if (![AWAITING_RESULT, COMPLETED].includes(matchUp.matchUpStatus)) {
    return { error: INVALID_VALUES, info: `nothing to dispute on a ${matchUp.matchUpStatus} matchUp` };
  }
  if (!sideParticipantIds(matchUp).includes(participantId)) {
    return { error: INVALID_VALUES, info: 'only a participant in the matchUp may dispute its result' };
  }

  addTimeItem({
    timeItem: { itemType: RESULT_DISPUTED, itemValue: { participantId, reason }, itemDate: disputedAt },
    element: matchUp,
  });
  matchUp.matchUpStatus = AWAITING_RESULT;

  return { ...SUCCESS };
}
