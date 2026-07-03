import { allocateTeamMatchUpCourts } from '@Mutate/matchUps/schedule/allocateTeamMatchUpCourts';
import { matchUpAllocatedCourts } from '@Query/matchUp/courtAllocations';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { assignMatchUpCourt } from '@Mutate/matchUps/schedule/assignMatchUpCourt';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// contstants
import { MISSING_DRAW_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORDS } from '@Constants/attributeConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

export function removeMatchUpCourtAssignment(params) {
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORDS]: true }]);
  if (paramsCheck.error) return paramsCheck;
  const { removePriorValues, tournamentRecords, tournamentId, courtDayDate, matchUpId, courtId, drawId } = params;

  const tournamentRecord = tournamentRecords[tournamentId];
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { drawDefinition, event } = findDrawDefinition({
    tournamentRecord,
    drawId,
  });
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const result = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (result.error) return result;

  if (result?.matchUp?.matchUpType === TEAM_MATCHUP) {
    // Read the current allocation first-class-aware (NATIVE stores schedule.allocatedCourts with
    // no timeItem mirror), then rewrite the remaining courts through the mode-aware allocation
    // writer. The prior path read + wrote timeItems only, so in NATIVE it crashed on
    // `undefined.filter` and never updated the first-class value.
    const { allocatedCourts } = matchUpAllocatedCourts({ matchUp: result.matchUp });
    const remainingCourtIds = courtId
      ? (allocatedCourts ?? []).filter((court) => court.courtId !== courtId).map((court) => court.courtId)
      : [];

    return allocateTeamMatchUpCourts({
      // empty → undefined clears the allocation entirely (removes the last / all courts)
      courtIds: remainingCourtIds.length ? remainingCourtIds : undefined,
      removePriorValues,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
    });
  } else {
    return assignMatchUpCourt({
      tournamentRecord,
      drawDefinition,
      courtDayDate,
      courtId: '',
      matchUpId,
    });
  }
}
