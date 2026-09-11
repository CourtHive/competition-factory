import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { isString } from '@Tools/objects';

// constants and types
import { INVALID_PARTICIPANT_IDS, INVALID_STRUCTURE, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  DRAW_DEFINITION,
  INVALID,
  MATCHUP_ID,
  ROUND_NUMBER,
  STRUCTURE_ID,
  VALIDATE,
} from '@Constants/attributeConstants';

type AdHocPositionSwapArgs = {
  drawDefinition: DrawDefinition;
  tournamentRecord: Tournament;
  participantIds: string[];
  structureId: string;
  roundNumber: number;
  event: Event;
};

export function adHocPositionSwap(params: AdHocPositionSwapArgs): ResultType {
  const paramsCheck = checkRequiredParameters(params, [
    { [DRAW_DEFINITION]: true, [STRUCTURE_ID]: true, [MATCHUP_ID]: true },
    { [ROUND_NUMBER]: true, [VALIDATE]: (value) => Number.isInteger(value) && value > 0 },
    {
      [VALIDATE]: (value) => Array.isArray(value) && value.length === 2 && value.every(isString),
      [INVALID]: INVALID_PARTICIPANT_IDS,
      participantIds: true,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const { drawDefinition, structureId, tournamentRecord, event } = params;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  if (!isAdHoc({ structure })) return { error: INVALID_STRUCTURE };

  const hasParticipant = (matchUp) =>
    matchUp.sides?.map((side) => side.participantId).some((id) => params.participantIds.includes(id));
  const targetRoundNumber = (matchUp) => matchUp.roundNumber === params.roundNumber;
  const noScoreValue = (matchUp) => !checkScoreHasValue(matchUp);

  // find two unscored rounds matchUps that contain the two participants being swapped
  const targetMatchUps = (structure?.matchUps ?? [])
    .filter(targetRoundNumber)
    .filter(noScoreValue)
    .filter(hasParticipant);
  if (targetMatchUps.length !== 2) return { error: INVALID_PARTICIPANT_IDS };

  // swap the participantIds in the two matchUps
  for (const matchUp of targetMatchUps) {
    const side = matchUp?.sides?.find((side: any) => params.participantIds.includes(side?.participantId));
    if (side) {
      const swappedParticipantId = params.participantIds.find((id) => id !== side?.participantId);
      side.participantId = swappedParticipantId;

      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
        event,
        drawDefinition,
        matchUp,
      });
    }
  }

  modifyDrawNotice({ drawDefinition, structureIds: [structureId] });

  return { ...SUCCESS };
}
