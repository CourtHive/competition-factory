import { timeZoneFromVenues } from '@Query/tournaments/getTournamentTimeZone';
import type { Venue } from '@Types/tournamentTypes';
import { recordedStatusCode } from '../../scoreEntryState/statusCodes';
import { resultEntryContext } from '@Query/matchUp/resultEntryContext';

import type { MatchUpAction } from '@Query/drawDefinition/positionActions/actionPolicyUtils';
import { INVALID_VALUES, NOT_IMPLEMENTED } from '@Constants/errorConditionConstants';
import { CLEAR_SCORE, SCORE } from '@Constants/matchUpActionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Only called with the context already used to decide validActions. Both slice-one audiences see the same fields. */
export function operatorMatchDto(
  audience: unknown,
  match: HydratedMatchUp | undefined,
  actions: MatchUpAction[],
  drawMatches: HydratedMatchUp[],
  venues: Venue[] | undefined,
) {
  if (audience !== 'recorder' && audience !== 'director') return { error: INVALID_VALUES };
  if (
    !match ||
    match.collectionId ||
    match.tieMatchUps?.length ||
    !['SINGLES', 'DOUBLES'].includes(match.matchUpType ?? '')
  )
    return { error: NOT_IMPLEMENTED };
  const venueId = match.schedule?.venueId;
  const venue = venueId && venues?.find((item) => item.venueId === venueId);
  const scoreAction = actions.find((action) => action.type === SCORE);
  let resultIntent: 'correct-result' | 'record-initial-result' | undefined;
  if (scoreAction) resultIntent = resultEntryContext(match).requiresReview ? 'correct-result' : 'record-initial-result';
  const winner = match.sides?.find((side) => side.sideNumber === match.winningSide)?.participantId;
  const target = match.winnerMatchUpId && drawMatches.find((item) => item.matchUpId === match.winnerMatchUpId);
  return {
    operatorMatch: {
      audience,
      venueTimeZone: venue ? timeZoneFromVenues([venue]).timeZone : undefined,
      matchUpId: text(match.matchUpId),
      matchUpFormat: text(match.matchUpFormat),
      matchUpStatus: text(match.matchUpStatus),
      winningSide: number(match.winningSide),
      clearable: actions.some((action) => action.type === CLEAR_SCORE),
      matchUpStatusCode: text(match.matchUpStatusCode) ?? recordedStatusCode(match),
      sideStatusCodes: { 1: text(match.sideStatusCodes?.[1]), 2: text(match.sideStatusCodes?.[2]) },
      sides: (match.sides ?? []).map((side) => ({
        sideNumber: number(side.sideNumber),
        name: text(side.participant?.participantName),
      })),
      sets: (match.score?.sets ?? []).map((set) => ({
        setNumber: number(set.setNumber),
        side1Score: number(set.side1Score),
        side2Score: number(set.side2Score),
        side1TiebreakScore: number(set.side1TiebreakScore),
        side2TiebreakScore: number(set.side2TiebreakScore),
        winningSide: number(set.winningSide),
        side1PointScore: number(set.side1PointScore) ?? text(set.side1PointScore),
        side2PointScore: number(set.side2PointScore) ?? text(set.side2PointScore),
      })),
      resultIntent,
      disabledMatchUpStatuses:
        scoreAction?.disabledMatchUpStatuses?.filter((status) => typeof status === 'string') ?? [],
      advancement:
        winner && target && target.sides?.some((side) => side.participantId === winner)
          ? {
              matchUpId: text(target.matchUpId),
              roundName: text(target.roundName),
              roundNumber: number(target.roundNumber),
            }
          : undefined,
    },
  };
}
