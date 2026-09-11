import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { assignMatchUpVenue } from '@Mutate/matchUps/schedule/assignMatchUpVenue';
import { findCourt } from '@Query/venues/findCourt';

// constants and types
import { ErrorType, MISSING_MATCHUP_ID, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { ASSIGN_COURT } from '@Constants/timeItemConstants';

type AssignMatchUpCourtArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  removePriorValues?: boolean;
  disableNotice?: boolean;
  courtDayDate: string;
  matchUpId: string;
  courtId: string;
};
export function assignMatchUpCourt({
  removePriorValues,
  tournamentRecords,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  courtDayDate,
  matchUpId,
  courtId, // not required as "unasigning" court can be achieved by setting value to `undefined`
}: AssignMatchUpCourtArgs): { error?: ErrorType; success?: boolean } {
  if (!tournamentRecord && !tournamentRecords) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  if (courtId) {
    const result = findCourt({
      tournamentRecords,
      tournamentRecord,
      courtId,
    });
    if (result.error) return result;
    const venueId = result.venue?.venueId;

    assignMatchUpVenue({
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      disableNotice,
      matchUpId,
      venueId,
    });
  }

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'courtId',
    itemType: ASSIGN_COURT,
    itemDate: courtDayDate,
    value: courtId,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
  });
}
