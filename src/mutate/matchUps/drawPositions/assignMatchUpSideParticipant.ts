import { buildIndividualIdsMap, idsShareIndividual } from '@Query/participants/individualParticipantIds';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { completedMatchUpStatuses, DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  SHARED_INDIVIDUAL_PARTICIPANT,
  EXISTING_ROUND_PARTICIPANT,
  CANNOT_REMOVE_PARTICIPANTS,
  INVALID_DRAW_TYPE,
  INVALID_PARTICIPANT_ID,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
} from '@Constants/errorConditionConstants';

type AssignMatchUpSideParticipantArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  participantId: string;
  sideNumber: number;
  matchUpId: string;
  event: Event;
};

// method only currently used for AD_HOC matchUps where there are no drawPositions
export function assignMatchUpSideParticipant({
  tournamentRecord,
  drawDefinition,
  participantId,
  sideNumber,
  matchUpId,
  event,
}: AssignMatchUpSideParticipantArgs): ResultType & { sidesSwapped?: boolean } {
  if (participantId && typeof participantId !== 'string') return { error: INVALID_PARTICIPANT_ID };
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  const noSideNumberProvided = sideNumber === undefined;
  if (noSideNumberProvided) sideNumber = 1;

  if (![1, 2].includes(sideNumber))
    return decorateResult({
      result: { error: INVALID_VALUES, context: { sideNumber } },
    });

  const { matchUp, structure } = findDrawMatchUp({
    drawDefinition,
    matchUpId,
    event,
  });

  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  const isAdHoc =
    !structure?.structures &&
    !(drawDefinition.drawType && !isAdHocType(drawDefinition.drawType)) &&
    !structure?.matchUps?.find(({ roundPosition }) => !!roundPosition);

  if (!isAdHoc) return { error: INVALID_DRAW_TYPE };

  // if no participantId / participant is being un-assigned, there cannot be a score or completed outcome
  if (
    !participantId &&
    (matchUp?.score?.scoreStringSide1 ||
      (matchUp?.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus)) ||
      (matchUp?.matchUpStatus && [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUp.matchUpStatus)))
  )
    return {
      error: CANNOT_REMOVE_PARTICIPANTS,
      info: 'matchUp has completed status or score',
    };

  const sharedIndividual = getOpposingSharedIndividual({
    tournamentRecord,
    participantId,
    sideNumber,
    matchUp,
  });
  if (sharedIndividual) {
    return decorateResult({ result: { error: SHARED_INDIVIDUAL_PARTICIPANT }, context: sharedIndividual });
  }

  const roundConflict = getRoundConflict({ tournamentRecord, participantId, structure, matchUp });
  if (roundConflict) {
    return decorateResult({ result: { error: EXISTING_ROUND_PARTICIPANT }, context: roundConflict });
  }

  if (matchUp) {
    matchUp.sides = [1, 2].map((currentSideNumber) => {
      const existingSide = matchUp.sides?.find((side) => side.sideNumber === currentSideNumber) ?? {
        sideNumber: currentSideNumber,
      };

      return sideNumber === currentSideNumber ? { ...existingSide, participantId } : existingSide;
    });

    // makes it possible to use this method with no sideNumber provided
    // each time a participant is assigned the sides are swapped
    if (noSideNumberProvided) {
      for (const side of matchUp.sides) {
        if (side.sideNumber) side.sideNumber = 3 - side.sideNumber;
      }
    }

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'assignSideParticipant',
      drawDefinition,
      matchUp,
      event,
    });
  }

  return { ...SUCCESS, sidesSwapped: noSideNumberProvided };
}

/**
 * A person cannot be on both sides of a matchUp.
 *
 * Returns the conflict when assigning `participantId` would place an individual opposite a
 * PAIR/TEAM they already belong to, and `undefined` when the assignment is legal.
 */
function getOpposingSharedIndividual({ tournamentRecord, participantId, sideNumber, matchUp }) {
  if (!participantId || !tournamentRecord) return undefined;

  const opposingSideNumber = sideNumber === 1 ? 2 : 1;
  const opposingParticipantId = matchUp?.sides?.find((side) => side.sideNumber === opposingSideNumber)?.participantId;
  if (!opposingParticipantId) return undefined;

  const individualIdsMap = buildIndividualIdsMap(tournamentRecord.participants);
  if (!idsShareIndividual(individualIdsMap, participantId, opposingParticipantId)) return undefined;

  return { participantId, opposingParticipantId };
}

/**
 * A person can play in only one matchUp per round.
 *
 * Returns the conflict when `participantId` — or a PAIR/TEAM sharing one of its individuals — already
 * occupies another matchUp in the target matchUp's round, and `undefined` when the assignment is legal.
 * The target matchUp itself is excluded: its opposing side is the both-sides guard's question, and
 * the side being assigned is being replaced.
 */
function getRoundConflict({ tournamentRecord, participantId, structure, matchUp }) {
  if (!participantId) return undefined;

  const roundMatchUps = (structure?.matchUps ?? []).filter(
    (roundMatchUp) => roundMatchUp.roundNumber === matchUp.roundNumber && roundMatchUp.matchUpId !== matchUp.matchUpId,
  );
  const individualIdsMap = buildIndividualIdsMap(tournamentRecord?.participants);

  for (const roundMatchUp of roundMatchUps) {
    for (const side of roundMatchUp.sides ?? []) {
      const roundParticipantId = side.participantId;
      if (roundParticipantId && idsShareIndividual(individualIdsMap, participantId, roundParticipantId)) {
        return {
          roundNumber: matchUp.roundNumber,
          matchUpId: roundMatchUp.matchUpId,
          roundParticipantId,
          participantId,
        };
      }
    }
  }

  return undefined;
}
