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
      completedMatchUpStatuses.includes(matchUp?.matchUpstatus) ||
      (matchUp?.matchUpStatus && [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUp.matchUpStatus)))
  )
    return {
      error: CANNOT_REMOVE_PARTICIPANTS,
      info: 'matchUp has completed status or score',
    };

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
    });
  }

  return { ...SUCCESS, sidesSwapped: noSideNumberProvided };
}
