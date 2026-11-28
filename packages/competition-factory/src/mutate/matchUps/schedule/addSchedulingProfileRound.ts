import { firstClassGroupLeafOrExtension } from '@Helpers/extensions/firstClassGroupLeafOrExtension';
import { getCompetitionDateRange } from '@Query/tournaments/getCompetitionDateRange';
import { getProfileRoundKey } from '@Query/matchUps/scheduling/schedulingUtils';
import { planSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { extractDate, isValidDateString, sameDay } from '@Tools/dateTime';
import { eventDateResolver } from '@Query/events/eventPlaysOnDate';
import { decorateResult } from '@Functions/global/decorateResult';
import { isObject } from '@Tools/objects';

// constants and types
import { EVENT_DATE_INACTIVE, EXISTING_ROUND, INVALID_DATE } from '@Constants/errorConditionConstants';
import type { ProfileRound, ProfileVenue } from '@Query/matchUps/scheduling/schedulingUtils';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import type { ResultType, ResultWarning } from '@Types/factoryTypes';

// Every rule is decided before the profile is written: the date and its range, the round at another venue, the round
// already at this venue, and the validity of the whole proposed profile (its draw, structure and round references).
// A refusal leaves the stored profile as it was; an accepted round is appended where the planner found its place.
export function addSchedulingProfileRound({ tournamentRecords, scheduleDate, venueId, round }): ResultType {
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
  const storedDateProfile = schedulingProfile.find((dateProfile) => sameDay(scheduleDate, dateProfile.scheduleDate));

  if (!storedDateProfile) {
    const { startDate, endDate } = getCompetitionDateRange({
      tournamentRecords,
    });
    // a profile date is stored as its calendar day (§ 3.8 rule 7), compared as text with the tournament's dates
    const day = extractDate(scheduleDate);
    if ((startDate && day < extractDate(startDate)) || (endDate && day > extractDate(endDate))) {
      return { error: INVALID_DATE };
    }
  }
  const dateProfile = storedDateProfile ?? { scheduleDate: extractDate(scheduleDate), venues: [] };

  // a round profiled at a second venue on the same date would be scheduled once per venue
  const roundKey = getProfileRoundKey(round);
  const atOtherVenue = dateProfile.venues.some(
    (venue: ProfileVenue) =>
      venue.venueId !== venueId &&
      venue.rounds.some((existingRound: ProfileRound) => getProfileRoundKey(existingRound) === roundKey),
  );
  if (atOtherVenue)
    return decorateResult({ result: { error: EXISTING_ROUND }, info: 'round is profiled at another venue', stack });

  const storedVenue = dateProfile.venues.find((venue) => venue.venueId === venueId);
  const venueOnDate = storedVenue ?? { venueId, rounds: [] };

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

  // the profile as it would be stored, validated before any of it is: the stored date and venue entries are not written
  const proposedVenue = { ...venueOnDate, rounds: [...venueOnDate.rounds, round] };
  const proposedVenues = storedVenue
    ? dateProfile.venues.map((venue) => (venue === storedVenue ? proposedVenue : venue))
    : [...dateProfile.venues, proposedVenue];
  const proposedDate = { ...dateProfile, venues: proposedVenues };
  const proposedProfile = storedDateProfile
    ? schedulingProfile.map((entry) => (entry === storedDateProfile ? proposedDate : entry))
    : [...schedulingProfile, proposedDate];

  // a NEW date outside the competition's dates is refused above; a date already in the profile is not re-judged,
  // and whatever the save reports of the profile's other dates is passed on
  const planned = planSchedulingProfile({
    schedulingProfile: proposedProfile,
    storedProfile: schedulingProfile,
    tournamentRecords,
  });
  if (!('commit' in planned)) return planned;

  // a round profiled on a day its event does not play is added, and warned about, beside whatever
  // setSchedulingProfile warns of the profile's other dates
  const warnings = [...((planned.result as ResultType).warnings ?? [])];
  const verdict =
    round?.tournamentId &&
    eventDateResolver(tournamentRecords)({
      tournamentId: round.tournamentId,
      date: extractDate(scheduleDate),
      eventId: round.eventId,
    });
  if (verdict && !verdict.plays) {
    warnings.push({
      ...EVENT_DATE_INACTIVE,
      scheduledDate: extractDate(scheduleDate),
      reason: verdict.reason,
      eventId: round.eventId,
      roundKey,
    } as ResultWarning);
  }

  // commit: the stored profile takes the round in place, as it always did, and is then saved to every record
  if (!storedDateProfile) schedulingProfile.push(dateProfile);
  if (!storedVenue) dateProfile.venues.push(venueOnDate);
  venueOnDate.rounds.push(round);
  planned.commit();

  return warnings.length ? { ...SUCCESS, warnings } : { ...SUCCESS };
}
