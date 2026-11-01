import { firstClassGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { getCompetitionDateRange } from '@Query/tournaments/getCompetitionDateRange';
import { getProfileRoundKey } from '@Query/matchUps/scheduling/schedulingUtils';
import { eventDateResolver } from '@Query/events/eventPlaysOnDate';
import { setSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { extractDate, isValidDateString, sameDay } from '@Tools/dateTime';
import { decorateResult } from '@Functions/global/decorateResult';
import { isObject } from '@Tools/objects';

// constants and types
import type { ProfileRound, ProfileVenue } from '@Query/matchUps/scheduling/schedulingUtils';
import { EVENT_DATE_INACTIVE, EXISTING_ROUND, INVALID_DATE } from '@Constants/errorConditionConstants';
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
    // a profile date is stored as its calendar day (§ 3.8 rule 7), compared as text with the tournament's dates
    const day = extractDate(scheduleDate);
    if ((startDate && day < extractDate(startDate)) || (endDate && day > extractDate(endDate))) {
      return { error: INVALID_DATE };
    }

    dateProfile = { scheduleDate: day, venues: [] };
    schedulingProfile.push(dateProfile);
  }

  // a round profiled at a second venue on the same date would be scheduled once per venue
  const roundKey = getProfileRoundKey(round);
  const atOtherVenue = dateProfile.venues.some(
    (venue: ProfileVenue) =>
      venue.venueId !== venueId &&
      venue.rounds.some((existingRound: ProfileRound) => getProfileRoundKey(existingRound) === roundKey),
  );
  if (atOtherVenue)
    return decorateResult({ result: { error: EXISTING_ROUND }, info: 'round is profiled at another venue', stack });

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

  // a round profiled on a day its event does not play is added, and warned about (CA 2026-11-01)
  const verdict =
    round?.tournamentId &&
    eventDateResolver(tournamentRecords)({
      tournamentId: round.tournamentId,
      date: extractDate(scheduleDate),
      eventId: round.eventId,
    });
  if (verdict && !verdict.plays) {
    const warning = {
      ...EVENT_DATE_INACTIVE,
      scheduledDate: extractDate(scheduleDate),
      reason: verdict.reason,
      eventId: round.eventId,
      roundKey,
    };
    return { ...SUCCESS, warnings: [warning] };
  }

  return { ...SUCCESS };
}
