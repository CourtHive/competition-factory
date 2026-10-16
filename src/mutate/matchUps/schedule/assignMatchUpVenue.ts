import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { findVenue } from '@Query/venues/findVenue';
import { addVenue } from '@Mutate/venues/addVenue';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

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
    // a venue only a linked tournament holds is copied onto this record, which later hydration reads it from (the
    // linked record's own object is never shared between two records). findVenue did this itself until P54, a query
    // that wrote; as there, a copy refused (an invalid dateAvailability) leaves the assignment to go ahead
    const onRecord = tournamentRecord.venues?.some((venue) => venue.venueId === venueId);
    if (!onRecord && result.venue) addVenue({ tournamentRecord, venue: makeDeepCopy(result.venue, false, true) });
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
