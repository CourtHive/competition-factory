import { auditAutoScheduling } from '@Mutate/matchUps/schedule/schedulers/auditAutoScheduling';
import { clearScheduledMatchUps } from '@Mutate/matchUps/schedule/clearScheduledMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { disableNotifications, enableNotifications } from '@Global/state/globalState';
import { computeRoundSchedulePcts } from './roundSchedulePcts';
import { planPlayedOrderRefusal } from './playedOrderGate';
import { isValidDateString } from '@Tools/dateTime';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { buildSchedulingView } from './view';
import { planSchedule } from './plan';
import { nowMs } from '@Tools/clock';
import { writePlan } from './write';

// constants and types
import { ARRAY, OF_TYPE, SCHEDULE_DATES, TOURNAMENT_RECORDS, VALIDATE } from '@Constants/attributeConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * The profile scheduler end to end: view → plan → write. `scheduleProfileRounds` routes every call here but the
 * deprecated `pro` one. It replaced v1's timed scheduler after a differential held its records and its result to v1's,
 * call for call; the corpus manifest now pins them (SCHEDULING_PIPELINE_VNEXT.md § 7).
 */
type ScheduleProfileVNextArgs = {
  checkPotentialRequestConflicts?: boolean;
  tournamentRecords: TournamentRecords;
  clearScheduleDates?: boolean | string[];
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
  // the profile is validated once, by the first view (one that needs repair is refused); an empty profile schedules
  // nothing
  const firstView = buildSchedulingView(params);
  if ('error' in firstView) return firstView;
  if (!firstView.schedulingProfile.length) return { ...SUCCESS };

  // a date to clear is planned on a working copy cleared first (notifications held), so the plan sees the date empty
  // and a refusal leaves the stored records untouched; a dry run plans the same way, so it previews what a run does
  const scheduledDates = Array.isArray(clearScheduleDates) ? clearScheduleDates : [];
  const working = clearScheduleDates ? clearedWorkingCopy(tournamentRecords, scheduledDates) : tournamentRecords;
  const view = clearScheduleDates ? buildSchedulingView({ ...params, tournamentRecords: working }) : firstView;
  if ('error' in view) return view;

  // the plan, then the guard over all of it, before anything is written (CA 2026-10-23)
  const plan = planSchedule({ ...params, view });
  const refusal = planPlayedOrderRefusal({ plan, view });
  if (refusal) return refusal;

  if (clearScheduleDates && !dryRun) clearScheduledMatchUps({ tournamentRecords, scheduledDates });
  const { scheduledMatchUpIds, noTimeMatchUpIds } = dryRun
    ? { scheduledMatchUpIds: plan.scheduledMatchUpIds, noTimeMatchUpIds: plan.noTimeMatchUpIds }
    : writePlan({ plan, view, tournamentRecords });

  view.dateSchedulingProfiles.forEach((dateSchedulingProfile, index) =>
    computeRoundSchedulePcts({
      scheduledMatchUpIds,
      dateSchedulingProfile,
      scheduleDate: view.dates[index].scheduleDate,
    }),
  );

  // the original form of the date strings
  const profileDates = view.dateSchedulingProfiles.map(({ scheduleDate }) => scheduleDate);
  auditAutoScheduling({
    tournamentRecords,
    autoSchedulingAudit: {
      overLimitMatchUpIds: plan.overLimitMatchUpIds,
      schedulingProfile: view.schedulingProfile,
      requestConflicts: plan.requestConflicts,
      timeStamp: nowMs(),
      scheduledMatchUpIds,
      scheduledDates: profileDates,
      noTimeMatchUpIds,
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
    playedOrderDeferredMatchUpIds: plan.playedOrderDeferredMatchUpIds,
    noFormatMatchUpIds: plan.noFormatMatchUpIds,
    scheduledDates: profileDates,
    noTimeMatchUpIds,
  };
}

/** the records with the dates cleared, on a copy: what the plan reads when a call clears dates first */
function clearedWorkingCopy(tournamentRecords: TournamentRecords, scheduledDates: string[]): TournamentRecords {
  const working: TournamentRecords = makeDeepCopy(tournamentRecords, false, true);
  disableNotifications();
  try {
    clearScheduledMatchUps({ tournamentRecords: working, scheduledDates });
  } finally {
    enableNotifications();
  }
  return working;
}
