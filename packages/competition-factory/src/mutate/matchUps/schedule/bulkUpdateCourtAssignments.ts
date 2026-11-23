import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { assignMatchUpCourt } from './assignMatchUpCourt';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { ARRAY, INVALID, OF_TYPE, TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_DRAW_DEFINITION,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  UNABLE_TO_ASSIGN_COURT,
} from '@Constants/errorConditionConstants';

type BulkUpdateCourtAssignmentsParams = {
  tournamentRecords: TournamentRecords;
  courtAssignments: any[];
  courtDayDate: string;
};

export function bulkUpdateCourtAssignments(params: BulkUpdateCourtAssignmentsParams) {
  const { courtDayDate } = params;
  const paramsCheck = checkRequiredParameters(params, [
    { courtAssignments: true, [OF_TYPE]: ARRAY, [INVALID]: MISSING_VALUE },
    { [TOURNAMENT_RECORDS]: true },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const tournamentMap = params.courtAssignments.reduce((tournamentMap, assignment) => {
    const { tournamentId } = assignment;
    if (!tournamentMap[tournamentId]) tournamentMap[tournamentId] = [];
    tournamentMap[tournamentId].push(assignment);
    return tournamentMap;
  }, {});

  let error;
  const tournamentIds = Object.keys(tournamentMap);
  tournamentIds.every((tournamentId) => {
    const tournamentRecord = params[TOURNAMENT_RECORDS][tournamentId];
    if (!tournamentRecord) {
      error = { error: MISSING_TOURNAMENT_RECORD };
      return false;
    }
    const drawMap = tournamentMap[tournamentId].reduce((drawMap, assignment) => {
      const { drawId } = assignment;
      if (!drawMap[drawId]) drawMap[drawId] = [];
      drawMap[drawId].push(assignment);
      return drawMap;
    }, {});
    const drawIds = Object.keys(drawMap);
    drawIds.every((drawId) => {
      const { drawDefinition } = findEvent({ tournamentRecord, drawId });
      if (!drawDefinition) {
        error = { error: MISSING_DRAW_DEFINITION };
        return false;
      }
      drawMap[drawId].every((assignment) => {
        const { matchUpId, courtId } = assignment;
        const result = assignMatchUpCourt({
          tournamentRecord,
          drawDefinition,
          courtDayDate,
          matchUpId,
          courtId,
        });
        if (result.success) {
          return result?.success;
        } else {
          error = { error: UNABLE_TO_ASSIGN_COURT };
        }
        return undefined;
      });

      return true;
    });
    return undefined;
  });

  return error || SUCCESS;
}
