import { getParticipantReachability } from '@Mutate/matchUps/schedule/scheduleMatchUps/getParticipantReachability';
import { v2Scheduler } from '@Mutate/matchUps/schedule/schedulers/v2Scheduler/v2Scheduler';
import { clearScheduledMatchUps } from '@Mutate/matchUps/schedule/clearScheduledMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { getPersonRequests } from '@Query/matchUps/scheduling/getPersonRequests';
import { getMatchUpDailyLimits } from '@Query/extensions/getMatchUpDailyLimits';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { getSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { scheduleProfileVNext } from './pipeline/scheduleProfile';
import { extractDate, isValidDateString } from '@Tools/dateTime';

// constants and types
import { ARRAY, OF_TYPE, SCHEDULE_DATES, TOURNAMENT_RECORDS, VALIDATE } from '@Constants/attributeConstants';
import { NO_VALID_DATES } from '@Constants/errorConditionConstants';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type ScheduleProfileRoundsArgs = {
  checkPotentialRequestConflicts?: boolean;
  tournamentRecords: TournamentRecords;
  scheduleCompletedMatchUps?: boolean;
  excludeNoDateCompleted?: boolean;
  clearScheduleDates?: boolean | string[];
  excludePriorDates?: boolean;
  scheduleDates?: string[];
  periodLength?: number;
  useGarman?: boolean;
  courtIds?: string[];
  dryRun?: boolean;
  /**
   * @deprecated since 7.15.0; removed at the next major. Selects `v2Scheduler`, a court-and-time scheduler that is not
   * Garman scheduling and not grid scheduling (that is `scheduleProfileGrid`). Omit it to use the default scheduler.
   */
  pro?: boolean;
};
/**
 * The profile scheduler: the scheduling pipeline's view → plan → write (`pipeline/`, SCHEDULING_PIPELINE_VNEXT.md § 7).
 * The deprecated `pro` flag alone still takes the older path below, to `v2Scheduler`.
 */
export function scheduleProfileRounds(params: ScheduleProfileRoundsArgs) {
  if (!params?.pro) return scheduleProfileVNext(params);

  const {
    checkPotentialRequestConflicts = true,
    excludeNoDateCompleted = true,
    scheduleCompletedMatchUps,
    excludePriorDates = true,
    clearScheduleDates,
    scheduleDates = [],
    tournamentRecords,
    periodLength,
    useGarman,
    courtIds,
    dryRun,
  } = params;

  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORDS]: true },
    {
      [VALIDATE]: (value) => !value || (Array.isArray(value) && value.every(isValidDateString)),
      [SCHEDULE_DATES]: false,
      [OF_TYPE]: ARRAY,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const result = getSchedulingProfile({ tournamentRecords });
  if (result.error) return result;

  if (!result.schedulingProfile.length) return { ...SUCCESS };

  const {
    modifications: schedulingProfileModifications,
    issues: schedulingProfileIssues = [],
    schedulingProfile = [],
  } = result;

  // round robin structures contain other structures and the scheduler
  // needs to reference the containing structure by contained structureIds
  const containedStructureIds = Object.assign(
    {},
    ...Object.values(tournamentRecords).map(
      (tournamentRecord) => getContainedStructures({ tournamentRecord }).containedStructures,
    ),
  );

  // ensure all scheduleDates are valid date strings
  const validScheduleDates = new Set(
    scheduleDates
      .map((scheduleDate) => {
        if (!isValidDateString(scheduleDate)) return undefined;
        return extractDate(scheduleDate);
      })
      .filter(Boolean),
  );

  // filter out any invalid scheduleDates in schedulingProfile
  const profileDates = schedulingProfile
    .map((dateSchedulingProfile) => dateSchedulingProfile.scheduleDate)
    .map((scheduleDate) => isValidDateString(scheduleDate) && extractDate(scheduleDate))
    .filter((scheduleDate) => scheduleDate && (!scheduleDates.length || validScheduleDates.has(scheduleDate)));

  // if no valid profileDates remain throw an error
  if (!profileDates.length) {
    return { error: NO_VALID_DATES };
  }

  // if array of clearScheduleDates, clear all matchUps on scheduledDates
  if (clearScheduleDates && !dryRun) {
    const scheduledDates = Array.isArray(clearScheduleDates) ? clearScheduleDates : [];
    clearScheduledMatchUps({ tournamentRecords, scheduledDates });
  }

  const allCourts = getVenuesAndCourts({
    ignoreDisabled: false,
    tournamentRecords,
  }).courts as any[];

  const courts = Array.isArray(courtIds)
    ? allCourts.filter((court: any) => courtIds.includes(court.courtId))
    : allCourts;

  const { matchUps } = allCompetitionMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES, DOUBLES] },
    afterRecoveryTimes: true,
    nextMatchUps: true,
    tournamentRecords,
  });

  // build up a map of all matchUp dependencies
  const { matchUpDependencies } = getMatchUpDependencies({
    includeParticipantDependencies: true,
    tournamentRecords,
    matchUps,
  });

  // who can play each matchUp, across dates: the basis of recovery bookings and daily limits
  const participantReachability = getParticipantReachability({ matchUpDependencies, matchUps: matchUps ?? [] });

  const { matchUpDailyLimits, dailyLimitOverrides } = getMatchUpDailyLimits({ tournamentRecords });

  const { personRequests } = getPersonRequests({
    requestType: DO_NOT_SCHEDULE,
    tournamentRecords,
  });

  // filter out any dates in schedulingProfile which have been excluded and sort
  const dateSchedulingProfiles = schedulingProfile
    .filter((dateschedulingProfile) => {
      const scheduleDate = extractDate(dateschedulingProfile?.scheduleDate);
      return profileDates.includes(scheduleDate);
    })
    .sort((a, b) => {
      return new Date(a.scheduleDate).getTime() - new Date(b.scheduleDate).getTime();
    });

  const schedulingParams = {
    schedulingProfileModifications,
    checkPotentialRequestConflicts,
    scheduleCompletedMatchUps,
    excludeNoDateCompleted,
    schedulingProfileIssues,
    dateSchedulingProfiles,
    participantReachability,
    containedStructureIds,
    matchUpDependencies,
    matchUpDailyLimits,
    dailyLimitOverrides,
    excludePriorDates,
    clearScheduleDates,
    tournamentRecords,
    schedulingProfile,
    personRequests,
    periodLength,
    useGarman,
    matchUps,
    dryRun,
    courts,
  };

  // v2Scheduler (held pending its assessment) still types clearScheduleDates as boolean;
  // the shared helpers it passes the value to accept the documented string[] form
  return v2Scheduler(schedulingParams as Parameters<typeof v2Scheduler>[0]);
}
