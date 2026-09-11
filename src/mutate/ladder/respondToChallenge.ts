import { applyLapseConsequence } from '@Mutate/ladder/applyLapseConsequence';
import { getChallengeState } from '@Query/ladder/getChallengeState';
import { getLadderPolicy } from '@Query/ladder/getLadderPolicy';
import { addTimeItem } from '@Mutate/timeItems/addTimeItem';
import { isLadder } from '@Query/drawDefinition/isLadder';

import { INVALID_VALUES, MATCHUP_NOT_FOUND, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { CHALLENGE_ACCEPTED, CHALLENGE_DECLINED, EXPIRED, PENDING } from '@Constants/ladderConstants';
import { CHALLENGED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type RespondArgs = {
  /** The instant of the response, and the instant expiry is judged against. */
  respondedAt: string;
  tournamentRecord?: any;
  drawDefinition: any;
  matchUpId: string;
  event?: any;
};

function resolve(params: RespondArgs) {
  const { drawDefinition, matchUpId } = params;
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (!isLadder(drawDefinition.drawType)) return { error: INVALID_VALUES, info: 'requires a LADDER drawType' };
  if (!params.respondedAt) return { error: INVALID_VALUES, info: 'respondedAt is required' };

  for (const structure of drawDefinition.structures ?? []) {
    const matchUp = structure.matchUps?.find((m: any) => m.matchUpId === matchUpId);
    if (matchUp) return { matchUp, structure };
  }
  return { error: MATCHUP_NOT_FOUND };
}

/**
 * The defender accepts: the challenge becomes an ordinary fixture to be played.
 *
 * Refuses an EXPIRED challenge. Expiry is derived, not stored, so this is judged against
 * `respondedAt` — accepting late is a real thing a club will try, and the answer must not depend
 * on when a background job happened to run.
 */
export function acceptChallenge(params: RespondArgs): ResultType {
  const resolved: any = resolve(params);
  if (resolved.error) return resolved;
  const { matchUp, structure } = resolved;

  if (matchUp.matchUpStatus !== CHALLENGED) {
    return { error: INVALID_VALUES, info: `matchUp is ${matchUp.matchUpStatus}, not ${CHALLENGED}` };
  }

  const policy = getLadderPolicy({ ...params, structure });
  const { state } = getChallengeState({ matchUp, policy, asOf: params.respondedAt });
  if (state === EXPIRED) return { error: INVALID_VALUES, info: 'challenge has expired' };
  if (state !== PENDING) return { error: INVALID_VALUES, info: `challenge is already ${state}` };

  addTimeItem({
    timeItem: { itemType: CHALLENGE_ACCEPTED, itemValue: true, itemDate: params.respondedAt },
    element: matchUp,
  });
  matchUp.matchUpStatus = TO_BE_PLAYED;

  return { ...SUCCESS };
}

/**
 * The defender declines.
 *
 * The decline is RECORDED FIRST and the lapse evaluated after, so that this decline is among the
 * ones counted. That ordering is the whole reason a threshold policy works: evaluating before
 * recording would always be one behind, and a defender would get one free decline forever.
 *
 * This is the moment D8 names — a challenge resolving — so it is where a lapse consequence is
 * applied. Nothing sweeps in the background looking for offenders.
 */
export function declineChallenge(
  params: RespondArgs,
): ResultType & { applied?: boolean; consequence?: string; lapseCount?: number } {
  const resolved: any = resolve(params);
  if (resolved.error) return resolved;
  const { matchUp, structure } = resolved;

  if (matchUp.matchUpStatus !== CHALLENGED) {
    return { error: INVALID_VALUES, info: `matchUp is ${matchUp.matchUpStatus}, not ${CHALLENGED}` };
  }

  const policy = getLadderPolicy({ ...params, structure });
  const { state } = getChallengeState({ matchUp, policy, asOf: params.respondedAt });
  if (state !== PENDING && state !== EXPIRED) return { error: INVALID_VALUES, info: `challenge is already ${state}` };

  addTimeItem({
    timeItem: { itemType: CHALLENGE_DECLINED, itemValue: true, itemDate: params.respondedAt },
    element: matchUp,
  });

  // The challenger of THIS challenge is who a forfeited position goes to — only the challenge in
  // front of us knows that, which is why the consequence is applied here rather than anywhere else.
  const consequence = applyLapseConsequence({
    challengerParticipantId: matchUp.sides?.[0]?.participantId,
    participantId: matchUp.sides?.[1]?.participantId,
    appliedAt: params.respondedAt,
    ...params,
    structure,
  });
  if (consequence.error) return consequence;

  return {
    ...SUCCESS,
    applied: !!consequence.applied,
    ...(consequence.consequence ? { consequence: consequence.consequence } : {}),
    lapseCount: consequence.count,
  };
}
