import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';

// constants
import { INVALID_DRAW_TYPE, INVALID_VALUES, MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DRAW_DEFINITION, MATCHUP_ID, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type RemoveMatchUpSideParticipantArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  sideNumber?: number;
  matchUpId: string;
  event?: Event;
};

export function removeMatchUpSideParticipant(params: RemoveMatchUpSideParticipantArgs) {
  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true, [DRAW_DEFINITION]: true, [MATCHUP_ID]: true },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const { drawDefinition, sideNumber, matchUpId, event } = params;

  if (sideNumber && ![1, 2].includes(sideNumber)) return { error: INVALID_VALUES, sideNumber };

  const { matchUp, structure } = findDrawMatchUp({
    drawDefinition,
    matchUpId,
    event,
  });

  if (!matchUp) return { error: MATCHUP_NOT_FOUND };
  if (!isAdHoc({ structure })) return { error: INVALID_DRAW_TYPE };

  matchUp.sides?.forEach((side) => {
    if (!sideNumber || side.sideNumber === sideNumber) delete side.participantId;
  });

  modifyMatchUpNotice({
    tournamentId: params.tournamentRecord?.tournamentId,
    context: 'assignSideParticipant',
    drawDefinition,
    matchUp,
    event,
  });

  return { ...SUCCESS };
}
