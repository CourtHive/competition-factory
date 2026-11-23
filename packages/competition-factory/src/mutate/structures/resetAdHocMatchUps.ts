import { removeMatchUpSideParticipant } from '@Mutate/matchUps/sides/removeMatchUpSideParticipant';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resetMatchUpLineUps } from '@Mutate/matchUps/lineUps/resetMatchUpLineUps';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { getAdHocStructureDetails } from './getAdHocStructureDetails';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { resetScorecard } from '@Mutate/matchUps/resetScorecard';

// constants and types
import { ARRAY, DRAW_DEFINITION, EVENT, MATCHUP_IDS, MESSAGE, OF_TYPE, ONE_OF } from '@Constants/attributeConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';
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

export function resetAdHocMatchUps(params: ResetAdHocMatchUps): ResultType {
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

    const result = setMatchUpStatus({
      tournamentRecord,
      drawDefinition,
      matchUpId,
      event,
      // the canonical blank: status, score, codes and exit provenance together (as removeMatchUpOutcome does)
      outcome: toBePlayed,
    });
    if (result.error) return result;

    if (params.removeAssignments) {
      const removeResult = removeMatchUpSideParticipant({ ...params, matchUpId });
      if (removeResult.error) return removeResult;
    }
  }

  return { ...SUCCESS };
}
