import { removeMatchUpSideParticipant } from '@Mutate/matchUps/sides/removeMatchUpSideParticipant';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { resetMatchUpLineUps } from '@Mutate/matchUps/lineUps/resetMatchUpLineUps';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { getAdHocStructureDetails } from './getAdHocStructureDetails';
import { resetScorecard } from '@Mutate/matchUps/resetScorecard';

// constants
import { ARRAY, DRAW_DEFINITION, EVENT, MATCHUP_IDS, MESSAGE, OF_TYPE, ONE_OF } from '@Constants/attributeConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';

type ResetAdHocMatchUps = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  removeAssignments?: boolean;
  roundNumbers?: number[];
  matchUpIds?: string[];
  structureId?: string;
  event: Event;
};

export function resetAdHocMatchUps(params: ResetAdHocMatchUps) {
  const paramsCheck = checkRequiredParameters(params, [
    { [DRAW_DEFINITION]: true, [EVENT]: true },
    {
      [ONE_OF]: { [MATCHUP_IDS]: false, roundNumbers: false },
      [MESSAGE]: 'At least one must be provided',
      [OF_TYPE]: ARRAY,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const structureResult = getAdHocStructureDetails(params);
  if (structureResult.error) return structureResult;
  const { matchUpIds } = structureResult;

  const isTeam = isMatchUpEventType(TEAM_EVENT)(params.event.eventType);
  const { tournamentRecord, drawDefinition, event } = params;

  for (const matchUpId of matchUpIds) {
    if (isTeam) {
      const result = resetScorecard({
        tiebreakReset: true,
        tournamentRecord,
        drawDefinition,
        matchUpId,
        event,
      });
      if (result.error) return result;

      if (params.removeAssignments) {
        const resetLineUpResult = resetMatchUpLineUps({
          inheritance: false,
          drawDefinition,
          matchUpId,
        });
        if (resetLineUpResult.error) return resetLineUpResult;
      }
    }

    const result = setMatchUpState({
      winningSide: undefined,
      removeScore: true,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      event,
    });
    if (result.error) return result;

    if (params.removeAssignments) {
      const removeResult = removeMatchUpSideParticipant({ ...params, matchUpId });
      if (removeResult.error) return removeResult;
    }
  }

  return { ...SUCCESS };
}
