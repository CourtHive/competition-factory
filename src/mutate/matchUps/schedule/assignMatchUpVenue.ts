import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { findVenue } from '@Query/venues/findVenue';

// constants and types
import { MISSING_TOURNAMENT_RECORD, MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { ASSIGN_VENUE } from '@Constants/timeItemConstants';

type AssignMatchUpVenueArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  removePriorValues?: boolean;
  disableNotice?: boolean;
  matchUpId: string;
  venueId?: string;
};
export function assignMatchUpVenue({
  removePriorValues,
  tournamentRecords,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  matchUpId,
  venueId,
}: AssignMatchUpVenueArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  if (venueId) {
    const result = findVenue({
      tournamentRecords,
      tournamentRecord,
      venueId,
    });
    if (result.error) return result;
  }

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'venueId',
    itemType: ASSIGN_VENUE,
    value: venueId,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
  });
}
