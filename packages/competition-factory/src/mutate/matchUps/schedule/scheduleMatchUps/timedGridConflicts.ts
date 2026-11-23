import { proConflicts } from '@Mutate/matchUps/schedule/schedulers/proScheduler/proConflicts';
import type { ConflictIssue } from '@Mutate/matchUps/schedule/pipeline/gridConflicts';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';

// types
import { Tournament } from '@Types/tournamentTypes';

type TimedGridConflictsArgs = {
  tournamentRecords: { [key: string]: Tournament };
  /** matchUps a scheduler has just timed that were already on the date's court grid (a court or a court order) */
  griddedMatchUpIds: string[];
  scheduleDate: string;
};

/**
 * The court grid's conflicts that name a matchUp a scheduler has just timed. A matchUp placed on the grid without a
 * time is timed like any other (scheduling-pipeline.md § 6 rule 1, § 4 step 2); its new time can contradict its court
 * order or another matchUp on its court, which no slot arithmetic can always avoid, so the conflicts are reported.
 */
export function timedGridConflicts({
  tournamentRecords,
  griddedMatchUpIds,
  scheduleDate,
}: TimedGridConflictsArgs): ConflictIssue[] {
  if (!griddedMatchUpIds.length) return [];
  const timed = new Set(griddedMatchUpIds);
  const matchUps =
    allCompetitionMatchUps({
      matchUpFilters: { scheduledDate: scheduleDate },
      nextMatchUps: true,
      tournamentRecords,
      inContext: true,
    }).matchUps ?? [];
  const result = proConflicts({ tournamentRecords, matchUps });
  if ('error' in result) return [];
  return result.rowIssues
    .flat()
    .filter(({ matchUpId, issueIds }) => timed.has(matchUpId) || issueIds?.some((id) => timed.has(id)));
}

/** whether a matchUp's schedule places it on the court grid */
export function onTheGrid(schedule?: { courtId?: string; courtOrder?: any }): boolean {
  return !!(schedule?.courtId || schedule?.courtOrder);
}
