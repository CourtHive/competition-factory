import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { ALLOCATE_COURTS } from '@Constants/timeItemConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import {
  INVALID_MATCHUP,
  INVALID_VALUES,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

// allocate courts for a TEAM matchUp
type AllocateTeamMatchUpCourtsArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  removePriorValues?: boolean;
  disableNotice?: boolean;
  courtDayDate?: string;
  matchUpId: string;
  courtIds: any;
};
export function allocateTeamMatchUpCourts({
  removePriorValues,
  tournamentRecords,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  courtDayDate,
  matchUpId,
  courtIds,
}: AllocateTeamMatchUpCourtsArgs) {
  if (!tournamentRecord && !tournamentRecords) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  const result = findDrawMatchUp({
    drawDefinition,
    matchUpId,
  });
  if (result.error) return result;
  if (result?.matchUp?.matchUpType !== TEAM_MATCHUP) return { error: INVALID_MATCHUP };

  const validCourtIds =
    courtIds === undefined ||
    (Array.isArray(courtIds) && courtIds.length && courtIds.every((id) => typeof id === 'string'));
  if (!validCourtIds) return { error: INVALID_VALUES, context: { courtIds } };

  let itemValue;
  if (courtIds) {
    const tournaments: any = tournamentRecords
      ? tournamentRecords
      : tournamentRecord && {
          [tournamentRecord.tournamentId]: tournamentRecord,
        };
    const result = getVenuesAndCourts({
      tournamentRecords: tournaments,
    });
    if (result.error) return result;

    const specifiedCourts = result.courts?.filter((court) => courtIds.includes(court.courtId));
    if (specifiedCourts?.length !== courtIds.length) {
      return { error: INVALID_VALUES, context: { courtIds } };
    }
    itemValue = specifiedCourts?.map((court) => ({
      venueId: court.venueId,
      courtId: court.courtId,
    }));
  }

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'allocatedCourts',
    itemType: ALLOCATE_COURTS,
    itemDate: courtDayDate,
    value: itemValue,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
  });
}
