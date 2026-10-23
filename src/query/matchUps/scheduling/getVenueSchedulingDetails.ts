import { processAlreadyScheduledMatchUps } from '@Mutate/matchUps/schedule/schedulers/processAlreadyScheduledMatchUps';
import type { ParticipantReachability } from '@Mutate/matchUps/schedule/scheduleMatchUps/getParticipantReachability';
import { getMatchUpsToSchedule } from '@Mutate/matchUps/schedule/scheduleMatchUps/getMatchUpsToSchedule';
import { generateScheduleTimes } from '@Generators/scheduling/utils/generateScheduleTimes';
import { getScheduledRoundsDetails } from './getScheduledRoundsDetails';
import { getGroupedRounds } from './getGroupedRounds';
import { extractDate } from '@Tools/dateTime';

// types
import { ScheduleTimesResult } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type GetVenueSchedulingDetailsArgs = {
  matchUpPotentialParticipantIds: { [key: string]: string[] };
  individualParticipantProfiles: { [key: string]: any };
  tournamentRecords: { [key: string]: Tournament };
  matchUpScheduleTimes: { [key: string]: string };
  matchUpNotBeforeTimes: { [key: string]: any };
  matchUpDependencies: { [key: string]: any };
  participantReachability: ParticipantReachability;
  excludeNoDateCompleted?: boolean;
  containedStructureIds: string[];
  clearScheduleDates?: boolean | string[];
  excludePriorDates?: boolean;
  matchUps: HydratedMatchUp[];
  periodLength?: number;
  scheduleDate: string;
  useGarman?: boolean;
  courts: any[]; // scheduling information; not an actualy court
  venues: any[]; // scheduling information; not an actualy venue
};

export function getVenueSchedulingDetails({
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  excludeNoDateCompleted,
  containedStructureIds,
  matchUpNotBeforeTimes,
  matchUpScheduleTimes,
  matchUpDependencies,
  participantReachability,
  excludePriorDates,
  clearScheduleDates,
  tournamentRecords,
  periodLength,
  scheduleDate,
  useGarman,
  matchUps,
  courts,
  venues,
}: GetVenueSchedulingDetailsArgs): {
  venueScheduledRoundDetails: { [key: string]: any };
  allDateScheduledByeMatchUpDetails: {
    tournamentId: string;
    matchUpId: string;
  }[];
  allDateScheduledMatchUpIds: string[];
  allDateMatchUpIds: string[];
} {
  const venueScheduledRoundDetails = {};

  // checking that matchUpDependencies is scoped to only those matchUps that are already or are to be scheduled on the same date
  const allDateScheduledMatchUpIds: string[] = [];
  const allDateScheduledByeMatchUpDetails: {
    tournamentId: string;
    matchUpId: string;
  }[] = [];
  const allDateMatchUpIds: string[] = [];

  // first pass through all venues is to build up an array of all matchUpIds in the schedulingProfile for current scheduleDate
  for (const venue of venues) {
    const { rounds = [], venueId } = venue; // rounds derives from dateSchedulingProfile
    const { scheduledRoundsDetails, greatestAverageMinutes, orderedMatchUpIds, minutesMap } = getScheduledRoundsDetails(
      {
        containedStructureIds,
        tournamentRecords,
        periodLength,
        matchUps,
        rounds,
      },
    );

    // a matchUp belongs to the first venue that profiles it on the date: a round profiled at two
    // venues must not be scheduled once per venue
    const claimedMatchUpIds = new Set(allDateMatchUpIds);
    const venueMatchUpIds = (orderedMatchUpIds ?? []).filter((matchUpId) => !claimedMatchUpIds.has(matchUpId));
    allDateMatchUpIds.push(...venueMatchUpIds);

    const { groupedRounds } = getGroupedRounds({
      scheduledRoundsDetails,
      greatestAverageMinutes,
      garmanSinglePass: true,
    });

    let dateScheduledMatchUpIds;
    let scheduleTimes: ScheduleTimesResult[] | undefined = [];

    // courts arrive already narrowed by any courtIds the caller selected
    const venueCourts = courts.filter((court) => court.venueId === venueId);

    if (useGarman) {
      // determines court availability taking into account already scheduled matchUps on the scheduleDate
      // optimization to pass already retrieved competitionMatchUps to avoid refetch (requires refactor)
      // on first call pass in the averageMatchUpMiutes of first round to be scheduled
      ({ scheduleTimes, dateScheduledMatchUpIds } = generateScheduleTimes({
        averageMatchUpMinutes: groupedRounds[0]?.averageMinutes,
        scheduleDate: extractDate(scheduleDate),
        courtIds: venueCourts.map((court) => court.courtId),
        venueIds: [venue.venueId],
        clearScheduleDates,
        tournamentRecords,
        periodLength,
        matchUps,
      }));
    }

    const processResult = processAlreadyScheduledMatchUps({
      matchUpPotentialParticipantIds,
      individualParticipantProfiles,
      excludeNoDateCompleted,
      dateScheduledMatchUpIds,
      greatestAverageMinutes,
      matchUpNotBeforeTimes,
      matchUpScheduleTimes,
      excludePriorDates,
      matchUpDependencies,
      participantReachability,
      clearScheduleDates,
      tournamentRecords,
      scheduleDate,
      minutesMap,
      matchUps,
    });

    ({ dateScheduledMatchUpIds } = processResult);
    const dateScheduledMatchUps = processResult;
    const { byeScheduledMatchUpDetails, clearDate } = processResult;
    if (byeScheduledMatchUpDetails?.length) allDateScheduledByeMatchUpDetails.push(...byeScheduledMatchUpDetails);

    const { matchUpsToSchedule, matchUpMap } = getMatchUpsToSchedule({
      matchUpPotentialParticipantIds,
      orderedMatchUpIds: venueMatchUpIds,
      dateScheduledMatchUpIds,
      matchUpNotBeforeTimes,
      matchUpScheduleTimes,
      clearDate,
      matchUps,
    });

    venueScheduledRoundDetails[venueId] = {
      previousRemainingScheduleTimes: [], // keep track of sheduleTimes not used on previous iteration
      courtsCount: venueCourts.length,
      greatestAverageMinutes,
      scheduledRoundsDetails,
      dateScheduledMatchUps,
      matchUpsToSchedule,
      scheduleTimes,
      groupedRounds,
      venueCourts,
      minutesMap,
      matchUpMap,
    };

    if (!clearScheduleDates) {
      allDateScheduledMatchUpIds.push(...dateScheduledMatchUpIds);
    }
  }

  return {
    allDateScheduledByeMatchUpDetails,
    allDateScheduledMatchUpIds,
    venueScheduledRoundDetails,
    allDateMatchUpIds,
  };
}
