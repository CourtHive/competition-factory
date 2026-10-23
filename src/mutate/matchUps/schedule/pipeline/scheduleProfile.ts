import { auditAutoScheduling } from '@Mutate/matchUps/schedule/schedulers/auditAutoScheduling';
import { clearScheduledMatchUps } from '@Mutate/matchUps/schedule/clearScheduledMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { computeRoundSchedulePcts } from './roundSchedulePcts';
import { isValidDateString } from '@Tools/dateTime';
import { buildSchedulingView } from './view';
import { planSchedule } from './plan';
import { nowMs } from '@Tools/clock';
import { writePlan } from './write';

// constants and types
import { ARRAY, OF_TYPE, SCHEDULE_DATES, TOURNAMENT_RECORDS, VALIDATE } from '@Constants/attributeConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * vNext end to end: view → plan → write, for the calls v1's `scheduleProfileRounds` takes with its default (timed)
 * scheduler, returning what it returns. Not yet an engine method: it is reached only by the differential
 * (`schedulingPipeline.test.ts`), which holds its records and its result to v1's, call for call, until the switch
 * (SCHEDULING_PIPELINE_VNEXT.md § 7).
 */
type ScheduleProfileVNextArgs = {
  checkPotentialRequestConflicts?: boolean;
  tournamentRecords: TournamentRecords;
  clearScheduleDates?: boolean | string[];
  scheduleCompletedMatchUps?: boolean;
  excludeNoDateCompleted?: boolean;
  excludePriorDates?: boolean;
  scheduleDates?: string[];
  periodLength?: number;
  courtIds?: string[];
  dryRun?: boolean;
};

export function scheduleProfileVNext(params: ScheduleProfileVNextArgs) {
  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORDS]: true },
    {
      [VALIDATE]: (value: unknown) => !value || (Array.isArray(value) && value.every(isValidDateString)),
      [SCHEDULE_DATES]: false,
      [OF_TYPE]: ARRAY,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const { tournamentRecords, clearScheduleDates, dryRun } = params;
  // the profile is validated (and repaired) once, by the first view; an empty profile schedules nothing
  const firstView = buildSchedulingView(params);
  if ('error' in firstView) return { error: firstView.error };
  if (!firstView.schedulingProfile.length) return { ...SUCCESS };

  // a date cleared is cleared before the matchUps are read, so the plan sees the date empty; the dates are validated
  // first, so a call refused for its dates clears nothing
  if (clearScheduleDates && !dryRun) {
    const scheduledDates = Array.isArray(clearScheduleDates) ? clearScheduleDates : [];
    clearScheduledMatchUps({ tournamentRecords, scheduledDates });
  }
  const view = clearScheduleDates && !dryRun ? buildSchedulingView(params) : firstView;
  if ('error' in view) return { error: view.error };

  const plan = planSchedule({ ...params, view });
  const { scheduledMatchUpIds, noTimeMatchUpIds } = dryRun
    ? { scheduledMatchUpIds: plan.scheduledMatchUpIds, noTimeMatchUpIds: plan.noTimeMatchUpIds }
    : writePlan({ plan, view });

  view.dateSchedulingProfiles.forEach((dateSchedulingProfile, index) =>
    computeRoundSchedulePcts({
      scheduledMatchUpIds,
      dateSchedulingProfile,
      scheduleDate: view.dates[index].scheduleDate,
    }),
  );

  // the original form of the date strings
  const scheduledDates = view.dateSchedulingProfiles.map(({ scheduleDate }) => scheduleDate);
  auditAutoScheduling({
    tournamentRecords,
    autoSchedulingAudit: {
      overLimitMatchUpIds: plan.overLimitMatchUpIds,
      schedulingProfile: view.schedulingProfile,
      requestConflicts: plan.requestConflicts,
      timeStamp: nowMs(),
      scheduledMatchUpIds,
      noTimeMatchUpIds,
      scheduledDates,
    },
  });

  return {
    ...SUCCESS,
    schedulingProfileModifications: firstView.schedulingProfileModifications,
    recoveryTimeDeferredMatchUpIds: plan.recoveryTimeDeferredMatchUpIds,
    dependencyDeferredMatchUpIds: plan.dependencyDeferredMatchUpIds,
    schedulingProfileIssues: firstView.schedulingProfileIssues,
    dateSchedulingProfiles: view.dateSchedulingProfiles,
    overLimitMatchUpDetails: plan.overLimitMatchUpDetails,
    scheduleTimesRemaining: plan.scheduleTimesRemaining,
    matchUpScheduleTimes: plan.matchUpScheduleTimes,
    skippedScheduleTimes: plan.skippedScheduleTimes,
    overLimitMatchUpIds: plan.overLimitMatchUpIds,
    requestConflicts: plan.requestConflicts,
    scheduledMatchUpIds,
    noTimeMatchUpIds,
    scheduledDates,
  };
}
