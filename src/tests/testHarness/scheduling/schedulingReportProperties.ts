import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { placedMatchUpIds } from './schedulingProperties';
import { extractDate } from '@Tools/dateTime';

// constants
import { BYE, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { TEAM } from '@Constants/matchUpTypes';

/**
 * Golden corpus § 5, second slice: what a scheduling call's REPORT (its corpus `value`, `schedulingReport.ts`) must say
 * about the records before and after it. Clean room, like `schedulingProperties.ts`: the profile's rounds are read
 * from the record and resolved to matchUps here, not through the scheduler's own `getScheduledRoundsDetails`.
 *
 * - `SCHEDULE_ACCOUNTED`: every matchUp of a profiled round on a scheduled date that could be scheduled (not a BYE, not
 *   completed, not a TEAM dual, whose tie matchUps are what is scheduled) and is unplaced after the call is reported
 *   under SOME reason. A matchUp the scheduler silently dropped
 *   (S1: one venue's unscheduled matchUps overwritten by the next) fails it.
 * - `SCHEDULE_REPORT_TRUE`: the report's `scheduledMatchUpIds` are exactly the matchUps the call placed, date by date.
 * - `SCHEDULE_RERUN_STABLE`: a scheduling call identical to the step before it places nothing.
 */

export const SCHEDULE_ACCOUNTED = 'SCHEDULE_ACCOUNTED';
export const SCHEDULE_REPORT_TRUE = 'SCHEDULE_REPORT_TRUE';
export const SCHEDULE_RERUN_STABLE = 'SCHEDULE_RERUN_STABLE';

export const SCHEDULING_REPORT_PROPERTIES = [SCHEDULE_ACCOUNTED, SCHEDULE_REPORT_TRUE, SCHEDULE_RERUN_STABLE] as const;

export type SchedulingReportViolation = {
  property: (typeof SCHEDULING_REPORT_PROPERTIES)[number];
  matchUpId?: string;
  detail: string;
};

const NOT_SCHEDULABLE = new Set<string>([BYE, ...completedMatchUpStatuses]);

/** timed (the profile scheduler), or on a day's court grid (the grid scheduler, which places by row and sets no time) */
const isPlaced = (matchUp: any) =>
  !!matchUp.schedule?.scheduledTime ||
  (!!matchUp.schedule?.scheduledDate && matchUp.schedule?.courtOrder !== undefined);
const REASONS = [
  'notScheduledMatchUpIds',
  'noTimeMatchUpIds',
  'overLimitMatchUpIds',
  'dependencyDeferredMatchUpIds',
  'recoveryTimeDeferredMatchUpIds',
  'requestConflicts',
];

type Report = { [key: string]: { [date: string]: string[] } | undefined };

/** the dates a profile call schedules: the profile's dates, narrowed to `scheduleDates` when the call names any */
function scheduledProfileDates(profile: any[], scheduleDates?: string[]): Set<string> {
  const named = new Set((scheduleDates ?? []).map((date) => extractDate(date)).filter(Boolean));
  return new Set(
    profile
      .map((dateProfile) => extractDate(dateProfile?.scheduleDate))
      .filter((date) => date && (!named.size || named.has(date))),
  );
}

/** the matchUps of one profiled round: its draw and round, in its structure or one it contains, then its segment */
function roundMatchUps(round: any, matchUps: any[]): any[] {
  const inRound = matchUps
    .filter(
      (matchUp) =>
        matchUp.drawId === round.drawId &&
        matchUp.roundNumber === round.roundNumber &&
        (matchUp.structureId === round.structureId || matchUp.containerStructureId === round.structureId) &&
        (!round.matchUpIds?.length || round.matchUpIds.includes(matchUp.matchUpId)),
    )
    .sort((a, b) => (a.roundPosition ?? 0) - (b.roundPosition ?? 0));
  const { segmentNumber, segmentsCount } = round.roundSegment ?? {};
  if (!segmentNumber || !segmentsCount || round.matchUpIds?.length || segmentsCount >= inRound.length) return inRound;
  const size = inRound.length / segmentsCount;
  return inRound.slice(size * (segmentNumber - 1), size * segmentNumber);
}

const reportedIds = (report: Report, keys: string[]) =>
  new Set(keys.flatMap((key) => Object.values(report[key] ?? {}).flat()));

/** SCHEDULE_REPORT_TRUE: reported as scheduled exactly when placed, date by date, for the matchUps this record holds */
function reportTrue(report: Report, before: any, after: any, afterById: Map<string, any>): SchedulingReportViolation[] {
  const violations: SchedulingReportViolation[] = [];
  const reportedScheduled = report.scheduledMatchUpIds ?? {};
  const reportedSet = new Set(Object.values(reportedScheduled).flat());
  for (const matchUpId of placedMatchUpIds(before, after))
    if (!reportedSet.has(matchUpId))
      violations.push({ property: SCHEDULE_REPORT_TRUE, matchUpId, detail: 'placed but not reported as scheduled' });
  for (const [date, ids] of Object.entries(reportedScheduled))
    for (const matchUpId of ids) {
      // a report covers every tournament loaded; a matchUp another record holds is that record's to check
      if (!afterById.has(matchUpId)) continue;
      const scheduledDate = extractDate(afterById.get(matchUpId)?.schedule?.scheduledDate);
      if (date && scheduledDate !== date)
        violations.push({
          property: SCHEDULE_REPORT_TRUE,
          matchUpId,
          detail: `reported scheduled on ${date}, stored on ${scheduledDate || 'no date'}`,
        });
    }
  return violations;
}

/** SCHEDULE_ACCOUNTED: a profile call reports a reason for every schedulable profiled matchUp it left untimed */
function accounted(report: Report, params: any, before: any, matchUps: any[]): SchedulingReportViolation[] {
  // getSchedulingProfile refuses without tournamentRecords: asked with the record alone it returned no profile, and this
  // property passed every call it was asked of (caught by its falsification test)
  const tournamentRecords = { [before.tournamentId]: before };
  const profile = getSchedulingProfile({ tournamentRecords, tournamentRecord: before }).schedulingProfile ?? [];
  const dates = scheduledProfileDates(profile, params?.scheduleDates);
  const reasons = reportedIds(report, REASONS);
  const violations: SchedulingReportViolation[] = [];
  for (const dateProfile of profile) {
    if (!dates.has(extractDate(dateProfile?.scheduleDate))) continue;
    const rounds = (dateProfile.venues ?? []).flatMap((venue: any) => venue.rounds ?? []);
    for (const matchUp of rounds.flatMap((round: any) => roundMatchUps(round, matchUps))) {
      if (NOT_SCHEDULABLE.has(matchUp.matchUpStatus) || matchUp.matchUpType === TEAM || isPlaced(matchUp)) continue;
      if (reasons.has(matchUp.matchUpId)) continue;
      violations.push({
        property: SCHEDULE_ACCOUNTED,
        matchUpId: matchUp.matchUpId,
        detail: `profiled on ${extractDate(dateProfile.scheduleDate)}, left unplaced, and no reason reported`,
      });
    }
  }
  return violations;
}

/** the report properties of one scheduling call; a dry run writes nothing by design and is not asked */
export function checkSchedulingReport({
  report,
  params,
  before,
  after,
}: {
  report?: Report;
  params?: any;
  before: any;
  after: any;
}): SchedulingReportViolation[] {
  if (!report || params?.dryRun) return [];
  const afterById = new Map(
    (allTournamentMatchUps({ tournamentRecord: after, inContext: true }).matchUps ?? []).map((m: any) => [
      m.matchUpId,
      m,
    ]),
  );
  return [
    ...reportTrue(report, before, after, afterById),
    ...accounted(report, params, before, [...afterById.values()]),
  ];
}

/** SCHEDULE_RERUN_STABLE, asked of a step whose directive repeats the step before it */
export function checkRerunStable({ before, after }: { before: any; after: any }): SchedulingReportViolation[] {
  return placedMatchUpIds(before, after).map((matchUpId) => ({
    property: SCHEDULE_RERUN_STABLE,
    detail: 'a repeated scheduling call placed or moved a matchUp',
    matchUpId,
  }));
}
