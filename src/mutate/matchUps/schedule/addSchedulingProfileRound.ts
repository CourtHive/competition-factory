import { firstClassGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { getCompetitionDateRange } from '@Query/tournaments/getCompetitionDateRange';
import { setSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { decorateResult } from '@Functions/global/decorateResult';
import { isValidDateString, sameDay } from '@Tools/dateTime';
import { isObject } from '@Tools/objects';

// constants
import { EXISTING_ROUND, INVALID_DATE } from '@Constants/errorConditionConstants';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function addSchedulingProfileRound({ tournamentRecords, scheduleDate, venueId, round }) {
  if (!isValidDateString(scheduleDate)) {
    return { error: INVALID_DATE };
  }
  const stack = 'addSchedulingProfileRound';

  // CODES: prefer first-class scheduling.profile on any record; fall back to legacy extension
  const schedulingProfile =
    Object.values(tournamentRecords ?? {})
      .map((record: any) =>
        firstClassGroupLeafOrExtension({
          element: record,
          groupAttribute: 'scheduling',
          leafAttribute: 'profile',
          name: SCHEDULING_PROFILE,
        }),
      )
      .find((p) => p !== undefined) ?? [];
  let dateProfile = schedulingProfile.find((dateProfile) => sameDay(scheduleDate, dateProfile.scheduleDate));

  if (!dateProfile) {
    const { startDate, endDate } = getCompetitionDateRange({
      tournamentRecords,
    });
    const dateObject = new Date(scheduleDate);
    if ((startDate && dateObject < new Date(startDate)) || (endDate && dateObject > new Date(endDate))) {
      return { error: INVALID_DATE };
    }

    dateProfile = { scheduleDate, venues: [] };
    schedulingProfile.push(dateProfile);
  }

  let venueOnDate = dateProfile.venues.find((venue) => venue.venueId === venueId);

  if (!venueOnDate) {
    venueOnDate = { venueId, rounds: [] };
    dateProfile.venues.push(venueOnDate);
  }

  // ensure round is not already present
  const excludeKeys = ['notBeforeTime'];
  const hashRound = (r) =>
    Object.keys(r)
      .filter((key) => !excludeKeys.includes(key))
      .sort()
      .map((k) => (isObject(r[k]) ? hashRound(r[k]) : r[k]))
      .flat()
      .join('|');

  const roundExists = venueOnDate.rounds.find((existingRound) => hashRound(existingRound) === hashRound(round));
  if (roundExists) return decorateResult({ result: { error: EXISTING_ROUND }, stack });
  venueOnDate.rounds.push(round);

  const result = setSchedulingProfile({ tournamentRecords, schedulingProfile });
  if (result.error) return result;

  return { ...SUCCESS };
}
